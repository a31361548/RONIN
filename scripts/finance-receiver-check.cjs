const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { loadFinanceModule } = require('./finance-module-loader.cjs')
const { prepareWorkbookExchange } = loadFinanceModule('src/lib/finance/receiver.ts')
const { FinanceWorkbookXml } = loadFinanceModule('src/lib/finance/workbook-xml.ts')
const { previewReturn, payloadHash } = loadFinanceModule('src/lib/finance/sync.ts')
const datasetId = randomUUID()
async function fixture() {
  const book = new ExcelJS.Workbook()
  book.addWorksheet('支出明細').addRow(['日期','月份','類別','項目','金額','支付方式','是否固定支出','備註','資料ID','gross_amount','reimbursement_amount','points_offset_amount','credit_card_id','statement_month','structured_credit_card','寫入日期'])
  book.addWorksheet('信用卡交易').addRow(['信用卡交易ID','card_id','卡名','末四碼','刷卡日期','入帳日期','實際刷卡金額','statement_month','消費月份','預訂用途','預約使用日','使用時數','個人負擔','他人分攤/實際回補','狀態','對應支出ID','備註','寫入日期'])
  book.addWorksheet('資金異動').addRow(['資金異動ID','異動日期','帳戶','異動類型','金額','異動後餘額','所屬月份','備註','寫入日期'])
  const monthly = book.addWorksheet('月收支'); monthly.addRow(['月份','月初帳戶餘額','薪水收入','其他收入','總收入','固定支出','變動支出','投資轉出','投資轉入','總支出','月末帳戶餘額','本月淨存款','是否超支','備註','寫入日期'])
  monthly.addRow(['2026-10',null,1000,0,{formula:'C2+D2',result:1000},0,0,0,0,{formula:'F2+G2+H2',result:0},null,{formula:'E2-J2',result:1000},{formula:'IF(L2<0,"是","否")',result:'否'},null,new Date('2026-10-01T00:00:00Z')]); monthly.getCell('O2').numFmt='yyyy-mm-dd'
  book.addWorksheet('持股總覽').addRow(['保留投資與格式']); book.getWorksheet('持股總覽').getCell('A1').font={bold:true}
  return Buffer.from(await book.xlsx.writeBuffer())
}
function expense(amount='85.00') { return {entityType:'expense',payload:{expenseDate:'2026-10-14',categoryCode:'food',item:'測試早餐',personalAmount:amount,paymentMethod:'cash',accountId:'cash',isFixed:false,notes:null,creditCardTransactionClientId:null}} }
function change(record=expense(), fields={}) { return {...record,changeId:randomUUID(),clientId:randomUUID(),clientRevision:1,baseMasterRevision:null,baseMasterHash:null,operation:'upsert',clientCreatedAt:'2026-10-14T01:00:00Z',clientUpdatedAt:'2026-10-14T01:00:00Z',deletedAt:null,...fields} }
function file(records=[change()], fields={}) { return {schemaVersion:2,fileType:'finance-changes',appId:'riyue',datasetId,batchId:randomUUID(),exportedAt:'2026-10-14T01:00:00Z',timezone:'Asia/Taipei',records,...fields} }
const run = (bytes,batch,fields={}) => prepareWorkbookExchange(bytes,batch,{datasetId,now:'2026-10-14T02:00:00Z',...fields})
test('cash v2 completes receipt preview, preserves unrelated XML and replays without another row',async()=>{
  const bytes=await fixture(), batch=file(), output=await run(bytes,batch)
  assert.equal(output.receipt.batchStatus,'committed'); const doc=await FinanceWorkbookXml.open(output.workbook)
  assert.equal(doc.rows('支出明細').length,1); assert.equal(doc.rows('支出明細')[0].values['付款帳戶'],'現金錢包'); assert.equal(doc.date(doc.rows('支出明細')[0].values['寫入日期']),'2026-10-14')
  const oldZip=await JSZip.loadAsync(bytes),newZip=await JSZip.loadAsync(output.workbook)
  assert.deepEqual(await newZip.file('xl/worksheets/sheet5.xml').async('nodebuffer'),await oldZip.file('xl/worksheets/sheet5.xml').async('nodebuffer'))
  const replay=await run(output.workbook,batch); assert.equal(replay.replayed,true); assert.deepEqual(replay.receipt,output.receipt); assert.deepEqual(replay.workbook,output.workbook)
  const local=batch.records.map(row=>({...row,id:row.clientId,revision:row.clientRevision,serverShadow:null,masterRevision:null,masterHash:null}))
  assert.equal(previewReturn(batch,output.receipt,local).conflict,false)
})
test('updates preserve formal ID/date and stale versions create a conflict',async()=>{
  const first=file(),initial=await run(await fixture(),first),master=initial.receipt.results[0]
  const update=file([change(expense('90.00'),{clientId:first.records[0].clientId,clientRevision:2,baseMasterRevision:master.masterRevision,baseMasterHash:master.masterHash})])
  const next=await run(initial.workbook,update); assert.equal(next.receipt.batchStatus,'committed'); assert.equal(next.receipt.results[0].masterId,master.masterId); assert.equal(next.receipt.results[0].recordedDate,master.recordedDate)
  const stale=file([{...update.records[0],changeId:randomUUID(),clientRevision:3}]); const rejected=await run(next.workbook,stale)
  assert.equal(rejected.receipt.batchStatus,'rejected'); assert.equal(rejected.receipt.results[0].status,'conflict'); assert.equal(rejected.receipt.results[0].canonicalPayload.personalAmount,'90.00')
})
test('same batch or change ID with changed content is refused',async()=>{
  const batch=file(), first=await run(await fixture(),batch)
  await assert.rejects(run(first.workbook,{...batch,exportedAt:'2026-10-14T03:00:00Z'}),/IMMUTABLE/)
  const modified=structuredClone(batch); modified.batchId=randomUUID(); modified.records[0].payload.personalAmount='86.00'
  const rejected=await run(first.workbook,modified); assert.equal(rejected.receipt.batchStatus,'rejected'); assert.equal(rejected.receipt.results[0].errors[0].code,'IMMUTABLE_SNAPSHOT_MISMATCH')
})
test('a rejected member prevents every other record from being applied',async()=>{
  const first=change(),bad=change(expense('95.00'),{operation:'delete',deletedAt:'2026-10-14T02:00:00Z'}),batch=file([first,bad])
  const rejected=await run(await fixture(),batch); assert.equal(rejected.receipt.batchStatus,'rejected'); assert.equal(rejected.receipt.results[0].status,'not_applied'); assert.equal((await FinanceWorkbookXml.open(rejected.workbook)).rows('支出明細').length,0)
})
test('income retains a legacy baseline and requires explicit distinct confirmation',async()=>{
  const income={entityType:'income',payload:{receivedDate:'2026-10-14',incomeType:'salary',item:'另一份薪資',amount:'200.00',accountId:'cathay',isRecurring:false,notes:null}},batch=file([change(income)])
  const bytes=await fixture(); const blocked=await run(bytes,batch); assert.equal(blocked.receipt.results[0].errors[0].code,'DUPLICATE_CANDIDATE')
  const confirmed=await run(bytes,batch,{confirmedDistinct:{[batch.records[0].clientId]:'已人工確認為另一份收入'}})
  assert.equal(confirmed.receipt.batchStatus,'committed'); const doc=await FinanceWorkbookXml.open(confirmed.workbook)
  assert.equal(doc.rows('收入明細').length,1); assert.equal(doc.rows('收入基線')[0].values['薪資基線'],1000); assert.equal(doc.rows('月收支')[0].values['薪水收入'],1200)
  const retry=await run(confirmed.workbook,file([change(expense('10.00'))])); assert.equal((await FinanceWorkbookXml.open(retry.workbook)).rows('月收支')[0].values['薪水收入'],1200)
})
test('manual changes are discovered from Excel rather than trusting cached versions',async()=>{
  const batch=file(),first=await run(await fixture(),batch),doc=await FinanceWorkbookXml.open(first.workbook); doc.setRow('支出明細',2,{金額:99})
  const sent=file([change(expense('88.00'),{clientId:batch.records[0].clientId,clientRevision:2,baseMasterRevision:1,baseMasterHash:payloadHash(batch.records[0].payload)})])
  const rejected=await run(await doc.save(),sent); assert.equal(rejected.receipt.results[0].status,'conflict'); assert.equal(rejected.receipt.results[0].canonicalPayload.personalAmount,'99.00'); assert.equal(rejected.receipt.results[0].masterRevision,2)
})
test('settled card and expense preserve both formal links and personal burden once',async()=>{
  const cardId=randomUUID(),expenseId=randomUUID()
  const card={entityType:'credit_card_transaction',payload:{cardId:'CUBE-9539',purchaseDate:'2026-10-13',postingDate:null,consumptionDate:'2026-10-14',statementMonth:'2026-10',purpose:'測試刷卡',usageDate:null,usageHours:null,grossAmount:'100.00',reimbursementReceivedAmount:'20.00',pointsOffsetAmount:'0.00',personalAmount:'80.00',status:'settled',expenseClientId:expenseId,notes:null}}
  const detail={entityType:'expense',payload:{...expense('80.00').payload,item:'測試刷卡',paymentMethod:'credit_card',accountId:null,creditCardTransactionClientId:cardId}}
  const output=await run(await fixture(),file([change(card,{clientId:cardId}),change(detail,{clientId:expenseId})]))
  assert.equal(output.receipt.batchStatus,'committed'); const doc=await FinanceWorkbookXml.open(output.workbook)
  assert.equal(doc.rows('信用卡交易')[0].values['對應支出ID'],output.receipt.results[1].masterId)
  assert.equal(doc.rows('支出明細')[0].values['金額'],80);assert.equal(doc.rows('月收支')[0].values['變動支出'],80)
})
test('pending card keeps its actual consumption date without inventing usage or expenses',async()=>{
  const record={entityType:'credit_card_transaction',payload:{cardId:'CUBE-9539',purchaseDate:'2026-10-13',postingDate:null,consumptionDate:'2026-10-14',statementMonth:null,purpose:'待結算測試',usageDate:null,usageHours:null,grossAmount:'100.00',reimbursementReceivedAmount:'0.00',pointsOffsetAmount:'0.00',personalAmount:null,status:'pending',expenseClientId:null,notes:null}}
  const output=await run(await fixture(),file([change(record)]));assert.equal(output.receipt.batchStatus,'committed')
  const doc=await FinanceWorkbookXml.open(output.workbook);assert.equal(doc.rows('支出明細').length,0);assert.equal(doc.date(doc.rows('信用卡交易')[0].values['實際消費日']),'2026-10-14')
})
test('movement preserves card/month fields, signed balance and does not count as consumption',async()=>{
  const record={entityType:'cash_movement',payload:{movementDate:'2026-10-14',accountId:'cathay',movementType:'credit_card_payment',amount:'100.00',balanceAfter:'-5.00',notes:null,cardId:'CUBE-9539',statementMonth:'2026-09'}}
  const output=await run(await fixture(),file([change(record)]));assert.equal(output.receipt.batchStatus,'committed');const doc=await FinanceWorkbookXml.open(output.workbook)
  assert.equal(doc.rows('資金異動')[0].values['statement_month'],'2026-09');assert.equal(doc.rows('資金異動')[0].values['異動後餘額'],-5);assert.equal(doc.rows('月收支')[0].values['變動支出'],0)
})
test('zero formula caches remain zero; absent caches still stop import',async()=>{
  const doc=await FinanceWorkbookXml.open(await fixture());assert.equal(doc.rows('月收支')[0].values['總支出'],0)
  const zip=await JSZip.loadAsync(await fixture());const name='xl/worksheets/sheet4.xml';zip.file(name,(await zip.file(name).async('string')).replace(/<c r="J2"[^>]*>[\s\S]*?<\/c>/,'<c r="J2"><f>F2+G2+H2</f></c>'))
  await assert.rejects(run(await zip.generateAsync({type:'nodebuffer'}),file()),/快取/)
})
test('invalid dataset, unknown fields and changed first-write dates never overwrite data',async()=>{
  const bytes=await fixture();await assert.rejects(run(bytes,file(),{datasetId:randomUUID()}),/datasetId/)
  await assert.rejects(run(bytes,{...file(),surprise:true}))
  const batch=file(),first=await run(bytes,batch),doc=await FinanceWorkbookXml.open(first.workbook);doc.setRow('支出明細',2,{寫入日期:{date:'2026-10-15'}})
  const update=file([change(expense('88.00'),{clientId:batch.records[0].clientId,clientRevision:2,baseMasterRevision:1,baseMasterHash:payloadHash(batch.records[0].payload)})])
  const result=await run(await doc.save(),update);assert.equal(result.receipt.batchStatus,'rejected');assert.match(result.receipt.results[0].errors[0].message,/首次正式寫入日期/)
})
test('same-batch duplicates require a persisted reason for every candidate',async()=>{
  const batch=file([change(),change()]),bytes=await fixture();const blocked=await run(bytes,batch)
  assert.equal(blocked.receipt.batchStatus,'rejected');assert.ok(blocked.receipt.results.every(row=>row.errors[0].code==='DUPLICATE_CANDIDATE'))
  const decisions=Object.fromEntries(batch.records.map(row=>[row.clientId,'不同訂單，已查核收據']))
  const accepted=await run(bytes,batch,{confirmedDistinct:decisions});assert.equal(accepted.receipt.batchStatus,'committed')
  const doc=await FinanceWorkbookXml.open(accepted.workbook),state=JSON.parse(doc.rows('日隅同步對照').map(row=>row.values['內容']).join(''))
  assert.deepEqual(state.batches[batch.batchId].confirmedDistinct,decisions)
})
test('existing monthly disagreement is blocked rather than silently overwritten',async()=>{
  const doc=await FinanceWorkbookXml.open(await fixture());doc.setRow('月收支',2,{變動支出:10})
  await assert.rejects(run(await doc.save(),file()),/既有支出明細不一致/)
  const income={entityType:'income',payload:{receivedDate:'2026-10-14',incomeType:'other',item:'新增收入',amount:'10.00',accountId:'cathay',isRecurring:false,notes:null}}
  const first=await run(await fixture(),file([change(income)])),edited=await FinanceWorkbookXml.open(first.workbook)
  edited.setRow('月收支',2,{其他收入:11,總收入:{formula:'C2+D2',result:1011}})
  await assert.rejects(run(await edited.save(),file()),/收入基線／明細不一致/)
})
