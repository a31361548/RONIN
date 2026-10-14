# 日隅財務交換協議 v1

此文件保留 v1 契約與當時限制。2026-10-14 起新匯出使用 v2；本機接收工具、現金與收入來源、提交驗證及回退流程見 [finance-exchange-v2.md](finance-exchange-v2.md)。舊批次仍依 v1 解析，不改快照。

## 固定名稱與邊界

- UTF-8 JSON，`schemaVersion=1`、`appId=riyue`、`timezone=Asia/Taipei`。
- 固定採用 `datasetId`、`clientId`、`clientRevision`、`baseMasterRevision`、`baseMasterHash`。先前對話提出的 ledgerId/entryId/exportedRevision 改名版本撤回；不得混用或默默接受別名。
- Excel 是正式來源；網站為独立紀錄與待同步端。SQLite 是衍生查詢層，不直接寫入。
- 此 JSON 交換協議不包含完整 Excel 歷史、不處理投資、不與行事曆關聯。網站另提供 XLSX 歷史副本匯入，見 [finance-history-import.md](finance-history-import.md)，不改動本協議。
- 網站本地現金錢包使用 `accountId=cash`，不屬於此 v1 契約；其新建支出保留待同步並提示原因，不加入 v1 匯出批次，回匯亦不接受 cash 帳戶。其他相容紀錄仍可正常交換，不以銀行假代錢包。
- 收入本地核對註記不進入交換 payload。尚未核對的疑似收入會阻擋新匯出；使用者確認已包含在 Excel 月收入的網站紀錄會排除再次匯出，保留原收入與註解，不冒充正式同步。操作與回退見 [finance-income-reconciliation.md](finance-income-reconciliation.md)。
- payload 外所有欄位必須精確符合本契約；禁止未知欄位。payload 亦只允許本文件列出的欄位。
- 日期為有效 `YYYY-MM-DD`，月份為有效 `YYYY-MM`，時間為含 Z 或時區位移的 ISO 8601。金額為非負十進位字串、恰兩位小數，不允許科學記號或默默四捨五入；幣別僅 TWD。balanceAfter 可為帶負號的兩位小數字串。UUID 為標準連字號格式。
- `masterId` 保留原有正式 ID（例如歷史 EXP-、exp_、cc_、MOV-）；網站 UUID 不替換它。

## finance-changes exact schema

根物件所有欄位必填：

| 欄位 | 型別／限制 |
| --- | --- |
| schemaVersion | integer，固定 1 |
| fileType | string，固定 finance-changes |
| appId | string，固定 riyue |
| datasetId | UUID string，初始化固定帳本識別 |
| batchId | UUID string，匯出批次識別 |
| exportedAt | datetime string |
| timezone | string，固定 Asia/Taipei |
| records | Record[] |

Record 所有欄位必填：

| 欄位 | 型別／限制 |
| --- | --- |
| changeId | UUID string，一個不可變修改快照的識別 |
| clientId | UUID string，同一紀錄終身固定 |
| entityType | income / expense / credit_card_transaction / cash_movement |
| operation | upsert / delete |
| clientRevision | integer >= 1 |
| baseMasterRevision | integer >= 1 或 null；新資料 null，已同步更新必填值 |
| baseMasterHash | sha256:加64位小寫十六進位 或 null；與 baseMasterRevision 同時有值或同時 null |
| clientCreatedAt | datetime string，永久保留 |
| clientUpdatedAt | datetime string |
| deletedAt | datetime string 或 null；delete 必須有值，upsert 必須 null |
| payload | 對應 entityType 的完整物件；delete 可為 null |

同一批次不得重複 changeId 或重複 (entityType, clientId)，亦不得以相同 clientId 表示不同 entityType。更新 payload 為完整快照，非 patch。未出現在檔案中的資料不代表刪除。重送不可變批次保持 batchId 與內容；新修改採新 batchId/changeId 與遞增 clientRevision。

## Payload exact schema

