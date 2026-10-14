# Next.js 升級與 Excel 接收｜本機驗證結果

2026-10-14。修正清單頁建置阻礙，補上本機 Excel 接收工具與 v2 現金／收入來源；保留先前 P1 修改。

## 已完成

- Next.js／eslint-config-next：16.0.8 → 16.4.0（npm latest 與官方 release 核對）。ESLint 9、TypeScript ESLint 8 沿用既有 flat config，lint 改用 `eslint src`。
- NextAuth 更新至 4.24.15；最低依賴版本也更新。React 18 保留現有相容性，Next 16 提示未來需升級 React 19。
- 清單詳情頁改為 Promise params 並 await 取得 ID，解除建置型別錯誤。
- 本機接收工具提供預覽、唯一寫入者確認、備份、提交／回退日誌、官方 sync／validate、完整回執。網站新批次使用 v2；舊批次保留原版本與快照。
- 現金錢包保存付款帳戶；收入建立真正有日期的明細與原月收入基線，疑似重複需人工確認。只有指定帳本實際接收時才建立新來源結構，本次僅使用副本。

## 實際檢查

| 檢查 | 結果與範圍 |
| --- | --- |
| TypeScript | tsc --noEmit --incremental false 通過 |
| Scoped ESLint | finance 模組／API／元件、修改的共用 UI、清單詳情頁通過 |
| API／UI | 52 tests：51 pass、0 fail、1 skip；含 API → XLSX 接收核心 → 回匯／重送，DB 使用交易式記憶體 mock |
| 接收核心 | 13 tests 全過；錢包、收入基線、配對、版本、重複核對與來源回讀 |
| 故障注入 | 3 tests 全過；安全回退、恢復封鎖、提交後回執輸出失敗與取回 |
| 帳本副本整合 | 1 test 通過；現金、收入、已結算信用卡／支出配對、卡費異動，使用帳本端實際 sync／validate；正式 Excel／DB bytes 未變 |
| 完整建置 | npm run build 通過（Prisma generate + Next 16.4.0 預設 Turbopack）；Webpack 亦通過 |
| 本機服務 | localhost:1026 已恢復；記帳頁、finance API、登入 session 皆 HTTP 200 |
| Codex 瀏覽器 | 桌面載入、v2 提示、現金錢包表單正常；未儲存表單已取消；console 無 error；390×844 無水平溢出；暫時分頁已關閉、尺寸已恢復 |

合計 68 pass、0 fail、1 skip。測試使用虛構新帳與正式來源副本，尚未寫入真實帳目。畫面：[桌面](finance-v2-desktop.jpg)、[手機](finance-v2-mobile.jpg)。接收操作與恢復：[finance-exchange-v2.md](finance-exchange-v2.md)。

## 資安狀態與限制

- 最後 npm latest 為 16.4.0。官方預告 10/14 將發布上游兩項 Critical、一項 High 修補；核對時尚未提供修補版本，不能宣稱這些公告已處理。
- npm audit --omit=dev：0 critical、6 high、4 moderate；Next／NextAuth 不在此報告的漏洞項目。其餘涵蓋 Tiptap／ProseMirror、brace-expansion、fflate、linkify-it、markdown-it、preact、source-map-js、uuid／ExcelJS 等直接或間接依賴。這是套件節點計數，不等同 10 個可利用攻擊路徑；需另行核對實際用途與相容升級。
- 不執行跨主版本 audit fix --force。middleware → proxy、React 19 與 Browserslist 為非阻斷提示，留待獨立修改。
- recovery_required 的替代回執／網站解鎖尚無共同規則，因此維持封鎖。帳戶轉帳、退款、點數與正式刪除仍需人工流程。
- 新版 next dev 自動產生專案 AGENTS.md 的 Next 文件指引，保留生成內容。

## 發布與回退

使用者指定：修改與檢查 → Codex 開啟 localhost 驗證 → 回報 → 使用者自行推 GitHub main → Vercel 自動同步。此次沒有 commit、push 或部署，也沒有在正式 domain 測試。

回退只移除此輪 Next／工具修改，保留先前 P1 變更；依賴需連同 package.json、lockfile 與 ESLint 設定處理。回退 v2 預設匯出時，仍需保留已存在 v2 批次的解析。帳本端已導入資料不得隨程式回退刪除，依接收文件核對來源、備份與日誌。

## 官方來源

- [Next.js 16.4.0 release](https://github.com/vercel/next.js/releases/tag/v16.4.0)
- [Next.js 16 升級文件](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [10/14 安全更新預告](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026)
