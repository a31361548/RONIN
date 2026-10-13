# 記帳實作研究

## 收入核對與可讀性
- 月收支 salary／otherIncome 僅整月金額，不能確認網站薪資同日期或捏造逐筆收入。以同月／同類／同金額提示，使用者確認包含或另一筆並保存註解。
- sourceRefs.incomeReview 為本地註記；確認包含只排除重複匯出，保留交易／日期與網站收入，不宣稱完成正式同步。彙總 hash 或紀錄版本改變需重新核對。
- 41 tests、型別、scoped ESLint、最終 next build 與桌面／手機畫面通過，沒有保存核對、帳務或改寫正式 Excel。成果與回退見 docs/finance-income-reconciliation.md。

## 現金錢包與匯入狀態
- 「總管(3代)」確認 v1 尚未接受現金錢包；維持既有交換契約，本地錢包新帳明示待同步，其他帳目正常匯出，不偽造銀行帳戶。
- 現金來源缺帳戶自動對應錢包，分類獨立保留；轉帳缺銀行為黃色待補對照，資料錯誤紅色且保留日期／金額／分類。
- 舊兩帳戶設定只在讀取時補錢包，不修改原設定；舊現金銀行對應保留，沒有推算錢包餘額或提款。
- 35 tests、TypeScript、scoped ESLint、Next build 通過；正式帳本唯讀 175 列／166 組，原檔 bytes 未改。瀏覽器僅使用虛構帳本與未儲存表單，成果見 docs/finance-history-import.md。

## 日期選擇器
- 沒有既有日期套件，採用共用 PersonalDatePicker 與現有 PersonalSelect，不新增依賴。
- 日期計算使用 UTC，與 YYYY-MM-DD、YYYY-MM 契約相同；閏年、月底與跨年通過測試。
- 巢狀年份選單需 portal 到最近 data-personal-picker，才能避免日期選擇器外部點擊處理將它提前關閉。
- 桌面與手機已實測，Esc／Tab／方向鍵／清除正常。未保存測試帳務；25 tests、型別、ESLint 與 Next build 通過。
- 成果與回退：docs/personal-date-picker.md。

## 客製化補充
- 個人設定儲存於 FinanceLedger nullable JSON 與版本；既有 Mongo ledger 可能缺欄位，版本 0 更新包含 null／isSet:false，相容舊資料。
- 本地分類 ID 存在 FinanceEntry，對應正式分類後才匯出，Exchange schemaVersion 1 不變；主分類與子分類報表只計一次總支出。
- 每週／每月模板在使用者確認入帳時才推進提醒；月底保留原訂日，沒有自動入帳或推播。
- mock 測試 24 tests 全過；Prisma 更新、型別、ESLint、建置及桌面／手機表單驗證成功，最後入口修正再次建置成功。未保存測試資料。
- 實作說明與回退範圍：docs/finance-customization.md。

## 來源
最新 Excel 歷史匯入交付見 docs/finance-history-import.md。ExcelJS/JSZip 僅後端讀取；正式帳本唯讀檢查為 175 列／166 組。月收入保留彙總，缺帳戶明確對照，穩定來源 ID 防重複，歷史副本不再匯出。未寫入真實帳目，正式 JSON adapter 仍是獨立待完成工作。

- 使用者確認：Excel 主帳本、手動檔案交換、需回匯、投資第二版、記帳獨立。
- 「總管(3代)」(01a03d55-3334-7490-a72a-30479372fcb7) 先前回覆：國泰主要帳戶、中信次要；CUBE 預設卡；付款與消費分開；回補不算收入；結算不等於已繳卡費。
- 本專案：Next.js App Router、NextAuth、Prisma MongoDB、Zod；無既有財務模型。

## 交換格式
完整契約見 docs/finance-sync.md；對方 mock 已複製至 docs/finance-results-v1.mock.json，並由測試驗證符合網站 schema。

## 對方讀取實檔後發現的缺口
- 收入目前只有月彙總，沒有逐筆收入表。
- Excel 現有來源沒有網站 UUID、修改版本與刪除標記。
- 因此同步端需補映射／來源追溯，不能單純將網站 JSON 塞進工作表並宣稱同步成功。

## 網站端實作
- 記帳首頁：月份切換、收入／消費支出／月結餘摘要、支出分類、交易清單。
- 新增與編輯：依收入／支出／信用卡／資金異動顯示必要欄位；代墊回補保留實刷、已回補、點數折抵與結算狀態。
- 同步區：待同步數、匯出批次下載、回匯檔預覽、衝突與拒絕原因；預览後才套用。
- 先以 TWD 金額處理，不擅自推出外幣、退款跨月、分期、自動入帳或帳戶餘額推估。

## 確認的限制與驗證
- 帳本端目前僅有協議和 mock，尚無正式 adapter；網站交換流程已實作，真實 Excel 往返未驗證。
- recovery_required 批次在第一版持續封鎖；替代恢復回執尚未有雙方共同規則，不接受新回執繞過。
- 更新 Prisma 並重啟開發服務後，真實 GET /api/finance 能正常載入。瀏覽器測試只操作未儲存的表單；寫入、匯出、回匯、刪除及衝突以 mock API 測試驗證。
- npm run build、TypeScript、scoped ESLint 與 16 個 mock 測試通過，未更動正式帳務或 Excel。
