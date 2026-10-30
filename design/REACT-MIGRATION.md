# FIELDWORK：React + Node.js 22 + Go 遷移規劃

更新日期：2026-10-30

## 目標與目前狀態

前端明確採用 React，以 Node.js 22 作為開發、測試與建置環境；未來 Go 提供後端 API。現有網站第 37 版是唯一 UI/UX、資料與功能基準。新網址交付的是完成 React 遷移並通過驗收的版本。

已取得原始專案、資料、既有測試及設計操作截圖，原版是原生 HTML/CSS/JavaScript 與 Cytoscape，沒有 React。先前建立的 Node 靜態服務只是工程化基準，不算完成 React 改寫，也尚未發布新站。原站不變更。

## 技術架構

| 層次 | 目標設計 |
| --- | --- |
| 前端 | React + TypeScript，使用 Vite 建置；精確版本與 Node 22 相容性於實作開始時核對並鎖定 |
| UI | 沿用原 CSS、色彩、尺寸、DOM 層級、響應式斷點及文字，不重新設計 |
| Graph | 沿用原 Cytoscape 與圖形邏輯；由 React 元件管理容器與生命週期 |
| 狀態 | useReducer + 分區 Context；畫布實例與 viewport 用 ref，不將 Cytoscape 物件放入可序列化狀態 |
| 判定 | 先保留現有純 JavaScript 模組；由 TS 型別封裝呼叫，避免改語言同時改規則 |
| 資料 | repository/adapter 先讀原 JSON，之後切換 Go snapshot API |
| Node.js 22 | 開發、測試、建置；需要自行託管時可提供靜態服務，不作未來業務後端 |
| Go | 獨立 API、身分與工廠授權、正式資料、方案持久化、稽核；後續才考慮接管判定 |
| 部署 | Sites 可部署 React 靜態產物；線上主機並非 Node.js 22 程序。若要求線上也必須跑 Node 22，需另外選擇容器主機 |

本系統以瀏覽器互動與圖形分析為主，優先 React SPA，不額外引入 SSR。若未來需要 Next.js，另作明確架構決策，不能把 React 等同 Next.js。

## 元件切分

| 元件／區域 | 保留內容 |
| --- | --- |
| AppShell / Sidebar / ScopeToolbar | 導覽、收合、工廠與情境切換、合成資料選單預設縮合 |
| FactoryWorkspace | 優先協調、共同阻擋、下游解除試算與工廠候選 |
| DepartmentWorkspace | 部門與產品卡片、獨立縮合、搜尋、多選與共同開工 |
| ProductWorkspace | 完整上游、必要條件、層級與反向下游 |
| GraphPanel / CytoscapeCanvas | 橫縱向、捲軸、縮放、滾輪、全螢幕、高亮、檢視歷史與狀態過濾 |
| DecisionWorkspace / CycleWorkbench | 專屬決策工作區、精簡／完整 Graph toggle、循環與解除試算 |
| BatchWorkspace | 批次候選、共同開工檢查、草案與下載 |
| EvidenceDrawer / AffectedDrawer | 非模態證據、前後差異、條件與產品證據、受影響清單 |
| DataDocs | 資料總覽、Schema、原始資料搜尋分頁、規則說明 |

元件邊界不能改變原 DOM/CSS 的選擇器語義。React 為正式 UI 的唯一 DOM 管理者，不以永久 innerHTML 或 iframe 包住舊版當成改寫完成；舊版可暫時作為獨立比對基準。

## 狀態與 Cytoscape 的遷移原則