下列每個欄位都必須出現；標示 nullable 者才能 null。income/expense/credit-card/cash 的金額均不允許負數，cash amount 與 income amount 必須 > 0。

### expense

- expenseDate：date。
- categoryCode：food / transport / gifts / entertainment / family_support / daily_goods / telecom / sports_leisure / healthcare。
- item：非空 string。
- personalAmount：money；允許零但需有可追溯全額回補或折抵事實。
- paymentMethod：cash / bank_transfer / credit_card。
- accountId：cathay / ctbc 或 null；cash/bank_transfer 必填，credit_card 可 null。
- isFixed：boolean。
- notes：string 或 null。
- creditCardTransactionClientId：UUID 或 null；credit_card 必填，其他支付 null。

category 對照依序為餐飲、交通、人情禮金、娛樂、孝親費、日用品、通訊費、運動休閒、醫療保健。account 對照國泰、中信；支付方式對照現金、轉帳、信用卡。支出月份由 expenseDate 推導。bank_transfer 是轉帳支付的消費，不是帳戶間互轉。

### credit_card_transaction

- cardId：string；v1 只接受 CUBE-9539，舊名稱國泰CUBE-9539可由 adapter 正規化，回匯固定 CUBE-9539。
- purchaseDate：date。
- postingDate：date 或 null。
- consumptionDate：date。
- statementMonth：month 或 null，未知不得猜。
- purpose：非空 string。
- usageDate：date 或 null。
- usageHours：非負十進位字串、恰兩位小數，或 null。
- grossAmount：money > 0；定義為實際信用卡請款額，不是折抵前商品原價。
- reimbursementReceivedAmount：money；只含已收到的累計回補。
- pointsOffsetAmount：money；現有信用卡來源不完整，v1 只支援 0.00。非零必須拒絕而非重複扣除請款額。
- personalAmount：money 或 null；pending 必須 null，settled 必須有值。
- status：pending / settled / cancelled / refunded。
- expenseClientId：UUID 或 null；pending 必須 null，settled 必須有值。
- notes：string 或 null。

pending 不建立支出。settled 同批包含雙向配對 expense，兩端 personalAmount 相同，expenseDate=consumptionDate、卡片資訊相符，grossAmount-reimbursementReceivedAmount=personalAmount。更新及回補保留既有正式交易與支出 ID、首次寫入日期。首次 settled 要成組新增；既有 settled 的更新要成組更新。cancelled 僅對尚未建立支出的 pending 交易可承接；refunded 及 settled 取消先拒絕。已收到回補的逐次日期/對象目前不在正式來源，只能承接累計實收；不能把應收當實收。

### cash_movement

- movementDate：date。
- accountId：cathay / ctbc。
- movementType：credit_card_payment / family_advance_repayment。
- amount：money > 0，TWD 流出正值。
- balanceAfter：signed money 或 null；未知 null。
- notes：string 或 null。
- cardId：CUBE-9539 或 null；credit_card_payment 必填，family_advance_repayment 為 null。
- statementMonth：month 或 null；僅表達卡費帳單归屬，未知 null。

所屬月份由 movementDate 推導，不用 statementMonth。現有來源不含 cardId/statementMonth，需正式交換對照保留並備註，不能静默丟欄位。此類不進 expenses、不算投資、不推估銀行餘額。

### income

- receivedDate：date。
- incomeType：salary / other。
- item：非空 string。
- amount：money > 0。
- accountId：cathay / ctbc。
- isRecurring：boolean，僅性質，不代表自動入帳。
- notes：string 或 null。

逐筆收入尚無來源，必須拒絕 UNSUPPORTED_ENTITY。未來需新增收入明細及彙總/歷史基線規則；禁止將每次匯入直接累加月收支。

## finance-results exact schema

根物件所有欄位必填且不 nullable：

