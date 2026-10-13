# 日隅記帳第一版

## 帳目可讀性、Excel 核對與同步入口
- [x] 1. 放大來源明細；匯入／同步置頂；月彙總改為支出核對。
- [x] 2. 收入同月／同分類／同金額提示核對；確認已包含或另一筆收入，保存註解與可撤回標記。
- [x] 3. API 會員、版本及彙總變更檢查；未核對收入阻擋重複匯出，不假造正式同步。
- [x] 4. 沿用已准型別、scoped ESLint、mock、建置與桌面／手機驗證，不提交真實帳務。

月彙總沒有收入日期，僅提示可能重複，不能自動替換；使用 sourceRefs 本地核對註記，不修改 Prisma、依賴或 Excel v1 契約。

41 tests 全過、TypeScript、scoped ESLint、最終 next build 通過；桌面／390×844 比較、來源字體及核對選項驗證完成，未保存真實核對或帳務。初驗 lint 配置、union narrowing、mock reset 問題已修正；已取消測試表單並關閉暫時分頁。說明與回退：docs/finance-income-reconciliation.md。

## 現金錢包與匯入預覽狀態修正
- [x] 1. 核對現金帳戶與 Excel 交換邊界；沿用使用者授權向「總管(3代)」詢問契約。
- [x] 2. 補現金錢包與舊設定相容；現金和銀行對照分開。
- [x] 3. 狀態明確分色、待補對照集中處理，錯誤列仍顯示分類／付款／日期／金額。
- [x] 4. 沿用已授權型別、scoped ESLint、mock 測試與建置；以虛構檔案驗證桌面／手機，不提交真實帳務。

驗收：現金不再強迫歸銀行；待補對照為黃色、資料錯誤紅色、可新增綠色、更新藍色、已匯入灰色；不改正式帳本、不破壞原有 JSON 批次。

35 tests、型別、scoped ESLint 與最終 next build 通過。瀏覽器確認現金分類／錢包、狀態篩選、補對照後黃色轉綠色、390×844 無水平溢出；新增現金預設錢包，轉帳僅提供銀行。未確認匯入或儲存帳目，未修改正式 Excel；測試表單已放棄，測試分頁與虛構檔案已清理。回退與 v1 同步限制見 docs/finance-history-import.md。

## Excel 歷史帳目匯入
- [x] 1. 核對正式工作表、日期、缺漏欄位與來源 ID。
- [x] 2. 實作受限 XLSX 解析、分類／帳戶對照、逐筆預覽與去重。
- [x] 3. 確認後原子匯入；歷史資料不冒充同步回執，不重新匯出。
- [x] 4. UI、mock API、真實帳本唯讀解析、型別／lint／build／瀏覽器驗證。

不修改正式 Excel、不自動匯入真實帳務；投資第二版。使用者已允許安裝 ExcelJS、JSZip 與 Python 唯讀檢查，驗證沿用既有許可。月收入僅有彙總，不能捏造入帳日期或逐筆收入。

34 tests、型別及 scoped ESLint 通過；正式 Excel 175 列／166 組唯讀解析成功。瀏覽器虛構檔案預覽、明確帳戶對照、搜尋、確認門檻及手機尺寸通過，未提交帳務。初次完整建置成功；最後小修再次 npm run build 被開發服務的 Prisma DLL 鎖定，改以既有產生檔 next build 驗證。沙箱內 CSS 子程序受限，在核准權限下於沙箱外建置完整成功。成果與回退見 docs/finance-history-import.md。

錯誤與修復：npm 沙箱 ENOTFOUND 經核准安裝成功；主 XML 命名空間前綴及未格式化／ISO 日期經記憶體相容處理修正；不同命令 TEMP 沙箱路徑不穩，虛構測試檔改用明確專案路徑並於測試後清理；畫面確認固定 footer 遮住預覽列，已移除覆蓋。沒有修改正式 Excel 或資料模型。

## 自訂日期與月份選擇器
- [x] 共用元件：日期格、月份格、年／月切換、今天／清除、鍵盤與必填驗證。
- [x] 套用記帳首頁、交易表單、預算與模板設定、報表日期。
- [x] 型別、scoped lint、日期邊界、正式建置、桌面與手機彈窗驗證。

範圍僅日期輸入介面，不更改帳務／資料庫／Excel 契約，也不安裝套件；沿用既有驗證許可。

已完成，25 tests／型別／ESLint／建置／桌面及手機檢查通過。成果與回退見 docs/personal-date-picker.md。首個整檔 patch 因讀取輸出末尾空行而未匹配，改為逐行精準 patch；兩次 orchestration 語法誤植未執行，已修正。初驗 button 不支援 aria-required／aria-invalid 的 lint warning 已移除，必填與錯誤提示由表單驗證 input／aria-describedby 保留。

