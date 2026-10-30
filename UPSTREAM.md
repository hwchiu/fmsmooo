# FIELDWORK — 三情境部署就緒工作台

現有網站收斂為工廠 TPM、部門主管、Product Owner 三個角色入口。沿用 `dist/data/factories.json` 的原合成工廠實例與依賴，未重新生成或覆蓋資料。

- 工廠：部門候選泳道、優先協調、下游解除試算、循環群組與本機候選方案。
- 部門：就緒產品清單、搜尋與狀態篩選、共同阻擋、跨頁候選及共同開工檢查。
- 產品：完整前置階層、阻擋路徑、版本／里程碑／證據詳情及反向下游入口。

`decision-model.mjs` 是三頁共用的純計算模組。綠＝必要前置就緒，黃＝等待，紅＝失敗／暫停／版本不符／未解除必要循環，灰＝缺漏或過期證據。完整上游條件去重計算；已完成／部署中與前置燈號分開。原合成拓樸中的無入邊節點視為已確認的起始產品。

試算把指定實例的目前版本標記 Ready 及有效里程碑，仍檢查要求版本，不把其下游就緒自動當成完成。方案與試算不改動原快照；候選草案僅存瀏覽器 localStorage。Owner 使用原資料中的責任團隊，沒有虛構個人。人力、資源及窗口未提供，統一顯示待確認；本版只提供草案開始日，不生成虛構的預測完工日期。

Graph 將設定 SCC 收合為群組，依 condensation DAG 最長必要路徑排列。上游模式以距目標的最長路徑標示前 N 層；其他圖使用通用層級，不把同層當成可共同開工。預設閱讀視角可拖曳；全圖總覽保留完整圖形。循環模式由產品層必要條件判定，不從部門間雙向連線推論循環。

驗證：`node test-decision.mjs`、`node --check dist/decision.js`。

## Graph lifecycle regression fix

Finalize all card wrappers and drawer placement before initializing Cytoscape in the next animation frame. Never reparent a mounted graph. Each render has a generation guard; hidden graphs initialize on expansion. Collapse preserves an existing instance and resizes on expansion. Department and product collapse keys use separate namespaces and stable IDs. Department sections default expanded; product detail rows default collapsed. Wheel moves the viewport vertically, while zoom is controlled through buttons.

Browser checks: product/department/factory graphs render three canvas layers; three collapse/reopen cycles and drawer open/close preserve those layers; navigation while collapsed reinitializes on reopening; configured cycle view renders 159 products/229 conditions/13 SCC groups. Native wheel test changed pan Y from 208 to -15.4 while zoom stayed 0.8. Department filtering and selection preserved Graph and drawer functionality. Data model tests pass for all three factories and both profiles.

## Dual state nodes and multiselect workflow

Graph uses independently encoded deployment/scheduling backgrounds and prerequisite strips/icons. Palette is deliberately desaturated. Ready requires valid completion evidence. Formal scheduling uses `schedule.confirmed` and `schedule.start`; a verified unscheduled state requires `schedule.confirmed=false` and `schedule.verified=true`. Original synthetic data lacks these fields, so pending nodes explicitly say scheduling data is unavailable; candidate draft dates do not create formal scheduling state.

Searchable multi-select department and product dropdowns share the product toolbar. Product fuzzy search supports case-insensitive fragments, multiple tokens and one-character spelling errors. Multiple selected roots render the deduplicated union of complete prerequisite graphs. Out-of-filter selected roots/candidates remain explicit. Factory cards include all pending products, with prerequisite/execution filters and reversible scoped green selection. Blocked products can enter coordination drafts and remain blocked.

Checks: `node test-view-model.mjs`, `node test-decision.mjs`, `node --check dist/decision.js`. Browser verified D05+D06 selection, select/cancel 14 green candidates, 26 waiting products under these departments, blocked MES Core candidate, fuzzy `postgreql`, two-root Graph with 31 deduplicated products/50 conditions, three canvas layers after repeated collapse/drawer operations, and 159-product/13-cycle configured graph. SCC nodes explicitly use the supported `none` background image to avoid Cytoscape style-parser failure.

