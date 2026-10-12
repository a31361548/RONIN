# 共用下拉選單

`src/components/ui/PersonalSelect.tsx` 取代原生 select，無新增依賴。預設奶油色與珊瑚色，可使用 `variant="tech"` 保留舊頁面的深色風格。

## 單選

```tsx
<PersonalSelect
  label="帳戶"
  value={account}
  onChange={setAccount}
  options={[{ value: 'cathay', label: '國泰' }, { value: 'ctbc', label: '中國信託' }]}
/>
```

## 複選

```tsx
<PersonalSelect
  multiple
  ariaLabel="篩選記帳類型"
  value={types}
  onChange={setTypes}
  placeholder="所有類型（可複選）"
  options={[{ value: 'income', label: '收入' }, { value: 'expense', label: '支出' }]}
/>
```

- `value`：單選為字串；複選為字串陣列。空值顯示 placeholder，不會自動挑第一個選項。
- `multiple`：點擊切換勾選，選單保持開啟；提供清除選取與完成。清除只回傳空陣列，是否表示全部由使用頁面決定。
- `label`：顯示欄位標題；已有外部標題時使用 `ariaLabel`。
- `searchable`：可指定開關；複選或超過 8 個選項預設提供搜尋。
- `options`：支援 `description` 與單項 `disabled`。
- `required`：原生表單驗證會擋下未選取，將焦點移到選單並顯示訊息。
- `disabled`：停用欄位；也遵守父層 fieldset 的停用狀態。
- `name`：產生隱藏表單欄位；複選需透過 FormData.getAll(name) 取得。
- `size="compact"`：工具列較小尺寸；`className` 套在外層，用來配置寬度與間距。
- 支援方向鍵、Home/End、Enter/空白選取、Escape 關閉、Tab 前往下一欄及文字快速定位。
- 浮動選單依可用空間向上／下展開，長清單內部捲動，跟隨視窗與容器捲動；彈窗內仍留在原彈窗的焦點範圍。

表單修改追蹤請在 onChange 內更新 dirty 狀態；搜尋選項不算修改表單。

已接入記帳表單／複選交易篩選、行事曆年月、舊版卷軸與時間選取。原本使用 PersonalSelect 的首頁、待辦與會員管理自動沿用元件。

回退僅需還原 PersonalSelect 與本次接入處，無資料庫或資料格式變更。

## 驗證

- TypeScript、Next 正式建置與共用元件／記帳／行事曆 scoped ESLint 通過；舊版 ForgeArchive、TechCalendar 的 12 個既有函式回傳型別警告保留。
- 瀏覽器確認單選與複選、清除、搜尋、方向鍵與空白／Enter、Escape 僅關閉選單、必填支付方式、未儲存確認及年份／月份切換正常。
- 390 × 844 手機尺寸下清單位於視窗範圍內，完成後已清除測試篩選並還原視窗尺寸；未儲存任何測試帳務。
- 設計截圖：select-multiple.png、select-mobile.png。
