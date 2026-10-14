#!/usr/bin/env node
// Explicit local writer; preview is read-only. No workbook or DB defaults.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { loadFinanceModule } = require('./finance-module-loader.cjs')
const { prepareWorkbookExchange } = loadFinanceModule('src/lib/finance/receiver.ts')
const { payloadHash } = loadFinanceModule('src/lib/finance/sync.ts')
const { returnSchema } = loadFinanceModule('src/lib/finance/schema.ts')
const hash = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function argumentsFor(argv) {
  const mode = argv.shift(); if (!['preview', 'apply'].includes(mode)) throw new Error('使用 preview 或 apply，並明確指定 --workbook --changes --dataset-id')
  const args = { mode }, allowed = new Set(['workbook','changes','dataset-id','confirm-hash','confirmed-distinct','writer-confirmed','python','sync-script','validate-script','db','receipt'])
  while (argv.length) { const key=argv.shift()?.replace(/^--/,''); if (!allowed.has(key) || key in args) throw new Error('未知或重複參數'); args[key]=key==='writer-confirmed' ? true : argv.shift(); if (args[key]===undefined || typeof args[key]==='string' && args[key].startsWith('--')) throw new Error(`缺少 --${key} 的值`) }
  for (const key of ['workbook','changes','dataset-id']) if (!args[key]) throw new Error(`必須指定 --${key}`)
  return args
}
function durableWrite(filename, bytes, flag='w') { const owned=typeof filename!=='number',handle=owned?fs.openSync(filename,flag):filename; try { fs.writeFileSync(handle,bytes); fs.fsyncSync(handle) } finally { if(owned)fs.closeSync(handle) } }
function writeJournal(filename, journal) {
  const temporary=filename+'.'+process.pid+'.tmp'
  try { durableWrite(temporary,JSON.stringify(journal,null,2),'wx'); fs.renameSync(temporary,filename) }
  finally { if(fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}
function writeReceipt(filename, receipt) {
  const bytes=JSON.stringify(returnSchema.parse(receipt),null,2)
  if (fs.existsSync(filename)) { if (fs.readFileSync(filename,'utf8')!==bytes) throw new Error('回匯輸出路徑已有不同內容，請改用新路徑'); return }
  durableWrite(filename,bytes,'wx')
}
function runPython(args, script, workbook, db) {
  const result=spawnSync(args.python,[script,'--workbook',workbook,'--db',db],{encoding:'utf8',maxBuffer:5_000_000,windowsHide:true})
  if (result.error || result.status!==0) throw new Error(result.error?.message ?? `${path.basename(script)} 失敗：${result.stderr || result.stdout}`)
  if (script===args['validate-script']) { const report=JSON.parse(result.stdout); if (report.status!=='ok') throw new Error('一致性驗證未通過') }
}
function syncAndValidate(args, workbook, db) { runPython(args,args['sync-script'],workbook,db); runPython(args,args['validate-script'],workbook,db) }
function snapshotDb(python, source, target) {
  if (!fs.existsSync(source)) return
  const program='import sqlite3,sys,pathlib; source=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); dest=sqlite3.connect(sys.argv[2]); source.backup(dest); dest.close(); source.close()'
  const result=spawnSync(python,['-c',program,source,target],{encoding:'utf8',windowsHide:true})
  if (result.error || result.status!==0) throw new Error('無法建立衍生資料庫的測試快照')
}
function unsuccessful(receipt, recovery, message) {
  return returnSchema.parse({...receipt,batchStatus:recovery?'recovery_required':'rejected',results:receipt.results.map(row=>({...row,status:'not_applied',masterId:null,masterRevision:null,masterHash:null,recordedDate:null,canonicalPayload:null,errors:[{code:recovery?'RECOVERY_REQUIRED':'BATCH_NOT_APPLIED',field:null,message}],warnings:[]}))})
}
async function execute(args) {
  const workbook=path.resolve(args.workbook), changes=path.resolve(args.changes)
  if (!/\.xlsx$/i.test(workbook) || workbook===changes) throw new Error('請指定獨立的 XLSX 帳本與 JSON 交換檔')
  if (fs.statSync(changes).size>5_000_000) throw new Error('交換檔超過 5 MB')
  if (fs.existsSync(path.join(path.dirname(workbook),'~$'+path.basename(workbook)))) throw new Error('Excel 正在開啟帳本，請先關閉')
  const input=JSON.parse(fs.readFileSync(changes,'utf8')), source=fs.readFileSync(workbook)
  const decisions=args['confirmed-distinct']?JSON.parse(fs.readFileSync(path.resolve(args['confirmed-distinct']),'utf8')):{}
  if (!decisions || Array.isArray(decisions) || Object.values(decisions).some(value=>typeof value!=='string' || !value.trim() || value.length>1000)) throw new Error('人工確認檔需為 clientId → 核對註解物件')
  const options={datasetId:args['dataset-id'],confirmedDistinct:decisions}
  const prepared=await prepareWorkbookExchange(source,input,options)
  const journalPath=workbook+'.daynook-journal.json', lockPath=workbook+'.daynook.lock'
  const priorJournal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath,'utf8')):null
  const recoveryPending=priorJournal && ['preparing','published','recovery_required'].includes(priorJournal.status)
  if (args.mode==='preview') return {status:'preview',sourceHash:prepared.sourceHash,previewHash:prepared.previewHash,replayed:prepared.replayed,canApply:!recoveryPending && prepared.receipt.batchStatus==='committed',recoveryPending:Boolean(recoveryPending),rows:prepared.receipt.results.map(row=>({clientId:row.clientId,entityType:row.entityType,status:row.status,errors:row.errors}))}
  for (const key of ['python','sync-script','validate-script','db','receipt','confirm-hash']) if (!args[key]) throw new Error(`apply 必須指定 --${key}`)
  if (!args['writer-confirmed']) throw new Error('必須先由唯一寫入者確認本次序列化作業，再提供 --writer-confirmed')
  if (args['confirm-hash']!==prepared.previewHash) throw new Error('預覽已過期或人工確認已改變，請重新 preview')
  args.python=path.resolve(args.python); args['sync-script']=path.resolve(args['sync-script']); args['validate-script']=path.resolve(args['validate-script'])
  if (path.basename(args['sync-script'])!=='sync_excel_to_sqlite.py' || path.basename(args['validate-script'])!=='validate_finance_data.py') throw new Error('需使用正式 sync／validate 入口')
  const db=path.resolve(args.db), receiptPath=path.resolve(args.receipt)
  if (new Set([workbook,changes,db,receiptPath]).size!==4) throw new Error('帳本、交換檔、DB 與回匯檔路徑必須不同')
  const lock=fs.openSync(lockPath,'wx')
  let published=false, finalized=false, journal=null, staging=null
  try {
  durableWrite(lock,JSON.stringify({pid:process.pid,batchId:input.batchId}))
  if (hash(fs.readFileSync(workbook))!==prepared.sourceHash) throw new Error('正式帳本在預覽後已改變，拒絕覆蓋')
  if (fs.existsSync(journalPath)) {
    const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'))
    if (['preparing','published','recovery_required'].includes(journal.status)) throw new Error('RECOVERY_REQUIRED：前次寫入尚待人工恢復，拒絕自動重送')
    if (journal.batchId===input.batchId) {
      if (journal.hash!==payloadHash(input)) throw new Error('IMMUTABLE_SNAPSHOT_MISMATCH：批次內容已改變')
      if (journal.status==='rejected') { writeReceipt(receiptPath,journal.receipt); return {status:'rejected',receipt:receiptPath,replayed:true} }
    }
  }
  if (prepared.replayed) { syncAndValidate(args,workbook,db); writeReceipt(receiptPath,prepared.receipt); return {status:prepared.receipt.batchStatus,receipt:receiptPath,replayed:true} }
    staging=fs.mkdtempSync(path.join(path.dirname(workbook),'.daynook-stage-'))
    const stagedWorkbook=path.join(staging,'candidate.xlsx'), stagedDb=path.join(staging,'candidate.db')
    durableWrite(stagedWorkbook,prepared.workbook,'wx'); snapshotDb(args.python,db,stagedDb)
    syncAndValidate(args,stagedWorkbook,stagedDb)
    if (hash(fs.readFileSync(workbook))!==prepared.sourceHash) throw new Error('正式帳本在預覽後已改變，拒絕覆蓋')
    if (fs.existsSync(receiptPath)) throw new Error('回匯輸出路徑已存在，請先換一個路徑')
    const backup=workbook+`.daynook-${input.batchId}.bak`
    if (fs.existsSync(backup)) throw new Error('原批次備份已存在，請先人工核對')
    durableWrite(backup,source,'wx')
    journal={status:'preparing',batchId:input.batchId,hash:payloadHash(input),sourceHash:prepared.sourceHash,candidateHash:hash(prepared.workbook),backup,receipt:prepared.receipt}
    writeJournal(journalPath,journal)
    if (hash(fs.readFileSync(workbook))!==prepared.sourceHash) throw new Error('正式帳本於提交前改變，拒絕覆蓋')
    fs.renameSync(stagedWorkbook,workbook); published=true
    journal.status='published'; writeJournal(journalPath,journal)
    if (hash(fs.readFileSync(workbook))!==journal.candidateHash) throw new Error('寫入後檔案被改變')
    syncAndValidate(args,workbook,db)
    if (hash(fs.readFileSync(workbook))!==journal.candidateHash) throw new Error('驗證時檔案被其他寫入者改變')
    journal.status=prepared.receipt.batchStatus; writeJournal(journalPath,journal); finalized=true
    writeReceipt(receiptPath,prepared.receipt)
    return {status:prepared.receipt.batchStatus,receipt:receiptPath,backup,replayed:false}
  } catch (error) {
    // A durable final journal is the commit point. Output failure cannot undo it.
    if (finalized) return {status:journal.status,receipt:null,receiptPending:true,backup:journal.backup,error:error.message,retry:'重新 preview 後，以原批次 apply 與可寫入的新回匯路徑取回回執'}
    if (!journal) throw error
    let recovery=false
    try {
      if (published) {
        if (hash(fs.readFileSync(workbook))!==journal.candidateHash) throw new Error('其他寫入者已修改檔案，不能自動回退')
        const rollback=path.join(staging,'rollback.xlsx'); durableWrite(rollback,source,'wx'); fs.renameSync(rollback,workbook)
        syncAndValidate(args,workbook,db)
      } else if (hash(fs.readFileSync(workbook))!==prepared.sourceHash) throw new Error('提交前來源已改變')
    } catch { recovery=true }
    const result=unsuccessful(prepared.receipt,recovery,recovery?'無法證明完整提交或完整回退，請人工核對':`本批已安全回退：${error.message}`)
    journal.status=result.batchStatus; journal.receipt=result; writeJournal(journalPath,journal); writeReceipt(receiptPath,result)
    return {status:result.batchStatus,receipt:receiptPath,backup:journal.backup,error:error.message}
  } finally {
    fs.closeSync(lock); fs.unlinkSync(lockPath)
    const parent=path.dirname(workbook); if (staging && fs.existsSync(staging) && path.dirname(staging)===parent && path.basename(staging).startsWith('.daynook-stage-') && !fs.lstatSync(staging).isSymbolicLink()) fs.rmSync(staging,{recursive:true,force:true})
  }
}
if (require.main===module) execute(argumentsFor(process.argv.slice(2))).then(result=>{console.log(JSON.stringify(result,null,2));if(result.status==='recovery_required')process.exitCode=2}).catch(error=>{console.error(error.message);process.exitCode=1})
module.exports={execute,argumentsFor}