## Compact status tags and picker dismissal

Graph nodes render two distinct filled tags directly below the title: deployment/scheduling and prerequisite readiness. Tags carry explicit category text, icons, and restrained semantic colors. Title-to-tag spacing adapts to one/two-line names; node height is 154px. Multi-select dropdowns close on outside pointer actions, Escape and focus leaving the picker; opening another picker closes its predecessor. Selection inside a picker keeps it open. Detached toggle events from previous renders are ignored.

Browser checks confirmed outside/Escape dismissal, mutually exclusive pickers, multi-selection retention, three Graph canvas layers after collapse, and the 159-product/13-SCC configured graph.

## Graph state filters and coordination focus

Two multi-select dropdowns in every Graph card filter deployment/scheduling state and prerequisite state. Selection is OR within each dimension and AND across dimensions; empty means unrestricted. Only matching product frames and edges between visible groups render. Readiness, dependency paths, tables and trial effects still use the full model. SCCs stay grouped and label matching/total membership. Empty intersections show an explicit zero-result state and reset action.

The current coordination/trial row is pinned and highlighted even when its simulated completion removes it from ordinary release candidates. Graph context names the selected product and simulation scope. An explicit analysis-focus border highlights the corresponding node/group. Filters hiding the selected target trigger a warning and an action to clear Graph filters and reveal the target. Other trial assumptions remain intact.

Browser checks: MES Core filter 5/31 waiting products; completed+waiting intersection 0/31, adding pending scheduling state restores 5/31. SQL completion trial retains highlighted row (+18 newly-ready) and Graph context. Switching to Oracle updates exactly one highlighted row and matching Graph target. Hidden target warning and reveal action verified. Unit checks cover filter boolean semantics and separate execution/prerequisite dimensions.

## Reversible assumptions and actual-state provenance

Every `data-trial` action toggles just that instance. Trial bar pills also cancel individual assumptions, preserving all other assumptions. Coordination rows display original actual deployment/scheduling state, a separate explicit simulation badge, and cancel controls. Node backgrounds/deployment tags and deployment-state filters use baseline evidence; prerequisite tags and results use the active trial model and are prefixed as simulated. Drawer evidence uses original status, version, milestones and observation timestamp, alongside an explicit before/after prerequisite comparison.

Analysis focus outline uses dark red #7A3E43, and the top-right target text was removed. Hover tooltips expose original actual state, current completion assumption, prerequisite before/after and original snapshot time; equivalent information is available in the click drawer. Renderer rebuild removes obsolete hover content.

Browser verified SQL trial preserves actual Planned state, displays separate assumption, supports single cancel, returns ready count to baseline 54 and keeps three renderer canvases. Native pointer hover verified original state, 25/25 prerequisite comparison and snapshot time, with dark-red target outline.

## Stable coordination order and concise simulation nodes

Coordination rows use baseline release ordering, membership and baseline execution scope. Current trial effects update in place; applying/cancelling assumptions never pins or promotes a row. A dedicated product-status column contains original deployment/scheduling information plus a plain-text trial annotation; product-name cells contain only name and owner.

Graph node background/deployment tag and state filter reflect the current simulation model again. Explicit trial prose and trial-prefixed tags were removed from node frames, while the overall analysis banner still declares the simulation. Hover and the evidence drawer retain baseline actual state and before/after prerequisite comparison. Dark-red outline and no top-right target label are preserved.

Browser verified identical row ID order after simulating and cancelling the third row (Container Registry), dedicated status column, zero old name-cell tags, three active renderer canvases, simulated completed node appearance and original pending state in the hovered tooltip.

## One-click graph exploration

Node taps now select a separate inspection target, highlight its complete required ancestry and dim unrelated elements without opening evidence. Missing ancestors and relationships are added incrementally, preserving existing positions, viewport and Cytoscape instance. SCC group IDs are stable hashes of member IDs (joined identifiers) across subgraphs. Completion assumptions and coordination source remain separate.

