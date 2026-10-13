---
name: 日隅
description: 日常的私人角落；溫暖、安靜、可掌控。
colors:
  primary: "#e98a7a"
  primary-hover: "#d97568"
  accent-text: "#a85b4e"
  sage: "#a9b9a3"
  paper: "#fff9f4"
  page-sage: "#f3f7f0"
  page-sky: "#f1f6fb"
  surface: "#fffdfa"
  surface-inset: "#faf3ed"
  selected: "#f6e5d9"
  ink: "#2e2a28"
  heading: "#3f3530"
  body-text: "#4a413c"
  secondary-text: "#776e68"
  muted-text: "#8d7f76"
  field-text: "#695e57"
  border: "#eaded4"
  field-border: "#e5d9cf"
  danger-surface: "#fff0ed"
  danger-text: "#a4483b"
  warning-surface: "#fff8e7"
  warning-text: "#806023"
  success-surface: "#f2f8ef"
  success-text: "#4f704e"
typography:
  headline-mobile:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "40px"
    letterSpacing: "0.12em"
  headline-desktop:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
    fontSize: "48px"
    fontWeight: 700
    lineHeight: "48px"
    letterSpacing: "0.12em"
  section-title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "28px"
  workspace-body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  portal-body:
    fontFamily: 'Quicksand, "Noto Sans TC", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  modal-title:
    fontFamily: 'Quicksand, "Noto Sans TC", sans-serif'
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "33.6px"
  field-label:
    fontFamily: 'Quicksand, "Noto Sans TC", sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  source-value:
    fontFamily: 'Quicksand, "Noto Sans TC", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "28px"
  caption:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  sm: "8px"
  control: "12px"
  field: "16px"
  card: "24px"
  modal: "32px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  panel: "20px"
  section: "24px"
  modal-desktop: "28px"
  page-top: "32px"
  page-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.field}"
    padding: "12px 20px"
  button-transaction:
    backgroundColor: "{colors.surface-inset}"
    textColor: "#795747"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.field-text}"
    rounded: "{rounded.control}"
    padding: "0px 12px"
    height: "44px"
  select-trigger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.field-text}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  nav-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.field}"
    padding: "12px"
  tag-unselected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary-text}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    rounded: "{rounded.modal}"
    padding: "20px"
---

# Design System: 日隅

## Overview

**Creative North Star: "日常的私人角落"**

日隅以溫暖、安靜、可掌控的私人空間整理日常。紙張米白與低飽和色彩承接內容，暖珊瑚引導操作，鼠尾草綠提供品牌陪襯。圓角親切，文字與狀態清楚；畫面的情緒不應蓋過使用者要完成的事情。

元件共同氣質是「柔和但操作明確」。日常卡片以底色與邊框分組，彈窗和選單以陰影浮起。字體、顏色、尺寸與層級擷取自現行實作；意象、色名及深度語言由使用者於 2026-10-13 確認。

**Key Characteristics:**
- 溫暖的紙張底色、珊瑚重點、植物色陪襯。
- 平實的內容表面，浮起的暫時操作面板。
- 圓角、留白、線條圖示與明確的狀態文字。
- 桌面側欄與手機底部導覽共同支持日常操作。

本文件描述個人工作區的現有視覺。來源為 `src/app/personal-overrides.css`、`src/app/layout.tsx`、`src/components/layout/PersonalShell.tsx`、`src/components/ui/Personal*`、記帳與行事曆元件，以及 `docs/design-reference/brand-identity.md`。2026-10-13 已在 localhost 記帳頁抽樣確認 computed styles；未對所有路由重新驗證。

`globals.css` 仍保留舊科技風 tokens；個人工作區的覆寫、字面色碼與實際瀏覽器樣式優先。文件不表示舊 CSS 已移除，也不表示目前所有組合已通過可及性檢查。YAML 是這份文件的數值基準，沒有建立新的執行期 CSS variables。

## Colors

### Primary

- **暖珊瑚**（`primary`）：主要新增／儲存操作、選中的日期及品牌圖形。
- **深珊瑚**（`primary-hover`）：行事曆新增與儲存按鈕的 hover，以及輸入焦點邊框；記帳頁部分主按鈕尚未提供同樣 hover。
- **珊瑚棕**（`accent-text`）：選取導覽、次要操作與重點文字。

### Secondary

- **鼠尾草綠**（`sage`）：Logo 圓點與品牌陪襯。完成與核對表面使用獨立的淡綠及深綠語意色，不能僅靠品牌綠表示成功。

### Neutral

- **紙張米白**（`paper`）：body 與預設工作區背景。
- **霧葉底色／淡天空底色**（`page-sage`、`page-sky`）：PersonalShell 已有的可選工作區表面，依個人設定切換。
- **暖白表面／內嵌紙面／選取紙面**（`surface`、`surface-inset`、`selected`）：卡片、欄位、次要控制與選取狀態。
- **墨褐／標題褐／內容褐**（`ink`、`heading`、`body-text`）：一般文字、頁面標題與彈窗內容。
- **次要褐／淡褐／欄位褐**（`secondary-text`、`muted-text`、`field-text`）：導覽、輔助資訊與表單文字。
- **紙邊／欄位邊線**（`border`、`field-border`）：內容分組、欄位邊界與細分隔線。

