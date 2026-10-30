# FIELDWORK Node.js 22 與 Go 遷移設計

## 決策與範圍

基準：2026-10-30 取得原網站第 37 版，Git commit `cb65d1802c72a8576fab8845f261c1956b7c6983`。原網址 https://factory-deployment-readiness.fastbun16.chatgpt.site 。

本階段採工程化遷移，不重畫、不轉換 React、不改 DOM 或 CSS。Node.js 是執行環境，原生瀏覽器 JavaScript 不需要為此改寫。所有 dist 資產完整保留；`frontend-baseline.json` 記錄每一檔案的 SHA-256。新專案有獨立 Git 與部署身分，不更新原網站。

Node 22 是目標開發／靜態服務執行環境；Go 將是獨立後端。Sites 新網址發布靜態前端，實際主機為 Cloudflare Workers，並不是 Node.js 22 程序。`npm start` 與 Dockerfile 提供可部署至 Node 22 主機的交付形式。此環境目前 Node 為 24.22.1，不能將目前測試稱為 Node 22 實機驗證。

## 現況架構盤點

| 層 | 程式與責任 |
| --- | --- |
| 入口 | dist/index.html：原生 DOM，無 SSR、React、Next.js |
| 視覺 | dist/decision.css：含桌面、手機與全螢幕樣式 |
| 操作與狀態 | dist/decision.js：三角色、篩選、選取、試算、抽屜與導覽 |
| 圖形 | Cytoscape 隨附本地 vendor；graph-viewport、graph-scrollbars、department-ui |
| 判定 | factory-model、decision-model：工廠情境、Gate、完整祖先、SCC、版本與證據 |
| 專屬工作區 | decision-workspace、cycle-workbench、cycle-model、decision-projection、decision-reasons |
| 批次管理 | batch-workspace、batch-model |
| 證據與影響 | evidence-model、downstream-evidence、affected-model、view-model |
| 資料檢視 | data-docs，factories.json 與 schema.json |
| 資料儲存 | JSON 快照；候選與草案採瀏覽器 localStorage，不是共享資料庫 |

原始 README 的歷次功能與驗證說明完整保留在 UPSTREAM.md；docs 保留原圖像設計證據。沒有發現獨立 Figma、設計原稿或既有後端程式，不能將它們列為已取得。瀏覽器原網址中的 localStorage 不會自動跨網址移轉，原有下載／匯出功能仍保留。

## UI/UX 與功能驗收矩陣

| 範圍 | 必須保留的行為 | 驗收方法 |
| --- | --- | --- |
| 全域 | 工廠／資料情境切換、三角色入口、選單縮合、合成資料樹預設縮合 | 資產一致＋桌面／手機操作 |
| 工廠 | 開工協調、優先順序、共同阻擋、下游解除試算 | 原 decision、management、affected 測試＋操作 |
| 部門 | 部門／產品長條卡、縮合、搜尋、多選、候選選取 | view-model、management＋操作 |
| 產品 | 完整前置、層級、上游／下游、版本／里程碑／證據 | evidence、downstream-evidence＋操作 |
| Graph | 橫／縱向、捲軸、縮放、全螢幕、檢視歷史、點選高亮 | viewport、scrollbars、hover＋瀏覽器 |
| 過濾 | 多選、模糊搜尋、狀態交集、隱藏目標提示、清除 | view-model＋操作 |
| 模擬 | 單項完成／取消、清除、結果排序與正式快照隔離 | decision、management、reasons |
| 循環 | SCC、相互等待、條件證據、解除試算與工作區 | cycle、decision、reasons |
| 專屬工作區 | 足夠大範圍、精簡／完整 Graph toggle | 原碼一致＋操作 |
| 批次候選 | 同時開工檢查、草案、下載、本機儲存 | batch 相關原邏輯＋操作 |
| 說明與資料 | 原始資料搜尋分頁、Schema、規則說明 | 原碼一致＋操作 |
| 響應式 | 桌面與手機排版、抽屜、對話框、滾動 | 原 CSS 一致＋多尺寸檢查 |

雜湊相同可證明交付的程式、樣式與資料沒有變更；它不等於所有瀏覽器、所有資料與所有互動的實測保證。新增伺服器的 MIME、檔案內容、HEAD、404、405、保留 API 邊界與路徑隔離有獨立測試。原測試中含源碼斷言者只代表靜態合約通過。

## 未來 Go 分層與契約（提案，尚未接入 UI）

前端呈現 → 資料存取 adapter → `/api/v1` → Go domain service → DB。

第一階段先保留前端純函數判定。Go 首先供應相同形狀的 snapshot，adapter 將 API 回應轉為原 bundle；不把瀏覽器 DOM 或 CSS 搬至 Go。新資料介面須驗證通過後才替換現有兩個 JSON fetch。當前 Node `/api/*` 明確回 501；線上靜態預覽不提供 Go API。

| 介面 | 輸入／回應設計 | 原則 |
| --- | --- | --- |
| GET /api/v1/snapshot | 原 factories.json 形狀，外加 ETag／snapshot revision header | 首次接入可保持原 factoryData 呼叫 |
| GET /api/v1/schema | 原 schema.json 形狀 | 以正式 OpenAPI／JSON Schema 演進，避免把樣本推論當成正式契約 |
| GET /api/v1/factories | 工廠清單 | 每次驗證授權工廠範圍 |
| POST /api/v1/evaluations | factory_id、profile、snapshot_revision、trial_instance_ids | 無副作用；回傳 Gate／SCC／影響與 reason evidence |
| GET/POST /api/v1/plans | 工廠、候選項目、草案開始日、revision | 草案不能直接變成正式排程 |
| PATCH /api/v1/plans/{id} | If-Match、變更欄位 | 樂觀鎖，衝突 409／412，不覆寫他人草案 |

每個服務端請求檢查身分與工廠授權；時間帶使用帶 offset 的 ISO 8601；instance_id、edge_id 保留；snapshot 固定後計算；GET 不改資料；模擬與正式變更分離；寫入具稽核與冪等鍵。正式 schema、DB 選型、認證供應者尚未定案，不在此次憑空實作。

## 逐步執行與驗收門檻

1. 基準封存：完整 source、資料、視覺資產、原測試與 SHA；以新網址驗證。
2. Node 22 工程化：零 UI 改動，Node 22 CI／容器實機重跑測試與 HTTP smoke；通過後才作正式 Node 22 runtime 驗收。
3. 資料 adapter：以 snapshot API 等價回放測試，固定原快照，三工廠兩情境結果逐項一致。
4. Go 只讀服務：相同 DTO、錯誤處理與版本；API 故障顯示明確失敗，不默默換合成資料。
5. 判定移轉：將 JS Gate／SCC／版本／過期證據／無階梯式完成語義變為跨語言 golden fixtures，逐項比較 Go，確認一致再切流。
6. 草案持久化：使用者明確匯入本機草案、多人衝突、稽核與授權測試；最後才串正式排程。

每階段獨立版本可回退。正式放行需完整互動矩陣、多尺寸、多瀏覽器、Go 故障與資料量測試通過；本階段不宣稱已完成後續 Go 後端。