Inspection toolbar provides evidence, complete upstream (clears visual state filters), previous target/viewport and clear focus. Blank canvas clears focus. Keyboard left/right selects a visible node; Enter/Space inspects it. Evidence opens with nonmodal dialog.show(), no backdrop or inert background, and follows node inspection while open. Inspection history restores viewport. Graph resizing after inspection-toolbar changes preserves event coordinates.

Browser verified node click on MES Core shows 5 direct prerequisites/30 complete ancestors with no open drawer; evidence dialog is nonmodal and background clear-focus remains operable. Repeated selection/back restores first target with three canvas layers. A 1-node downstream graph expands to 31 nodes on inspection without renderer replacement.

## Department-grouped affected-product list

Affected-count buttons open a nonmodal list pane, without changing Graph target, instance, viewport, selection or completion assumptions. The pane snapshots exactly the same baseline-pending, department-scoped IDs as the clicked count. BFS over complete necessary gates provides shortest distance and representative path; source is excluded and products deduplicated, including cycles. Direct (1), indirect (2+) and deep (3+) filters are available, along with full-list product/department fuzzy search and prerequisite-state filter.

Department and product details collapse independently. Departments default collapsed; searches reveal matching departments and clearing search restores saved expansion. Each department loads 20 products per batch with load-more controls. Snapshot/selection totals remain explicit; execution statuses use actual evidence and readiness reflects the current simulation when active. Group/detail actions only redraw the pane, preserving Graph. Original snapshot text in node hover is now on its own block.

Tests: `node test-affected.mjs` covers shortest path, alternate direct paths, cycles, deduplication and all factory downstream sets. Browser SQL count matches 20 products/3 departments (19 direct/1 indirect); filtering indirect yields 1/20 and searching MES 2/20. Registry count matches 59/5, loading one batch increased rendered product count 48 to 50, path details expand, and Graph caption remained identical throughout.

## 目標上下游切換
點擊 Graph 節點後，可切換上游前置與下游影響。下游沿必要依賴計算完整可達集合，直接數按一階去重，循環不重複計數；影響不代表新增就緒。沿用視覺狀態篩選、暗紅目標框與非相關節點淡化，不更動假設。瀏覽器驗證 Container Registry：15 上游、4 直接下游、59 完整下游；切換維持 3 層 canvas、不開抽屜。

## 全畫面 review 工作區
使用瀏覽器視窗全寬全高的專注工作區（保留瀏覽器工具列）。不搬動畫布 DOM；進入以 115% 定位目標，不自動 fit；退出還原進入前 pan/zoom。固定工具列提供 +/-、50–250% 倍率、即時百分比、定位目標、全圖總覽、閱讀視角、四向平移與滾輪模式；Ctrl/Meta 滾輪以游標縮放。Esc 退出。篩選、上下游及非模態證據抽屜繼續可用。SVG 節點的內建尺寸提高六倍，canvas pixelRatio 至少 2，避免低解析影像放大；上限仍為 250%。未新增正式資料編輯權限。
QA：模型測試全過；瀏覽器驗證 150% 文字與狀態、3 canvas、全畫面上下游與證據抽屜、退出及再進入。

## 階層證據樹
「判定與證據」以目前產品為根，直接前置預設展開，更上游逐層載入；可只看阻擋路徑或切換第一層責任部門分組。保留已滿足的中間連線以追到遠端阻擋，完整 gates 不再截斷前六筆。SCC 循環群組包含內部條件，共用前置以引用跳轉保留每條消費關係，各層每次二十組，明示數量。條件細節保留要求版本、里程碑、原始證據、試算狀態、責任及原因。技術快照預設收合，目標摘要與篩選在抽屜中保持可見。
驗證：test-evidence.mjs 覆蓋已滿足中間連線、共用引用、多條 gate、SCC、三廠兩情境每一產品的完整條件集合；全部既有模型測試通過。瀏覽器驗證 API Gateway 完整/阻擋路徑、責任部門、全部收合；Pipeline Approval Gate 的兩項直接等待/三條完整未滿足條件、共用前置跳轉及明細。開啟/操作樹時 Graph 維持三層 canvas、pan 165、zoom 1.15。