### Semantic states

錯誤、待處理與成功各有表面／文字配對（`danger-*`、`warning-*`、`success-*`）。Excel 匯入預覽另有藍色「可更新」與灰色「已匯入」，其字面值以 `FinanceHistoryImport.tsx` 為準；不是新增的全域品牌色。

**The State-with-Words Rule.** 色彩與明確狀態文字一起使用。珊瑚主操作不等於錯誤；黃色待對照不等於資料損毀；綠色總額一致不等於逐筆帳目已核實。

前次 audit 已確認主按鈕白字／暖珊瑚（2.51:1）與部分淡褐小字不足以達一般文字對比目標。這是現有待修正組合，不是未來頁面的合格範例；本次只記錄，不換色。sidecar 的色階為預覽用合成色階，不是已實作色彩 tokens。

## Typography

**Display / workspace font:** 目前 PersonalShell 的 `font-sans` 使用系統無襯線字體堆疊。

**Body / portal font:** body 的個人覆寫使用 Quicksand、Noto Sans TC、sans-serif；掛在 body 的 PersonalModal／選單 portal 繼承此堆疊。Google Fonts 載入字重 400／500／600／700。

兩種堆疊並存是已觀察實況，不是已完成字體統一。不能僅從 body 宣告推斷整個 Dashboard 都是 Quicksand。中文由瀏覽器按字形涵蓋範圍回退；不宣稱所有裝置已載入相同字型。

### Hierarchy

- **頁面標題**：行事曆／記帳窄版（36px／700／40px），`sm` 起（48px／700／48px），字距（0.12em）。其他頁面的標題以各頁元件為準。
- **區塊標題**：已觀察（16px 或 18px／700）；使用 18px 的區塊行高（28px）。
- **彈窗標題**：目前 `text-xl` 由 globals 的 theme 映射成（24px／700），computed 行高（33.6px），不能套用 Tailwind 預設 20px 推算。
- **內容**：一般（16px／400／24px）；來源明細數值（16px／600／28px），欄位名稱字重 500。
- **表單標籤與操作**：（14px／500–700／20px）；標籤與欄位的上下間隔（8px）。
- **輔助資訊**：現有（12px／16px）與手機導覽（11px）均有使用。重要日期、帳務來源及狀態偏小是 audit 待修正項目，不應擴大使用範圍。

**The Actual-Font Rule.** 保留目前頁面與 portal 的字體適用範圍；字體統一需另作明確修改。長中文說明使用自然字距，0.12em 的展示字距只用在已建立的短標題／品牌文字。

## Layout

PersonalShell 主內容滿寬、置中，上限（1152px）。水平邊距窄版（20px）、`sm`（32px）、`lg`（40px）；上方（32px），手機底部（112px）為固定底部導覽留空，桌面底部（48px）。

桌面 `lg` 起使用左側導覽：收合（96px）、展開（256px），滑入或鍵盤焦點進入會展開；內容固定留（96px）左距，展開側欄覆蓋部分內容。手機使用五格底部導覽，位置距左右／下方（16px），圓角（24px）。

常用間距為 4／8／12／16／20／24／28／32／40px；屬觀察到的尺度，不要求每個間距都為 8 的倍數。大卡片通常 padding（20px），部分 `sm` 起（24px）；區塊間常為（24px）。

記帳摘要為窄版兩欄、`lg` 四欄；交易／側面資訊在 `xl` 形成主欄加（280px）側欄。行事曆主欄與當日面板同樣依寬度排列。彈窗寬度上限預設（672px），最大高度（88dvh）；padding 窄版（20px）、`sm` 起（28px），內容可捲動。

目前記帳仍為單一頁面；帳目、報表與預算、Excel 帳本三個子入口是獨立的頁面規劃，見 [記帳入口規劃](docs/design-reference/finance-navigation.md)。此頁面策略沒有升格為所有功能的全域導航規則。

## Elevation & Depth

使用者確認的原則是「日常卡片平實，彈窗與選單才浮起」。大部分記帳卡片以色面、邊框分組且沒有陰影；行事曆卡片仍有低強度陰影。主按鈕、側欄與手機底部導覽也已有輕陰影，不應把現況記成完全無陰影。

### Shadow vocabulary

- 彈窗：`0 24px 80px rgba(74,55,43,0.22)`。
- 下拉面板：`0 16px 48px rgba(74,55,43,0.18)`。
- 日期面板：`0 18px 60px rgba(74,55,43,0.2)`。
- 手機導覽：`0 18px 48px rgba(112,82,62,0.14)`。
- 行事曆表面：`0 16px 44px rgba(112,82,62,0.06)`。

彈窗遮罩用墨褐（30%）加背景模糊（3px）。目前層級是 header 30、導覽 40、modal 90、日期面板 105、下拉面板 110；保留巢狀操作面板高於父彈窗的關係。