| 欄位 | 型別／限制 |
| --- | --- |
| schemaVersion | integer，固定 1 |
| fileType | string，固定 finance-results |
| appId | string，固定 riyue |
| datasetId | 原匯出 UUID |
| batchId | 原匯出 UUID |
| resultId | UUID；同批重送回傳原 resultId/回執 |
| processedAt | datetime string |
| timezone | string，固定 Asia/Taipei |
| batchStatus | committed / rejected / recovery_required |
| results | Result[]，與提交 records 一對一，同順序，完整回覆 |
| masterChanges | 空陣列 []，首版禁非空 |
| monthlySummaries | 空陣列 []，首版禁非空 |

Result 所有欄位必填：

| 欄位 | 型別／限制 |
| --- | --- |
| changeId | 原提交 UUID |
| clientId | 原提交 UUID |
| entityType | 原提交 entityType |
| submittedClientRevision | 原提交 clientRevision，integer >= 1 |
| status | applied / unchanged / rejected / conflict / not_applied |
| masterId | 非空正式 ID string 或 null |
| masterRevision | integer >= 1 或 null |
| masterHash | sha256:加64位小寫十六進位 或 null |
| recordedDate | date 或 null；歷史既有資料可仍 null，新正式列必有值 |
| canonicalPayload | 對應完整 payload 或 null |
| errors | Issue[]，必為陣列，不得 null |
| warnings | Issue[]，必為陣列，不得 null |

Issue 精確包含三個必填欄位：code（非空 string，穩定機器碼）、field（string 或 null）、message（非空 string）。field 若有值採 JSON Pointer，例如 /payload/amount；批次或非特定欄位錯誤為 null。

- applied/unchanged：masterId/masterRevision/masterHash/canonicalPayload 非空，errors=[]。首版成功的完整 batch 只含這兩種 status。
- rejected：errors 至少一項；masterId/masterRevision/masterHash/recordedDate/canonicalPayload 全 null，表示這次拒絕而非既有正式紀錄消失。
- conflict：errors 至少一項；可讀到目前正式資料時回傳其 masterId/masterRevision/masterHash/canonicalPayload，網站只存 serverShadow；讀不到時可全部 null。
- not_applied：errors 至少一項，一般 BATCH_NOT_APPLIED，所有 master 欄位/recordedDate/canonicalPayload null。
- schema 完全無法解析、帳本不符或無法辨識提交 records 時，不生成正常回匯檔，顯示檔案級錯誤；不可捏造一筆可供網站確認的結果。

首版 masterChanges/monthlySummaries 固定 []；不默默增加未定義非空結構。未来非空形狀需先對齊擴充版本，網站不得以缺筆推斷刪除或完整歷史覆寫。

## all-or-none、查重與恢復

- rejected：完整預驗證失敗或已安全回退；本批沒有已提交變更。失敗筆 rejected/conflict，其餘 not_applied；不得含 applied/unchanged。
- committed：全部寫入、回讀、同步、一致性驗證完成並有持久回執後才回傳。交易與支出關聯成組操作，結果仍逐項回覆。
- recovery_required：不能證明完整提交或完整回退，網站不可確認成功或自動重送；需要人工恢复。首版 results 全 not_applied，errors 含 RECOVERY_REQUIRED；此狀態不保證正式檔完全未改。
- 持久保存 (datasetId, appId, entityType, clientId)→masterId、正式 revision/hash、每批與 change 快照/回執。不得只放備註或可全量重建清空的 SQLite。
- 相同 batchId/changeId 同內容重送，回傳原回執不再次入帳；相同 ID 不同內容為 IMMUTABLE_SNAPSHOT_MISMATCH。
- 正式端比對 baseMasterRevision/hash，且重讀 Excel 偵測人工或其他入口變更，不只相信舊版本號。衝突拒絕，無最後時間覆蓋。
- masterHash 對 canonicalPayload 固定欄位、鍵按字典序、UTF-8 無額外空白序列化計算 SHA-256；金額固定兩位小數，null 保留，陣列順序保留，hash 不含行號/同步時間。兩端須共用測試向量驗證。
- 網站核對 datasetId/batchId/changeId/clientId/entityType/submittedClientRevision 與匯出快照。完整 committed 才確認整批；rejected/recovery_required 保留待同步。
- 匯出後又修改：保存回執為 serverShadow，保留本地新版本，要求使用者選擇保留本地或採 Excel，不自動合併。保留本地再提交時須新 changeId/batchId，base 取最新正式 shadow。
- delete 保留網站 tombstone，但正式端回傳 UNSUPPORTED_OPERATION，不能標已刪除。網站 pending income 同理不得標正式成功。

