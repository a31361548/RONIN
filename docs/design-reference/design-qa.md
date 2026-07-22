# 日隅第一版設計 QA

## final result: passed

本次 QA 以高保真首頁參考圖、本地登入後產品頁面與實際資料流進行對照，並檢查桌機側欄的 hover 展開、focus 展開、移出收合，以及月曆、會員管理、頭像裁切、Toast 與自訂下拉流程。

## 比對來源

- Source of truth: `docs/design-reference/high-fidelity-dashboard-v1.png`
- Implementation compact-view: `docs/design-reference/qa-dashboard-hover-collapsed-current.png`
- Previous expanded reference capture: `docs/design-reference/qa-dashboard-expanded-current.png`
- Additional settings capture: `docs/design-reference/qa-settings-current.png`
- Viewport: 本地 in-app browser 的桌機視窗，約 1660 × 950
- State: 已登入管理員帳號、目前資料庫為清空後空狀態、桌機側欄以收合為基準

## 驗證範圍

### 視覺與版面

- [x] 暖白背景、珊瑚色主動作、鼠尾草綠輔助狀態與深棕文字層級一致
- [x] 日隅 logo 已套用於側欄、桌機頁首、手機頁首與瀏覽器 favicon
- [x] 卡片使用柔和圓角、細邊框與低對比陰影，避免延續舊版科技感
- [x] 桌機主內容保留寬度上限，手機版改用底部導覽，避免橫向溢出
- [x] 空資料狀態使用真實提示，不產生虛構待辦、筆記或提醒
- [x] 收合側欄只保留清楚的 SVG icon，icon 不會因隱藏文字而被 flex 壓縮
- [x] `/dashboard/calendar` 使用日隅月曆版面，不再只是路由變更
- [x] `/admin/members` 使用日隅會員管理版面，不再延用舊版 Holo／Tactical 視覺
- [x] 頭像裁切視窗使用一致的暖色卡片、圓形裁切區與縮放控制
- [x] 設定頁移除不必要的「預設頭像」區塊，只保留目前頭像、上傳與裁切流程
- [x] Toast 使用符合日隅的淡色背景、細邊框、圓角與 SVG 狀態 icon，不引入舊版科技感
- [x] 自訂下拉使用與產品一致的卡片樣式、箭頭與選取狀態，避免瀏覽器原生 select 外觀不一致

### 互動與功能

- [x] 游標進入側欄時以 GSAP timeline 展開至完整導覽
- [x] 游標離開側欄時以同一組 timeline 收合，只留下 icon
- [x] 鍵盤 focus 進入側欄時展開，focus 移出時收合
- [x] GSAP timeline 使用 scoped `gsap.context()`，元件卸載時會 revert 清理
- [x] 導覽 icon 與文字保留 title、aria-label、aria-hidden 狀態，不影響可理解性
- [x] 月曆可切換前後月份、回到今天、選取日期，並顯示真實待辦與打卡資料
- [x] 月曆選取日期後顯示當日待辦，摘要數字來自目前使用者資料
- [x] 首頁快速新增可建立待辦或筆記並重新整理畫面
- [x] 首頁快速新增使用共用 `PersonalSelect`，可用鍵盤方向鍵、Enter、Space 與 Escape 操作
- [x] 待辦頁支援新增、編輯、完成／恢復、延後與二次確認刪除
- [x] 筆記頁支援新增、編輯、刪除與二次確認
- [x] 會員管理保留載入、搜尋、分頁、新增、編輯、停用／啟用與重設密碼 API 流程
- [x] 會員管理狀態欄位使用共用 `PersonalSelect`，不使用原生 select
- [x] 設定頁支援圖片上傳、圓形裁切、縮放、確認套用與失效頭像 fallback
- [x] 設定頁保留三種工作區底色偏好
- [x] 設定、首頁、待辦、筆記與會員管理的成功／錯誤回饋統一使用共用 `PersonalToast`
- [x] Toast 支援成功、錯誤、提示三種語氣，自動消失與手動關閉，並保留 aria-live／role 語意

## 實際瀏覽器檢查

- `/dashboard/calendar`: `data-testid="calendar-page"`、標題 `2026年7月`、月曆格線均存在
- `/admin/members`: `data-testid="members-page"` 與 `data-testid="members-client"` 存在，舊文案「指揮成員名冊」不存在
- `/dashboard/settings`: 頁面顯示「選擇並裁切頭像」，預設頭像區塊不存在，原生 select 數量為 0
- `/dashboard`: 快速新增存在共用下拉，原生 select 數量為 0；下拉可展開、顯示 2 個選項，選取「筆記」後會關閉並更新按鈕文字
- `/dashboard/notes`: 筆記頁存在，原生 select 數量為 0，預設頭像區塊不存在
- `/admin/members`: 會員管理頁存在，頁面未渲染原生 select；狀態自訂下拉於開啟新增／編輯視窗後呈現

## 實作判定

- 側欄採 6rem 收合寬度、16rem 展開寬度；主內容維持固定 `lg:pl-24`，避免 hover 時整頁跳動。
- 文字使用 `maxWidth`、`autoAlpha` 與位移同步動畫，收合狀態不再讓隱藏文字佔用 icon 空間。
- 月曆以目前使用者的 Todo／CheckIn 資料渲染，不新增示範資料。
- 會員管理沿用既有管理 API，這次只替換頁面與互動視覺，降低對既有資料流程的影響。
- 頭像先在瀏覽器端用 canvas 裁切成 JPEG，再送至既有上傳 API；沒有新增套件或改動資料庫 schema。
- `PersonalToast` 與 `PersonalSelect` 放在共用 UI 層，後續新增頁面可直接沿用，不必各自實作回饋列或原生下拉。
- 參考圖包含示範資料與四欄 widget 編排；目前產品刻意以清空後的真實資料與功能化空狀態呈現，屬第一版落地差異，不阻擋交付。
- 舊版未掛載於日隅路由的元件仍保留原生 select，這次不擴大修改範圍；目前使用者可見的日隅路由已完成替換。

## QA 結論

瀏覽器畫面已確認月曆、會員管理、設定、首頁與筆記頁的新介面存在；預設頭像區塊已移除，Toast 與自訂下拉互動正常，側欄互動與 icon 狀態正常。型別檢查與 lint 尚未執行，待取得執行權限後補做。