**The Temporary-Lift Rule.** 強陰影集中在短暫操作層；日常資料卡依靠文字、間距、底色與細邊線分組，不為每個區塊增加浮起感。

## Shapes

短小選項常用圓角（8px），交易按鈕及輸入框（12px），主要按鈕、選單觸發器與導覽項（16px），大卡片與日期面板（24px），彈窗（32px），標籤／頭像使用完整圓形或膠囊。

邊框通常（1px），顏色溫暖且低強度。Logo 使用既有折角紙張圖形；小尺寸採圖形 mark，不縮小完整字標、不拉伸、不旋轉、不加霓虹或全息效果。正式資產以 `docs/design-reference/brand-identity.md` 與 `public/image/brand/` 為準。

## Components

### Buttons

主要動作為暖珊瑚底、白字、圓角（16px）、padding（12px 20px）。次要動作為暖白底、細邊框與珊瑚棕字。交易列按鈕圓角（12px）、最小高度（44px），有 hover、active 及（2px）focus-visible ring；其他部分按鈕目前僅依瀏覽器預設焦點，並未全部共享同一套狀態。

Disabled 元件保留明確不可操作語意，視覺常為 opacity（50%）。儲存中替換操作文案。白字主按鈕對比問題仍待修正。

### Cards / Containers

圓角（24px）、暖白底、紙邊細框；padding（20px），部分桌面（24px）。內嵌說明用不同紙面分組，不能以大量同級大卡片取代資訊優先序。狀態面板保留圖文或文字，不只換底色。

### Inputs / Fields

一般輸入框高（44px）、圓角（12px）、左右 padding（12px），欄位細框。focus 用深珊瑚邊框及暖珊瑚（15%）的（4px）ring。搜尋欄位已有高（40px）的 compact 例外。文字區依內容增加高度；標籤、可留白說明及錯誤資訊保留在相關控制附近。

### Select

使用 PersonalSelect，支援單選、複選、搜尋選項、停用選項與鍵盤移動。觸發器圓角（16px）、一般最小高（44px）、compact（40px）；面板掛在 portal，最小高（44px）的選項使用不同紙面表示 hover／選取。複選以兩個摘要 chips、額外數量與「清除選取／完成」呈現，不把每個已選項塞滿觸發器。

### Date picker

PersonalDatePicker 支持日／月模式、自製年份與月份選單、方向鍵及 Home／End／PageUp／PageDown。選取日期用主色，今天用選取紙面；可留白欄位提供清除。日格依容器呈方形，不宣稱每格已達（44px）；小日格是既有手機操作待改善項目。

### Modal

PersonalModal 是 portal 元件，有 dialog 語意、標題關聯、Escape、焦點限制、關閉後焦點返回及背景捲動鎖定。busy 時禁止關閉。未儲存內容的放棄確認由各業務元件自行處理，不是所有 modal 自動具備；收入核對目前缺相同草稿保護。

### Navigation

桌面線條圖示（20px）、導覽文字（14px／600），選中項使用選取紙面及珊瑚棕。手機圖示加文字（11px），五格底部導覽。sidebar width 動畫（340ms／power2.out），文字淡入約（200–220ms）；目前沒有局部 reduced-motion 分支，文件記錄現況，不宣稱此能力已完成。

### Chips / Tags

PersonalTagPicker 使用膠囊形標籤，未選時暖白底加細框；選中後採實際 `tag.color` 加白字及移除符號，ARIA 狀態區分加入／移除。sidecar 固定用暖珊瑚示範選中狀態，這不是所有標籤的固定顏色，也不是已驗證的合格對比搭配。

## Do's and Don'ts

### Do:

- **Do** 保持「日常的私人角落」與「柔和但操作明確」，讓內容與操作結果可理解。
- **Do** 複用 PersonalSelect、PersonalDatePicker、PersonalModal 的既有行為，保留標籤、鍵盤焦點及狀態文字。
- **Do** 依頁面實際字體範圍、響應式尺寸與色面設定延伸；需要統一時另作明確變更。
- **Do** 在新增介面及修正時檢查文字對比與觸控尺寸；將 audit 不足列為待修正，不能把既有小字或低對比當成品質要求。
- **Do** 將頁面策略與未完成能力寫在各頁規劃／產品文件，讓 DESIGN.md 專注於視覺系統。

### Don't:

- **Don't** 把舊 samurai／holo 全域 tokens 當作目前個人工作區的視覺權威。
- **Don't** 改寫或變形既有日隅 Logo，加入品牌文件禁止的霓虹／全息效果。
- **Don't** 只靠紅、黃、綠表示資料狀態或成功；總額相同不等於逐筆核實。
- **Don't** 把 sidecar 合成色階、靜態元件預覽或未實作子選單寫成執行期已完成的功能。
- **Don't** 把 Quicksand 視為所有 Dashboard 元件的現有字體，或把尚未測試的可及性能力寫成已通過。

格式參考：[DESIGN.md format specification](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md)。延伸的陰影、動態、斷點與靜態元件預覽保存在 `.impeccable/design.json`。
