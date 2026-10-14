// Explicit env paths; all writes stay in a disposable project test directory.
const { test }=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const { spawnSync }=require('node:child_process')
const { randomUUID,createHash }=require('node:crypto')
const { execute }=require('./finance-receiver.cjs')
const { loadFinanceModule }=require('./finance-module-loader.cjs')
const { FinanceWorkbookXml }=loadFinanceModule('src/lib/finance/workbook-xml.ts')
const { previewReturn }=loadFinanceModule('src/lib/finance/sync.ts')
const root=path.resolve(__dirname,'..')
const source=process.env.FINANCE_READ_ONLY_WORKBOOK,dbSource=process.env.FINANCE_READ_ONLY_DB,python=process.env.FINANCE_TEST_PYTHON,assets=process.env.FINANCE_ASSET_ROOT
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
test('real workbook copy completes receiver, official sync/validate, receipt and immutable replay',{skip:!source||!dbSource||!python||!assets},async()=>{
  const original=fs.readFileSync(source),dbHash=digest(fs.readFileSync(dbSource))
  const folder=fs.mkdtempSync(path.join(root,'.finance-receiver-test-'))
  try{
    const workbook=path.join(folder,'帳本副本.xlsx'),db=path.join(folder,'副本.db'),changes=path.join(folder,'changes.json'),receipt=path.join(folder,'results.json')
    fs.writeFileSync(workbook,original)
    const snapshot=spawnSync(python,['-c','import sqlite3,sys,pathlib; s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',dbSource,db],{encoding:'utf8',windowsHide:true});assert.equal(snapshot.status,0,snapshot.stderr)
    const batch={schemaVersion:2,fileType:'finance-changes',appId:'riyue',datasetId:randomUUID(),batchId:randomUUID(),exportedAt:new Date().toISOString(),timezone:'Asia/Taipei',records:[{entityType:'expense',payload:{expenseDate:'2026-11-25',categoryCode:'food',item:'僅測試副本-'+randomUUID(),personalAmount:'12.34',paymentMethod:'cash',accountId:'cash',isFixed:false,notes:'測試副本，不得寫入正式帳本',creditCardTransactionClientId:null},clientId:randomUUID(),changeId:randomUUID(),clientRevision:1,baseMasterRevision:null,baseMasterHash:null,operation:'upsert',clientCreatedAt:new Date().toISOString(),clientUpdatedAt:new Date().toISOString(),deletedAt:null}]}
    fs.writeFileSync(changes,JSON.stringify(batch))
    const args={mode:'preview',workbook,changes,'dataset-id':batch.datasetId}
    const before=digest(fs.readFileSync(workbook)),preview=await execute(args);assert.equal(preview.canApply,true);assert.equal(digest(fs.readFileSync(workbook)),before)
    const applyArgs={...args,mode:'apply','confirm-hash':preview.previewHash,'writer-confirmed':true,python,'sync-script':path.join(assets,'scripts/finance/sync_excel_to_sqlite.py'),'validate-script':path.join(assets,'scripts/finance/validate_finance_data.py'),db,receipt}
    const applied=await execute(applyArgs);assert.equal(applied.status,'committed',JSON.stringify(applied))
    const returned=JSON.parse(fs.readFileSync(receipt,'utf8'));assert.equal(returned.schemaVersion,2);assert.equal(returned.results[0].canonicalPayload.accountId,'cash')
    const local=batch.records.map(row=>({...row,id:row.clientId,revision:1,masterRevision:null,masterHash:null,serverShadow:null}))
    assert.equal(previewReturn(batch,returned,local).conflict,false)
    const bytes=fs.readFileSync(workbook),doc=await FinanceWorkbookXml.open(bytes);assert.equal(doc.rows('支出明細').filter(row=>row.values['項目']===batch.records[0].payload.item).length,1)
    const nextPreview=await execute(args);assert.equal(nextPreview.replayed,true);const replay=await execute({...applyArgs,'confirm-hash':nextPreview.previewHash});assert.equal(replay.replayed,true);assert.deepEqual(fs.readFileSync(workbook),bytes)
    const income={...batch,batchId:randomUUID(),records:[{...batch.records[0],clientId:randomUUID(),changeId:randomUUID(),entityType:'income',payload:{receivedDate:'2026-11-25',incomeType:'other',item:'僅副本收入測試',amount:'56.78',accountId:'cathay',isRecurring:false,notes:'測試副本'}}]}
    fs.writeFileSync(changes,JSON.stringify(income));const incomePreview=await execute(args);assert.equal(incomePreview.canApply,true)
    const incomeApplied=await execute({...applyArgs,'confirm-hash':incomePreview.previewHash,receipt:path.join(folder,'income-result.json')});assert.equal(incomeApplied.status,'committed',JSON.stringify(incomeApplied))
    const incomeDoc=await FinanceWorkbookXml.open(fs.readFileSync(workbook));assert.equal(incomeDoc.rows('收入明細').length,1);assert.equal(incomeDoc.rows('月收支').find(row=>row.values['月份']==='2026-11').values['其他收入'],56.78)
    const cardId=randomUUID(),expenseId=randomUUID(),movementId=randomUUID(),meta=batch.records[0]
    const paired={...batch,batchId:randomUUID(),records:[
      {...meta,clientId:cardId,changeId:randomUUID(),entityType:'credit_card_transaction',payload:{cardId:'CUBE-9539',purchaseDate:'2026-11-24',postingDate:null,consumptionDate:'2026-11-25',statementMonth:'2026-11',purpose:'僅副本刷卡測試',usageDate:null,usageHours:null,grossAmount:'100.00',reimbursementReceivedAmount:'20.00',pointsOffsetAmount:'0.00',personalAmount:'80.00',status:'settled',expenseClientId:expenseId,notes:'測試副本'}},
      {...meta,clientId:expenseId,changeId:randomUUID(),payload:{...meta.payload,item:'僅副本刷卡測試',personalAmount:'80.00',paymentMethod:'credit_card',accountId:null,creditCardTransactionClientId:cardId}},
      {...meta,clientId:movementId,changeId:randomUUID(),entityType:'cash_movement',payload:{movementDate:'2026-11-25',accountId:'cathay',movementType:'credit_card_payment',amount:'100.00',balanceAfter:null,cardId:'CUBE-9539',statementMonth:'2026-11',notes:'測試副本'}}
    ]}
    fs.writeFileSync(changes,JSON.stringify(paired));const pairedPreview=await execute(args);assert.equal(pairedPreview.canApply,true,JSON.stringify(pairedPreview))
    const pairedApplied=await execute({...applyArgs,'confirm-hash':pairedPreview.previewHash,receipt:path.join(folder,'paired-result.json')});assert.equal(pairedApplied.status,'committed',JSON.stringify(pairedApplied))
    const pairedDoc=await FinanceWorkbookXml.open(fs.readFileSync(workbook));assert.equal(pairedDoc.rows('月收支').find(row=>row.values['月份']==='2026-11').values['變動支出'],92.34)
    assert.deepEqual(fs.readFileSync(source),original,'formal Excel bytes unchanged');assert.equal(digest(fs.readFileSync(dbSource)),dbHash,'formal DB bytes unchanged')
    console.log(JSON.stringify({copyRoundTrip:'passed',schemaVersion:2,entities:['cash_expense','income','settled_card_pair','cash_movement'],officialSyncAndValidate:'ok',formalWorkbookUnchanged:true,formalDatabaseUnchanged:true}))
  }finally{if(path.dirname(folder)===root&&path.basename(folder).startsWith('.finance-receiver-test-')&&!fs.lstatSync(folder).isSymbolicLink())fs.rmSync(folder,{recursive:true,force:true})}
})
