# 日隅記帳第一版

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