## 穩定錯誤碼與尚未實作的能力

最低錯誤碼：INVALID_FIELD、UNMAPPED_REFERENCE、DUPLICATE_CANDIDATE、REVISION_CONFLICT、UNSUPPORTED_ENTITY、UNSUPPORTED_FEATURE、UNSUPPORTED_OPERATION、SOURCE_NOT_READY、IMMUTABLE_SNAPSHOT_MISMATCH、BATCH_NOT_APPLIED、VALIDATION_FAILED、RECOVERY_REQUIRED。

- 可設計承接：現金/轉帳支出，信用卡 pending/settled 及配對 expense。仍須 adapter 實作，不能把本文件當作已可正式匯入。
- 資金異動正式來源/版本尚未就緒時拒絕 SOURCE_NOT_READY；部署完成亦須驗證交換對照已能保存 card/statement 等來源缺少欄位。
- 收入來源未建立，拒絕 UNSUPPORTED_ENTITY。點數非零拒絕 UNSUPPORTED_FEATURE。退款/分期/互轉/正式刪除拒絕 UNSUPPORTED_OPERATION。
- 正式 adapter 尚需來源化對照與回執、收入來源、衝突偵測、唯一寫入者及失敗恢復設計與驗證。本次只交付文件和 mock，不修改帳本。
- 同資料可能已由自然語言入帳而沒有網站對照時，回報 DUPLICATE_CANDIDATE 供人工核對；不能用金額日期自動合併。

## Mock 與回退

`finance-results-v1.mock.json` 是完全虛構的 rejected 批次，僅供介面測試，不是 callback 或正式入帳證明。刻意包含收入不支援、金流來源未就緒及其餘筆未提交。

本次新檔回退可只移除本文件與 mock，不影響 Excel/SQLite/同步器。未執行驗證命令；若要執行 JSON 解析或測試，需另取得本 session 的命令許可。

## 網站實作與交付

- 記帳入口：/dashboard/finance。四類紀錄本地保存於會員各自的工作副本。
- 本地新增、編輯、標記刪除均使用固定 clientId、遞增 revision 與新 changeId。
- 匯出批次完整保存於資料庫；重新下載原批次不改 batchId 或任何快照欄位。
- 回匯使用預覽與確認套用兩個步驟。每個完整結果的 resultId 與檔案 hash 保存以防重複及同 ID 改內容。
- 全批有本地修改時保存正式 serverShadow，不直接覆蓋。信用卡與支出一併解決，且連結、金額與日期必須一致。
- recovery_required 批次會阻止新批次匯出。兩端尚未定義恢復回執的替代規則，第一版維持封鎖，需由帳本端核對並另行對齊擴充；不能自行用新回執解除，也不能以編輯紀錄清除單筆錯誤繞過。
- 網站月報僅彙總網站紀錄；不代表完整 Excel、投資資產或銀行餘額。
- 帳本端目前只完成契約與 mock，正式 adapter/收入來源/資金異動部署尚未完成；不能將網站功能或 mock 當作正式入帳證明。

## 驗證與回退

- Mock：node scripts/finance-api-check.cjs，不連線資料庫、不改正式 Excel。
- 型別：tsc --noEmit --incremental false。
- Prisma validate／generate 已通過；引擎曾被開發程序鎖定，使用者同意重啟後完整產生。網站客製化設定另存，交換 payload 保持版本 1，詳見 finance-customization.md。
- 回退：還原本次記帳新增檔案、Prisma finance models/User relations 與 PersonalShell 記帳導覽即可；本次未執行資料庫 schema push 或正式 Excel 交換。
