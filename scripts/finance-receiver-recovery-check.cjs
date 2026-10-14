// Fault injection uses a fictional workbook and local fake Python validators only.
const { test }=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const { randomUUID }=require('node:crypto')
const ExcelJS=require('exceljs')
const { execute }=require('./finance-receiver.cjs')
const python=process.env.FINANCE_TEST_PYTHON
const root=path.resolve(__dirname,'..')
async function setup(mode) {
  const folder=fs.mkdtempSync(path.join(root,'.finance-recovery-test-'))
  const book=new ExcelJS.Workbook()
  book.addWorksheet('支出明細').addRow(['日期','月份','類別','項目','金額','支付方式','是否固定支出','備註','資料ID','寫入日期'])
  const month=book.addWorksheet('月收支')
  month.addRow(['月份','月初帳戶餘額','薪水收入','其他收入','總收入','固定支出','變動支出','投資轉出','投資轉入','總支出','月末帳戶餘額','本月淨存款','是否超支'])
  month.addRow(['2026-10',null,0,0,0,0,0,0,0,0,null,0,'否'])
  const source=Buffer.from(await book.xlsx.writeBuffer()),workbook=path.join(folder,'test.xlsx'),changes=path.join(folder,'changes.json')
  fs.writeFileSync(workbook,source)
  const batch={schemaVersion:2,fileType:'finance-changes',appId:'riyue',datasetId:randomUUID(),batchId:randomUUID(),exportedAt:new Date().toISOString(),timezone:'Asia/Taipei',records:[{entityType:'expense',payload:{expenseDate:'2026-10-14',categoryCode:'food',item:'故障注入測試',personalAmount:'10.00',paymentMethod:'cash',accountId:'cash',isFixed:false,notes:null,creditCardTransactionClientId:null},clientId:randomUUID(),changeId:randomUUID(),clientRevision:1,baseMasterRevision:null,baseMasterHash:null,operation:'upsert',clientCreatedAt:new Date().toISOString(),clientUpdatedAt:new Date().toISOString(),deletedAt:null}]}
  fs.writeFileSync(changes,JSON.stringify(batch))
  const sync=path.join(folder,'sync_excel_to_sqlite.py'),validate=path.join(folder,'validate_finance_data.py')
  fs.writeFileSync(sync,'import sys,pathlib\np=pathlib.Path(__file__).parent\nw=pathlib.Path(sys.argv[sys.argv.index("--workbook")+1])\nmarker=p/"failure-fired"\nif '+(mode==='rollback' || mode==='recovery'?'True':'False')+' and w.parent==p and not marker.exists():\n marker.write_text("failed")\n sys.exit(1)\n')
  fs.writeFileSync(validate,'import sys,pathlib,json\np=pathlib.Path(__file__).parent\nw=pathlib.Path(sys.argv[sys.argv.index("--workbook")+1])\nif '+(mode==='recovery'?'True':'False')+' and w.parent==p: sys.exit(1)\nprint(json.dumps({"status":"ok"}))\n')
  const args={mode:'preview',workbook,changes,'dataset-id':batch.datasetId},preview=await execute(args)
  return {folder,source,args,apply:{...args,mode:'apply','confirm-hash':preview.previewHash,'writer-confirmed':true,python,'sync-script':sync,'validate-script':validate,db:path.join(folder,'test.db'),receipt:path.join(folder,'receipt.json')}}
}
function cleanup(folder) { if(path.dirname(folder)===root && path.basename(folder).startsWith('.finance-recovery-test-') && !fs.lstatSync(folder).isSymbolicLink())fs.rmSync(folder,{recursive:true,force:true}) }
test('post-publish failure returns rejection only after proven rollback',{skip:!python},async()=>{
  const fixture=await setup('rollback')
  try {const result=await execute(fixture.apply);assert.equal(result.status,'rejected');assert.deepEqual(fs.readFileSync(fixture.args.workbook),fixture.source);const returned=JSON.parse(fs.readFileSync(result.receipt));assert.ok(returned.results.every(row=>row.masterId===null && row.status==='not_applied'))}
  finally{cleanup(fixture.folder)}
})
test('failed rollback validation leaves recovery lock and blocks further apply',{skip:!python},async()=>{
  const fixture=await setup('recovery')
  try {const result=await execute(fixture.apply);assert.equal(result.status,'recovery_required');const preview=await execute(fixture.args);assert.equal(preview.canApply,false);assert.equal(preview.recoveryPending,true);await assert.rejects(execute({...fixture.apply,'confirm-hash':preview.previewHash}),/RECOVERY_REQUIRED/)}
  finally{cleanup(fixture.folder)}
})
test('receipt output failure preserves committed workbook and supports immutable retrieval',{skip:!python},async()=>{
  const fixture=await setup('output')
  try {const result=await execute({...fixture.apply,receipt:path.join(fixture.folder,'missing','receipt.json')});assert.equal(result.status,'committed');assert.equal(result.receiptPending,true);const committed=fs.readFileSync(fixture.args.workbook);assert.notDeepEqual(committed,fixture.source);const preview=await execute(fixture.args);const replay=await execute({...fixture.apply,'confirm-hash':preview.previewHash});assert.equal(replay.status,'committed');assert.equal(replay.replayed,true);assert.deepEqual(fs.readFileSync(fixture.args.workbook),committed);assert.equal(JSON.parse(fs.readFileSync(replay.receipt)).batchStatus,'committed')}
  finally{cleanup(fixture.folder)}
})