## Hover 試算來源
Hover/比較文字列出目前產品完整上游路徑內的假設來源名稱（包含自身），不再使用「其他產品」；無關路徑的假設不顯示。Hover 移除原始快照時間，詳情抽屜仍保留正式證據。節點 mouseout、畫布 pointerleave/pointercancel、背景 mousemove、拖曳/縮放/平移、頁面捲動及視窗失焦會清除提示。語法與就緒模型測試通過；本次瀏覽器 hover 自動驗證未完成（定位提示逾時）。

## Graph 產品搜尋與抽屜標題
Graph 增加目前工廠的可輸入模糊搜尋單選 combobox。支援方向鍵/Enter/Esc、外部點擊與失焦關閉。選取會以 115% 定位並暗紅高亮，保留完成假設，不開抽屜；不在目前子圖的產品以增量方式加入相關路徑。若目標被狀態篩選隱藏，會清除兩維度篩選並提示使用者，確保選取目標可見。首次從空畫布搜尋會清除舊空狀態文字。判定與證據的原有前置狀態 badge 移至產品名稱後方，不再落在試算文字後。
QA：語法、hover 比較回歸、完整證據模型通過；瀏覽器驗證 mes cor→MES Core、Enter 單選、Oracle Database 跨子圖切換、下拉關閉、3 canvas/115%、不自動開抽屜、全畫面與名稱旁 badge。

## KPI 清單篩選
工廠四張 KPI 可鍵盤/點擊篩選產品列表，與狀態下拉共用判定；對應可安排部署、等待前置、異常/資料不足、已完成/部署中。KPI 數字維持目前部門範圍的全貌，不被自身篩選縮減。點擊會展開產品總表、顯示數量與選中樣式；無符合項目的部門隱藏。清除篩選位於原兩個動作後，還原全部狀態，保留部門範圍及候選。更新僅作用於產品清單，Graph 不重建。
QA：test-kpi.mjs 覆蓋工廠/部門/兩情境/試算與數量一致性；瀏覽器四卡 54/94/1/41、清除190、等待狀態五部門。篩選前後 Graph target、pan165、zoom1.15、3 canvas 不變。

### Deployment batches and dedicated decisions

- Candidate drawers now lead with department/product totals and deduplicated **whole-batch** release effects. Product details are collapsed by department.
- Batch workspace supports shared start/end windows, per-product exceptions, dependency-wave suggestions, manual resource confirmation and local draft save/load/export. Window or membership edits invalidate resource confirmation. Formal readiness is checked separately from simulation.
- An optional existing plan reference is a **manual link only**: this static prototype has no formal scheduling API, resource capacity source or server-side approval workflow. Local drafts, confirmation notes and action records do not create formal deployment plans.
- Bottleneck links, assumption actions and cycle groups open a full-page decision workspace. It has a fixed summary, an independent graph, collapsible evidence/action side panel, reversible completion and dependency simulations, local action records and return-to-list navigation.
- Decision projections keep full analytical data separate from displayed nodes. Safe summaries use root-closed satisfied upstream regions, structurally equivalent remote products, terminal downstream products, unbranched chains and SCC groups. Progressive expansion peels boundary nodes, preserving reachability; selected-cycle members remain expanded.
- Every original gate is either attached to a visible edge or retained as a group's internal condition. Group lists and edge evidence remain accessible; expand/collapse never modifies readiness.
- Graph image caching, bounded DPR, frame-coalesced viewport updates, low-zoom label simplification and local node placement reduce rendering work. User zoom/pan and retained node positions survive expansion and simulation. Browser FPS improvement has not been quantified.
- `node test-management.mjs` covers all factory/profile combinations: batch effects, migration, date exceptions and confirmation guards; projection coverage, gate conservation, endpoints, reachability and progressive expansion. Existing cycle/evidence/viewport/scrollbar tests remain applicable.