1. 分開管理全域工廠／情境、各頁篩選與選取、試算集合、協調焦點、檢視焦點／歷史、抽屜、方案與草案。
2. 穩定 factory_id、instance_id、edge_id、SCC 群組 key；不使用陣列索引作產品與群組 key。
3. 畫布建立、事件註冊、解除與 destroy 置於受控 effect；能承受 React StrictMode 重複掛載。
4. 不移動已初始化的 canvas DOM；展開隱藏容器後 resize。使用 ResizeObserver，保存 zoom、pan、節點位置。
5. 篩選與檢視採增量更新，必要的圖形重建須保存上下文；避免全域狀態每變一次就重建圖。
6. 原生事件代理逐項改為 React handler；單次點擊不得觸發兩套處理。拖曳與畫布高頻更新不驅動整頁 render。
7. localStorage schema、鍵名與匯出格式先保留；新網址的儲存空間與原站隔離，透過現有匯出／可驗證匯入流程遷移，不宣稱自動同步。

## Go 接入邊界

先建立 SnapshotRepository，具 loadSnapshot / loadSchema 方法。第一版 JsonSnapshotRepository 回傳原資料；第二版 GoSnapshotRepository 呼叫 `/api/v1/snapshot` 與 `/api/v1/schema`，保持 domain 輸入不變。

未來候選介面：factories、evaluations、plans。具體 request/response、認證、錯誤格式、revision、ETag 與衝突處理須正式契約化，不能以目前樣本推論的 schema 當作最終 API 契約。

Go 初期供應與持久化資料，前端仍使用原判定函數。要將判定搬至 Go 時，先比較完整必要上游、SCC、Gate、版本、證據過期、多條件、無階梯式完成、下游解除與工廠隔離的 golden fixtures，結果一致再切換。

## 實作順序與放行門檻

| 階段 | 工作 | 放行門檻 |
| --- | --- | --- |
| 0 原版基準 | 封存 v37 source、資料、CSS、測試與畫面／操作矩陣 | 明確列出全部可操作入口與初始狀態 |
| 1 React 工程 | Node 22、React/TS/Vite、相依鎖定、CSS 與原模型移入 | Node 22 實機 build/test 通過，原模型結果不變 |
| 2 全域與三角色 | AppShell、篩選、工廠／部門／產品頁、試算與選取 | 各工廠與情境結果、排序、切換狀態相同 |
| 3 Graph 與工作區 | Cytoscape adapter、循環、決策、批次、抽屜 | 重複展開收合／切頁／全螢幕後畫布與 viewport 正常 |
| 4 完整驗收 | 桌面／手機、功能矩陣、視覺比對、下載／本機草案 | 沒有未說明的差異與功能缺口 |
| 5 新站部署 | 獨立網址、正式產物、發布後 smoke test | 主要角色與 Graph 流程可用，原站未更新 |
| 6 Go 串接 | adapter、API、授權、持久化、判定對照 | API 與規則契約通過後再取代 JSON |

階段 2 與 3 可以分批開發，但完整驗收通過前不將不完整 React 版稱為正式等價版本。

## 「100% 相同」的驗收定義

- 視覺：相同資料、視窗尺寸與狀態，比對排版、字體、間距、顏色、折疊、抽屜、手機與全螢幕。允許的字型渲染差異需明列，不能任意以肉眼接近放行。
- 操作：按鈕、hover、點選、鍵盤、搜尋、多選、模擬／取消、捲動、縮放、展開、返回與下載的結果相同。
- 數據：固定原始快照，三工廠、兩情境的就緒、阻擋、SCC、上下游、候選與試算結果相同。
- 狀態：頁面切換、篩選、抽屜、焦點、畫布、localStorage 與候選方案不發生額外重設或污染正式資料。
- 性能：量測原站相同資料與操作，確認 React 未造成明顯操作延遲或畫布反覆重建。

原版雜湊只能驗證封存，不能用來驗證 React 改寫後的行為相同。原有回歸測試可沿用 domain 部分；依賴舊字串或原 DOM 寫法的斷言應改為使用者行為驗收，不能刪除失敗斷言就視為通過。

目前測試使用環境 Node 24.22.1；已通過的原版測試不能當作 React／Node 22 完成驗證。新站尚未部署，Go 尚未實作。
