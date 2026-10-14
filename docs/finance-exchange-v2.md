# 日隅財務交換 v2 與帳本接收操作

2026-10-14。Excel 仍是正式帳本，SQLite 仍由官方工具衍生。網站匯出 → 帳本管理對話預覽／確認 → 接收工具寫入並驗證 → JSON 回匯 → 網站確認同步。

## 與 v1 的差異

- 網站新批次使用 `schemaVersion=2`；既有批次保留原版本與快照，原批重送不重新產生內容。v1 欄位定義仍見 [finance-sync.md](finance-sync.md)。
- v2 保持原本 envelope、change、result 欄位，不加入別名。expense `accountId=cash` 只可搭配 `paymentMethod=cash`；銀行現金付款仍保留銀行來源，不擅自改為錢包。
- 收入仍只支援國泰／中信入帳；資金異動仍只支援卡費繳款與家人代墊償還。投資、帳戶轉帳、退款、點數折抵、正式刪除沒有擴充。
- 只有完成帳本提交與官方同步／一致性驗證後，CLI 才輸出可回匯的 `finance-results`。程式內的 `prepareWorkbookExchange()` 結果只是候選工作簿／計畫回執，不能當作正式入帳證據。
- 批次全有或全無；最多 100 筆。信用卡與支出成組處理，消費只計個人負擔一次，卡費不再次列消費。

## 正式來源結構

| 來源 | 新增來源欄位／工作表 | 用途 |
| --- | --- | --- |
| 支出明細 | 付款帳戶，必要的信用卡結構欄位 | 現金錢包、國泰、中信付款來源持久保存 |
| 信用卡交易 | 實際消費日、statement_month、卡名、末四碼 | 不用刷卡日推算消費／使用日 |
| 資金異動 | card_id、statement_month | 保留卡費所屬卡片與帳單月份，缺少值仍未知 |
| 收入明細 | 收入ID、入帳日期、月份、收入分類、項目、金額、帳戶、固定收入、備註、寫入日期 | 只保存真正有日期的新增逐筆收入 |
| 收入基線 | 月份、薪資基線、其他收入基線、建立日期 | 保留導入前月收入，不假造歷史入帳日 |
| 日隅同步對照（隱藏） | 分段、內容 | 保存 datasetId、網站與正式 ID 對照、版本／雜湊、批次回執、人工不同筆確認註解 |

月收入由「原基線＋新增逐筆來源」推導；月消費由支出明細推導，投資與餘額不由網站猜算。當既有月彙總與來源不一致，工具會停止，交帳本管理者核對。收入來源目前最多涵蓋工作表第 5001 列；超出會停止，需先擴充公式。

首次收入接收會新增基線／收入來源，帳本管理者應先在副本確認結構與官方工具相容。此任務已在正式帳本副本驗證；尚未在正式帳本導入上述新結構。

## 預覽與確認

接收工具位於本專案 `scripts/finance-receiver.cjs`，使用已安裝的 Node、ExcelJS、JSZip。Python 與官方兩個腳本必須由帳本管理者指定，不會安裝或下載執行工具，也沒有預設正式帳本路徑。

以下為參數模板，不可直接照抄；請在本專案根目錄執行並填入實際完整路徑。初次先對副本操作。

```powershell
node scripts/finance-receiver.cjs preview `
  --workbook "<帳本副本.xlsx 的完整路徑>" `
  --changes "<網站匯出 JSON 的完整路徑>" `
  --dataset-id "<JSON 的 datasetId>"
```

確認 `canApply=true`、沒有 `recoveryPending`，逐筆核對輸入 JSON 與來源，記下 `previewHash`。重複候選不會自動替換來源：若已包含在 Excel，回網站處理收入核對／帳目衝突；若確定是另一筆，建立 JSON 註解檔：

```json
{
  "<clientId>": "已查核收據，與原來源為不同訂單／收入"
}
```

預覽與 apply 同時提供 `--confirmed-distinct "<註解 JSON 路徑>"`。相同日期、金額、項目的同批新帳，也須逐筆說明。註解會存入帳本對照，不只留在終端輸出。預覽檔案或註解變更後必須重新取得 hash。

唯一寫入者完成核對、確認沒有其他寫入及 Excel 已關閉後，才使用：

```powershell
node scripts/finance-receiver.cjs apply `
  --workbook "<帳本副本.xlsx 的完整路徑>" `
  --changes "<網站匯出 JSON 的完整路徑>" `
  --dataset-id "<datasetId>" `
  --confirm-hash "<剛才的 previewHash>" `
  --writer-confirmed `
  --python "<Python 執行檔完整路徑>" `
  --sync-script "<sync_excel_to_sqlite.py 完整路徑>" `
  --validate-script "<validate_finance_data.py 完整路徑>" `
  --db "<對應副本 DB 完整路徑>" `
  --receipt "<新回匯 JSON 完整路徑>"
```

只有帳本管理者取得使用者對實際批次與正式來源的寫入授權後，才可改用正式 workbook/db；本次開發驗證沒有這樣做。不要把副本的回執回匯至真實網站帳目。

## 提交、重送與恢復

1. 工具取得同帳本排他鎖，建立候選 Excel 與唯讀 DB 快照，在暫存來源執行官方 sync／validate。
2. 比對預覽來源 SHA256，保存原檔 `.daynook-<batchId>.bak` 與原子更新的 `.daynook-journal.json`。
3. 替換指定 Excel，再以官方 sync／validate 更新指定衍生 DB；正式檔雜湊也須符合候選。
4. 完成日誌持久化後才輸出回執。回執輸出失敗回傳 `receiptPending=true`，保留已完成提交；原檔／原批次重新 preview、apply 並指定可寫入的新回執路徑即可取回。
5. 同批同內容返回原回執，不增加來源列。相同 batchId／changeId 不同內容拒絕。更新保留正式 ID 與首次寫入日；Excel 人工修改產生版本衝突，不能覆蓋。
6. 提交失敗只有在 Excel 回退與官方 DB 驗證都成功後，才回報 `rejected`；無法證明恢復完整會回報 `recovery_required`，封鎖新寫入。網站也維持恢復封鎖。

`preparing`／`published` 日誌或遺留 lock 代表可能中斷。先由唯一寫入者核對原檔、備份、候選雜湊及 DB，一次只處理一份帳本；不要直接刪檔重跑。恢復時只在來源仍是本批候選、且無其他寫入時，才可由管理者還原備份並跑官方 sync／validate。若來源已被別人修改，要人工合併／核對，不能盲目覆蓋。`recovery_required` 的網站解鎖目前沒有共同協議，不製造替代成功回執。

CLI 鎖無法阻止其他不遵循鎖的程式，因此 `--writer-confirmed` 不是權限證明；仍須總管維持唯一寫入者序列化。來源含 Excel table 或工作表保護時停止，避免默默留下不完整範圍。

## 驗證與回退範圍

- 核心測試涵蓋錢包、收入基線、人工重複確認、ID／首次寫入日、重送、版本衝突、信用卡配對、異動、明確零快取與缺少快取、月彙總不一致。
- 故障注入涵蓋安全回退、恢復封鎖、提交後回執輸出失敗與重新取回。
- 真實帳本只複製至可丟棄的測試目錄，DB 用 SQLite 唯讀 backup；官方 sync／validate 明確指向副本。驗證前後檢查正式 Excel／DB bytes 未變。
- 移除新接收模組／CLI 與 v2 預設匯出可回退程式；保留已有批次原版本解析。若將來已導入正式 v2 來源，應保留其欄位、對照與回執，不能僅以回退程式刪除帳務。