## 記帳客製化補充
- [x] 1. 個人設定資料與會員隔離、版本檢查；保留既有 Excel payload。
- [x] 2. 設定中心：分類／子分類、顏色圖示、排序停用、帳戶名稱與預設值。
- [x] 3. 常用模板、複製記帳、週／月待確認提醒。
- [x] 4. 月預算與分類預算、自訂期間分類報表、六個月收支趨勢。
- [x] 5. 型別、lint、mock API、建置與瀏覽器驗證。

帳戶目前只提供既有正式帳戶的名稱／排序／停用／預設；新增銀行或信用卡、轉帳、退款、分期需擴充 Excel 契約，不能用錯誤帳戶代替。設定與本地分類不寫入交換 payload，Excel 修正分類後以正式分類顯示。

客製化完成：型別、ESLint、24 tests 與正式建置通過；桌面與手機瀏覽器驗證完成，最後分頁入口修正也重新建置成功。Prisma 引擎曾因服務鎖定失敗，使用者同意重啟後 generate 完整成功並恢復服務。瀏覽器分頁曾被協定限制拒絕，使用者重新開啟後驗證成功，未繞過限制。讀檔時誤用 personal 路徑、首個 patch 目標不符、useTemplate 名稱被 lint 誤判 hook、nullable revision 型別及 ES lib 不支援 at 的問題均已修正；瀏覽器 date fill 未觸發 React change，改用原生鍵盤事件驗證成功，未修改程式繞過。

## 目標
建立獨立記帳入口，支援收支、信用卡、代墊回補、卡費與月報，以及 Excel 主帳本的匯出和同步結果回匯。

## 階段
- [x] 1. 與「總管(3代)」確認交換協議、欄位與同步規則。
- [x] 2. 實作資料模型、驗證與會員隔離 API。
- [x] 3. 實作交易、月報、匯出與回匯預覽畫面及導覽。
- [x] 4. 驗證同步衝突、重複回匯、刪除與金額計算，完成型別、lint、建置及瀏覽器檢查。

## 已確認決策
- Excel 是正式主帳本，網站為日常輸入與檢視工具；透過使用者交付檔案交換。
- 投資留到第二版，記帳不連結行事曆。
- 固定 ID、匯出批次、修改版本、刪除標記與同步結果需可追蹤。
- 回匯先預覽，不覆蓋匯出後的網站修改。
- 不修改現有正式 Excel 資料，不安裝依賴；使用者已同意重啟 localhost:1026 開發服務。
- 沿用本對話已允許的 prisma validate/generate、TypeScript、scoped ESLint、mock API tests 與 build 驗證。

## 尚待確認
- 交換契約已對齊；帳本端目前僅有契約與 mock，正式 Excel adapter 尚未完成。

## 錯誤紀錄
- 初次讀檔誤用 Get-Content -Path 與 -LiteralPath 並列，以及不存在的 auth.ts；已改讀正確 LiteralPath 與 currentUser.ts。
- Prisma generate 沙箱 spawn EPERM；沙箱外仍遇 engine DLL 被執行中程序鎖住，型別與 JS 已產生但最後 engine 複製未完成。不啟停服務。
- TypeScript 初驗發現 MongoDB nullable Json 應用 null 而非 DbNull，以及 discriminated union 匯出型別；已修正並通過。
- 瀏覽器 GET 初驗遇舊開發 Prisma 實例與 Node module cache 缺少新 model；僅檢查 model 重新實例化仍無法刷新載入的舊模組，已撤回此 workaround。需要重啟現有服務，已提出明確許可問題。
- read_thread 初次 maxOutputCharsPerItem 超上限；已改為 20000。

## 狀態
網站第一版完成：16 個 mock API/計算測試、TypeScript、新增檔 ESLint 與 npm run build（含 Prisma generate）均通過。ESLint 8 須使用現有 .eslintrc.json，設定 ESLINT_USE_FLAT_CONFIG=false。

已依許可停止確認屬於本專案的開發程序、更新 Prisma 並以 npm run dev 重啟 localhost:1026。瀏覽器實際資料讀取成功，摘要、交易區與同步區可正常載入；新增信用卡表單顯示 1000 - 250 = 750，取消及放棄確認正常。表單測試未儲存，未寫入測試帳務。正式 Excel adapter 尚未完成，尚不能宣稱完成真實帳本的端到端同步。

回退：只移除本次 finance 新檔、導覽及 Prisma finance 模型；保留先前日曆／筆記／標籤修改。此次未執行資料庫 migration/db push 或修改正式 Excel。
