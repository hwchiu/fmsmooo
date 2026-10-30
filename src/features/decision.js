import { snapshotRepository } from '../repository';
import { renderRegion, replaceRegion, insertRegion } from "../react/region-api.mjs";
import { BatchWorkspace } from './batch-workspace.mjs';
import { DecisionWorkspace } from './decision-workspace.mjs';
import { bindGraphScrollbars } from './graph-scrollbars.mjs';
import { graphViewports } from './graph-viewport.mjs';
import { initDataDocs, renderDataDocs } from './data-docs.mjs';
import { departmentSvgTag, watchProductDepartments, productTitleLayout } from './department-ui.mjs';
import { CycleWorkbench } from './cycle-workbench.mjs';
import { evidenceHierarchy } from './evidence-model.mjs';
import { downstreamImpact } from './affected-model.mjs';
import { deploymentVisual, fuzzyMatch, toggleScope, graphStateMatches, factoryStatusMatches } from './view-model.mjs';
import { factoryData, reachable, stale } from './factory-model.mjs';
import { decision, selectionCheck, releases, condensed, lamps } from './decision-model.mjs';
const $ = s => document.querySelector(s),
  esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]),
  attr = esc;
const bundle = await snapshotRepository.loadSnapshot();
const state = {
  view: 'factory',
  factory: 'TNN',
  profile: 'baseline',
  dept: 'D06',
  product: null,
  selected: new Set(),
  trial: new Set(),
  query: '',
  filter: 'pending',
  detail: null,
  graphMode: 'shared',
  focus: null,
  onlyBlocked: false,
  direction: 'up',
  back: null
};
let ctx, base, m, releaseList, cy;
let baseReleaseList = null;
const collapsedCards = new Set();
const initializedCards = new Set();
let reviewMode = false,
  reviewReturn = null,
  wheelZoom = false;
let evidenceState = null;
let drawerMode = null;
let inspectionDirection = 'up';
let inspectionTarget = null;
let inspectionHistory = [];
let graphRequest = null;
let renderGeneration = 0;
state.scopeDepartment = '';
state.departmentSearch = '';
state.departments = new Set();
state.products = new Set();
state.factoryFilter = 'pending';
state.pickerQueries = {};
state.graphExecution = new Set();
state.graphPrerequisite = new Set();
const colors = {
  green: '#26846a',
  red: '#bf5252',
  yellow: '#af8120',
  gray: '#79868f'
};
const meta = {
  factory: ['工廠 TPM', '工廠開工協調', '跨部門看就緒、找共同開工候選，決定優先解除的阻擋。'],
  department: ['部門經理／部門負責人', '部門部署工作台', '掌握所選部門的部署候選、共同阻擋與跨部門等待。'],
  product: ['Product Owner', '產品前置就緒', '從完整上游檢查前置與證據，確認能否安排部署。']
};
const paths = {
  factory: '<path d="M3 21V9l6 3V6l6 3V3h6v18H3Z"/><path d="M7 17h1m4 0h1m4 0h1"/>',
  department: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  product: '<rect x="9" y="3" width="6" height="5" rx="1"/><path d="M12 8v5H5v3m7-3h7v3"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>'
};
renderRegion($('#nav'), Object.keys(meta).map(v => `<button data-view="${v}" title="${meta[v][1]}" aria-label="${meta[v][1]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[v]}</svg><span>${v === 'factory' ? '工廠開工協調' : v === 'department' ? '部門部署協調' : '產品前置就緒'}</span></button>`).join(''));
initDataDocs(bundle, () => {
  state.view = 'data';
  render();
});
renderRegion($('#factory'), bundle.factories.map(f => `<option value="${f.factory_id}">${esc(f.factory_name)}</option>`).join(''));
$('#factory').value = state.factory;
function refresh() {
  ctx = factoryData(bundle, state.factory, {}, state.profile);
  base = decision(ctx);
  baseReleaseList = null;
  m = decision(ctx, state.trial);
  releaseList = null;
  if (!m.by.has(state.product)) state.product = m.nodes.find(n => n.product_name === 'MES Core')?.id || m.nodes[0].id;
  state.products = new Set([...state.products].filter(id => m.by.has(id)));
  if (!state.products.size) state.products.add(state.product);
  if (!m.by.has(state.detail)) state.detail = null;
  render();
}
const nname = id => m.by.get(id)?.product_name || id;
const badge = r => `<span class="badge ${r.color}">${lamps[r.color]}</span>`;
const exec = r => '實際｜' + {
  done: '已完成',
  active: '部署中',
  pending: '待部署'
}[base.results.get(r.node.id).execution];
const deptName = id => bundle.departments.find(d => d.department_id === id)?.department_name || id;
const empty = s => `<div class="empty">${s}</div>`;
const cycleBench = new CycleWorkbench({
  model: () => base,
  scope: () => state.factory + '|' + state.profile,
  productTrials: () => state.trial,
  viewportKey: () => state.factory + '|cycles',
  bindViewport: bindViewportEvents,
  nodeSVG: (...args) => nodeSVG(...args),
  hover: showGraphHover,
  hideHover: hideGraphHover,
  toast,
  zoomUI: updateZoomUI,
  setCy: value => {
    cy = value;
    if (value) bindGraphWheel();
  },
  activeDecision: () => decisionDesk?.active && !!decisionDesk.cycleKey,
  updated: () => decisionDesk.refreshCycle(),
  openDecision: group => decisionDesk.open(group.members[0], {
    cycleKey: group.key,
    members: group.members
  }),
  openEdge: () => decisionDesk?.active ? decisionDesk.showCyclePane() : openDrawer('cycle'),
  evidence: id => {
    showDetail(id);
    openDrawer('evidence');
  }
});
function downloadDraft(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const batchDesk = new BatchWorkspace({
  closeDrawer: () => $('#sideDrawer')?.close(),
  model: () => m,
  formal: () => base,
  selected: () => state.selected,
  toast,
  download: downloadDraft,
  saved: () => {
    if ($('#savedPlans')) showSavedPlans();
  },
  loadScope: p => {
    state.factory = p.factory;
    state.profile = p.profile || 'baseline';
    state.selected = new Set(p.selected);
    state.trial = new Set(p.trial || []);
    $('#factory').value = state.factory;
    $('#profile').value = state.profile;
    refresh();
  }
});
const decisionDesk = new DecisionWorkspace({
  model: () => m,
  formal: () => base,
  toast,
  download: downloadDraft,
  closeDrawer: () => {
    $('#sideDrawer')?.close();
    document.querySelector('[data-drawer-pane="cycle"]')?.replaceChildren();
  },
  trial: id => {
    if (state.trial.has(id)) state.trial.delete(id);else state.trial.add(id);
    m = decision(ctx, state.trial);
    releaseList = null;
    decisionDesk.backgroundDirty = true;
    if (decisionDesk.cycleKey) cycleBench.ensure();
  },
  add: id => {
    if (m.results.get(id)?.execution !== 'pending') return toast('此產品已完成或正在部署');
    state.selected.add(id);
    decisionDesk.backgroundDirty = true;
    toast('已加入部署批次候選');
  },
  backgroundSync: () => render(),
  cycleModel: () => cycleBench.analysis?.after || cycleBench.ensure().after,
  cycleFresh: () => cycleBench.analysis.newlyReady,
  cycleStatus: () => {
    const g = cycleBench.analysis.groups.find(g => g.key === decisionDesk.cycleKey);
    return {
      before: g?.baselineCycles.length || 0,
      now: g?.activeCycles.length || 0,
      adjustments: cycleBench.overrides.size,
      pendingBefore: g?.internal.filter(e => !base.met(e)).length || 0,
      pendingNow: g?.internal.filter(e => cycleBench.analysis.after.gates.some(x => x.edge_id === e.edge_id) && !cycleBench.analysis.after.met(e)).length || 0
    };
  },
  cycleInternal: () => cycleBench.analysis.groups.find(g => g.key === decisionDesk.cycleKey)?.internal || [],
  cyclePane: () => cycleBench.edgePane(),
  cycleEdge: id => {
    cycleBench.edge = id;
    decisionDesk.showCyclePane();
  }
});
function stats() {
  const scope = [...m.results.values()].filter(r => state.view === 'product' ? state.products.has(r.node.id) : departmentAllowed(r.node));
  let items;
  if (state.view === 'product') {
    items = [['選取產品', scope.length, '每項產品獨立計算前置狀況'], ['前置就緒', scope.filter(r => r.color === 'green').length, '所有必要條件均已滿足'], ['等待／異常', scope.filter(r => ['yellow', 'red'].includes(r.color)).length, '完整必要路徑判定'], ['資料不足', scope.filter(r => r.color === 'gray').length, '需補有效狀態與證據']];
  } else {
    const pending = scope.filter(r => r.execution === 'pending');
    items = [['可安排部署', pending.filter(r => r.candidate).length, '前置就緒 · 資源／窗口待確認'], ['等待前置', pending.filter(r => r.color === 'yellow').length, '尚有必要條件未完成'], ['異常／資料不足', pending.filter(r => ['red', 'gray'].includes(r.color)).length, '循環、失敗、版本或證據缺漏'], ['已完成／部署中', scope.filter(r => r.execution !== 'pending').length, `範圍內共 ${scope.length} 項產品`]];
  }
  const keys = ['green', 'yellow', 'issues', 'executed'];
  renderRegion($('#stats'), items.map((a, i) => {
    const content = `<small>${a[0]}</small><strong ${i === 0 ? 'class="' + (state.view === 'product' ? m.results.get(state.product).color : 'green') + '"' : ''}>${a[1]}</strong><em>${a[2]}</em>`;
    return state.view === 'factory' ? `<button type="button" class="stat kpi-filter ${state.factoryFilter === keys[i] ? 'active' : ''}" data-kpi-filter="${keys[i]}" aria-label="查看${a[0]}產品（${a[1]}項）" aria-pressed="${state.factoryFilter === keys[i]}">${content}</button>` : `<div class="stat">${content}</div>`;
  }).join(''));
}
let pendingRender = 0;
function render() {
  if (pendingRender) cancelAnimationFrame(pendingRender);
  pendingRender = requestAnimationFrame(() => { pendingRender = 0; renderNow(); });
}
function renderNow() {
  graphViewports.remember();
  const previousInspection = inspectionTarget ? {
    id: inspectionTarget,
    direction: inspectionDirection
  } : null;
  document.body.classList.toggle('data-docs-open', state.view === 'data');
  if (state.view === 'data') {
    renderGeneration++;
    graphRequest = null;
    cy?.destroy();
    cy = null;
    $('#sideDrawer')?.close();
    $('#graphHover')?.remove();
    renderDataDocs(bundle);
    return;
  }
  inspectionTarget = null;
  inspectionDirection = 'up';
  inspectionHistory = [];
  $('#graphHover')?.remove();
  renderGeneration++;
  graphRequest = null;
  cy?.destroy();
  cy = null;
  const info = meta[state.view];
  $('#role').textContent = info[0];
  $('#title').textContent = info[1];
  $('#subtitle').textContent = info[2];
  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.view);
    b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false');
  });
  $('#snapshot').textContent = `資料基準 ${ctx.factory.snapshot_at.replace('T', ' ').slice(0, 16)} · ${ctx.factory.description}`;
  $('#trial').hidden = !state.trial.size;
  if (state.trial.size) {
    const fresh = [...m.results.values()].filter(r => r.candidate && !base.baselineReady.has(r.node.id));
    renderRegion($('#trial'), `<div><b>假設完成試算 · 未修改正式快照</b><div class="small">${[...state.trial].map(id => `<button class="trial-pill" data-trial="${id}" title="取消此產品假設">${esc(nname(id))} ×</button>`).join(' ')} ｜ 新增就緒 ${fresh.length} 項</div></div><button data-action="reset-trial">清除試算</button>`);
  }
  stats();
  if (state.view === 'product') productPage();else if (state.view === 'department') departmentPage();else factoryPage();
  enhanceWorkspace();
  document.body.classList.toggle('review-open', reviewMode);
  if (graphRequest) {
    const request = graphRequest,
      generation = renderGeneration;
    requestAnimationFrame(() => {
      if (generation === renderGeneration) {
        if (request.cycle) cycleBench.draw();else {
          if (previousInspection && m.by.has(previousInspection.id)) request.ids = new Set([...request.ids, ...m.ancestors(previousInspection.id)]);
          drawGraphNow(request.ids, request.targets);
          if (previousInspection && cy && m.by.has(previousInspection.id)) {
            inspectionDirection = previousInspection.direction;
            inspectProduct(previousInspection.id, false);
          }
        }
      }
    });
  }
}
function graphPanel(title, sub, extra = '') {
  return `<section id="graphPanel" class="panel ${reviewMode ? 'review-fullscreen' : ''}"><div class="panelhead"><div><h2>${title}</h2><p>${sub}</p></div>${extra}</div>${state.view === 'factory' && state.graphMode === 'cycles' ? cycleBench.panelHTML() : analysisContext()}<div id="inspectionBar" class="inspection-bar" hidden></div><div class="graph-filters">${graphProductPicker()}<div class="cycle-normal-filters" ${state.view === 'factory' && state.graphMode === 'cycles' ? 'hidden' : ''}>${multiDropdown('graphExecution', '部署／排程狀態', graphExecutionOptions, state.graphExecution)}${multiDropdown('graphPrerequisite', '前置狀況', graphPrerequisiteOptions, state.graphPrerequisite)}<button data-action="reset-graph-filters">清除圖形篩選</button><span class="muted">圖中呈現目前試算結果；維度內任一符合、維度間取交集。</span></div></div><div class="graphbar"><span id="graphcaption"></span><div class="tools"><button data-action="zoom-in" aria-label="放大">＋</button><button data-action="zoom-out" aria-label="縮小">−</button><select id="graphZoom" aria-label="圖形縮放倍率"><option value=".5">50%</option><option value=".75" selected>75%</option><option value="1">100% 閱讀</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option><option value="2.5">250%</option></select><button data-action="readable">閱讀視角</button><button data-action="center-target">定位目標</button><button data-action="wheel-mode" aria-pressed="${wheelZoom}">滾輪：${wheelZoom ? '縮放' : '移動'}</button><div class="pan-tools" aria-label="移動畫布"><button data-pan="left" aria-label="向左查看">←</button><button data-pan="up" aria-label="向上查看">↑</button><button data-pan="down" aria-label="向下查看">↓</button><button data-pan="right" aria-label="向右查看">→</button></div><button data-action="fit">全圖總覽</button><button data-action="fullscreen">${reviewMode ? '退出全螢幕' : '全螢幕'}</button></div></div><div class="graph-frame"><div id="graph" class="graph" tabindex="0" role="img" aria-label="產品依賴階層圖"></div><div class="graph-scroll-x" tabindex="0" role="region" aria-label="Graph 水平捲軸"><div></div></div><div class="graph-scroll-y" tabindex="0" role="region" aria-label="Graph 垂直捲軸"><div></div></div><div class="graph-scroll-corner"></div></div><div class="graphlegend"><span class="legend-swatch" style="background:#eef4ef">✓ 部署驗證完成</span><span class="legend-swatch" style="background:#edf2f5">◷ 正在部署</span><span class="legend-swatch" style="background:#f0f2f5">已安排時程</span><span class="legend-swatch" style="background:#f4f5f5">未排程／資料未提供（以節點文字區分）</span><br>底色＝部署／排程狀態；左色條＝前置判定　｜　箭頭：前置 → 使用產品　｜　實線：未滿足　虛線：已滿足　｜　滾輪移動（可切換縮放）｜Ctrl＋滾輪以游標縮放｜拖曳平移｜＋／－縮放｜Esc 退出全螢幕；循環收合為群組</div></section>`;
}
function detailPanel() {
  return `<aside class="panel"><div class="panelhead"><h2>判定與證據</h2></div><div id="detail" class="detail"></div></aside>`;
}
function productPage() {
  const roots = [...state.products].filter(id => m.by.has(id));
  const ids = new Set(),
    edges = new Map();
  for (const id of roots) {
    const r = m.results.get(id);
    for (const x of state.direction === 'up' ? r.ids : reachable([id], m.gates)) ids.add(x);
    for (const e of r.pending) edges.set(e.edge_id, e);
  }
  if (state.onlyBlocked && state.direction === 'up') {
    const paths = reachable([...edges.values()].map(e => e.source), m.gates);
    for (const id of [...ids]) if (!paths.has(id) && !state.products.has(id)) ids.delete(id);
  }
  renderRegion($('#workspace'), `${state.back ? '<button class="back" data-action="back">← 返回原工作台</button>' : ''}<div class="layout"><div>${graphPanel(state.direction === 'up' ? '完整前置階層圖' : '下游釋放影響', roots.length > 1 ? '多目標共用前置只畫一次；點選節點查看各自完整判定。' : '完整必要路徑判定，跨部門前置不因篩選而隱藏。', `<button data-action="blockers">${state.onlyBlocked ? '顯示全部前置' : '聚焦阻擋路徑'}</button>`)}<section class="panel"><div class="panelhead"><h2>${state.direction === 'up' ? '未滿足條件' : '下游產品與剩餘條件'}</h2></div><div id="productIssues"></div></section></div>${detailPanel()}</div>`);
  drawGraph(ids, new Set(roots));
  renderRegion($('#productIssues'), state.direction === 'up' ? conditionTable([...edges.values()]) : productTable([...ids].filter(id => !state.products.has(id)).map(id => m.results.get(id)), false));
  showDetail(state.detail || roots[0]);
}
function conditionTable(edges) {
  if (!edges.length) return empty('所有必要前置均已滿足；若無前置，依原合成建置拓樸確認為起始產品。');
  return `<div class="tablewrap"><table><thead><tr><th>前置 → 使用產品</th><th>尚待條件</th><th>責任部門</th><th>操作</th></tr></thead><tbody>${edges.map(e => `<tr><td><b>${esc(nname(e.source))}</b><div class="muted">→ ${esc(nname(e.target))}</div></td><td>${esc(edgeReason(e))}</td><td>${esc(m.by.get(e.source).department_name)}</td><td><button data-edge="${attr(e.edge_id)}">看條件</button></td></tr>`).join('')}</tbody></table></div>`;
}
function edgeReason(e) {
  const n = m.by.get(e.source);
  if (m.met(e)) return '條件已滿足';
  if (stale(n, m.ctx)) return '狀態證據缺漏／過期';
  if (n.status === 'Unknown') return '狀態未知';
  if (n.status === 'Failed') return '部署失敗';
  if (n.status === 'Paused') return '部署暫停';
  if (n.status === 'Ready' && !(n.milestones || []).includes(e.temporal_constraint.predecessor_state || 'Ready')) return '完成里程碑證據缺漏';
  if (n.status === 'Ready' && e.temporal_constraint.required_version && n.version !== e.temporal_constraint.required_version) return `版本 ${n.version} 不符要求 ${e.temporal_constraint.required_version}`;
  return '尚未部署完成並通過驗證';
}
function scopeProducts() {
  return [...m.results.values()].filter(r => departmentAllowed(r.node)).filter(r => !state.query || [r.node.product_name, r.node.owner_team, r.node.department_name].join(' ').toLowerCase().includes(state.query.toLowerCase())).filter(r => state.filter === 'all' || state.filter === 'pending' && r.execution === 'pending' || state.filter === 'ready' && r.candidate || state.filter === r.color);
}
function productTable(rows, select = true) {
  if (!rows.length) return empty('此範圍沒有符合條件的產品。');
  return `<div class="tablewrap"><table><thead><tr>${select ? '<th>選取</th>' : ''}<th>產品／責任部門</th><th>就緒／執行狀態</th><th>必要條件</th><th>等待來源</th><th>操作</th></tr></thead><tbody>${rows.map(r => {
    const n = r.node,
      teams = [...new Set(r.pending.map(e => m.by.get(e.source).department_name))],
      isNew = state.trial.size && r.candidate && !base.baselineReady.has(n.id);
    return `<tr class="${state.selected.has(n.id) ? 'selected' : ''}">${select ? `<td><input type="checkbox" data-select="${n.id}" ${state.selected.has(n.id) ? 'checked' : ''} ${r.execution !== 'pending' ? 'disabled' : ''} aria-label="選取 ${esc(n.product_name)}"></td>` : ''}<td><button class="link" data-detail="${n.id}"><b>${esc(n.product_name)}</b></button>${isNew ? '<span class="chip">本次新增就緒</span>' : ''}</td><td>${badge(r)}<div class="muted">${exec(r)}</div></td><td>${r.complete} / ${r.total}<div class="muted">${new Set(r.pending.map(e => e.source)).size} 項產品待滿足</div></td><td>${teams.length ? teams.map(esc).join('、') : '無'}${teams.length ? `<div class="muted">${teams.includes(n.department_name) ? '含部門內等待 ' : ''}${teams.some(t => t !== n.department_name) ? '含跨部門等待' : ''}</div>` : ''}</td><td><button data-product="${n.id}">前置圖</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function departmentPage() {
  const rows = scopeProducts();
  renderRegion($('#workspace'), `<div class="layout"><div><section class="panel"><div class="panelhead"><div><h2>所選部門產品</h2><p>預設所有待部署產品；不以日期裁掉可能提前開工的產品。</p></div></div><div class="graphbar"><div class="tools"><input id="search" value="${attr(state.query)}" placeholder="搜尋產品／責任部門" aria-label="搜尋產品"><select id="filter" aria-label="產品就緒篩選">${[['pending', '所有待部署'], ['ready', '可安排部署'], ['yellow', '等待前置'], ['red', '異常阻擋'], ['gray', '資料不足'], ['all', '全部含已完成']].map(([v, l]) => `<option value="${v}" ${state.filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${bulkButton()}</div><span>${rows.length} 項產品</span></div>${productTable(rows)}</section>${blockerPanel(true)}${graphPanel('共同前置與阻擋圖', '選取產品或點選共同阻擋，保留所有中間必要路徑。')}</div><div>${selectionPanel()}${detailPanel()}</div></div>`);
  drawContextGraph();
  showDetail(state.detail);
}
function getReleases() {
  if (!baseReleaseList) baseReleaseList = releases(base);
  if (!releaseList) releaseList = state.trial.size ? releases(m) : baseReleaseList;
  const current = new Map(releaseList.map(r => [r.node.id, r]));
  return baseReleaseList.map(original => {
    const update = current.get(original.node.id);
    if (update) return {
      ...update,
      affected: original.affected
    };
    const impacted = new Set(original.affected);
    return {
      ...original,
      fresh: [...m.results.values()].filter(r => impacted.has(r.node.id) && r.candidate && !base.baselineReady.has(r.node.id))
    };
  });
}
function blockerPanel(dept = false) {
  const relevant = new Set(m.nodes.filter(n => departmentAllowed(n)).map(n => n.id));
  const rows = getReleases().map(r => ({
    ...r,
    targets: r.affected.filter(id => relevant.has(id) && base.results.get(id).execution === 'pending'),
    newTargets: r.fresh.filter(x => relevant.has(x.node.id))
  })).filter(r => r.targets.length).slice(0, 12);
  return `<section class="panel"><div class="panelhead"><div><h2>${dept ? '共同阻擋與協調事項' : '優先協調清單'}</h2><p>依原始快照的新增就緒數、受影響數排序；試算與取消不改變列的位置。</p></div></div>${rows.length ? `<div class="tablewrap"><table><thead><tr><th>前置／責任部門</th><th>產品狀態</th><th>受影響產品</th><th>可開始部署產品</th><th>操作</th></tr></thead><tbody>${rows.map(r => `<tr class="${state.focus === r.node.id ? 'coordination-focus' : ''}" aria-current="${state.focus === r.node.id ? 'true' : 'false'}" data-coordination-row="${r.node.id}"><td><button class="link" data-focus="${r.node.id}"><b>${esc(r.node.product_name)}</b></button></td><td class="coord-status">${esc(actualState(r.node.id))}${state.trial.has(r.node.id) ? '<div class="muted">試算：假設部署驗證完成</div>' : ''}</td><td><button class="impact-count" data-affected="${r.node.id}" aria-label="查看 ${esc(r.node.product_name)} 受影響的 ${r.targets.length} 項產品">${r.targets.length} 項產品 ↗</button><div class="muted">${new Set(r.targets.map(id => m.by.get(id).department_id)).size} 個部門</div></td><td><b class="green">+${r.newTargets.length}</b><div class="muted">${r.targets.length - r.newTargets.length} 項仍有其他條件</div></td><td><button data-trial="${r.node.id}" aria-pressed="${state.trial.has(r.node.id)}">${state.trial.has(r.node.id) ? '取消假設' : '假設完成'}</button></td></tr>`).join('')}</tbody></table></div>` : empty('目前沒有需要協調的下游阻擋。')}</section>`;
}
function selectionPanel() {
  return batchDesk.summaryHTML();
}
function factoryPage() {
  const products = [...m.results.values()].filter(r => departmentAllowed(r.node));
  renderRegion($('#workspace'), `<div class="layout"><div><section class="panel" id="deploymentProducts"><div class="panelhead"><div><h2>各部門部署產品</h2><p data-factory-filter-summary>顯示 ${visibleFactoryProducts().length} 項 · ${esc(factoryFilterLabel(state.factoryFilter))}；勾選不代表前置已完成。</p></div>${bulkButton()}<button data-action="clear-selection">清空全部候選</button><button data-factory-clear-filter>清除篩選</button></div><div class="lanes">${bundle.departments.filter(d => !state.departments.size || state.departments.has(d.department_id)).map(d => {
    const rs = products.filter(r => r.node.department_id === d.department_id),
      count = rs.filter(r => factoryStatusMatches(r, state.factoryFilter)).length;
    return `<section class="lane" data-factory-lane="${d.department_id}" ${count ? '' : 'hidden'}><div class="lanehead"><button class="link" data-dept="${d.department_id}">${esc(d.department_name)} ↗</button><b data-factory-count>${count} 項</b></div>${rs.map(r => `<div class="productcard" data-factory-product="${r.node.id}" ${factoryStatusMatches(r, state.factoryFilter) ? '' : 'hidden'} style="background:${deploymentVisual(base.by.get(r.node.id), base.results.get(r.node.id)).fill}"><label><input type="checkbox" data-select="${r.node.id}" ${state.selected.has(r.node.id) ? 'checked' : ''} ${r.execution !== 'pending' ? 'disabled' : ''} aria-label="選取 ${esc(r.node.product_name)}"><span><b>${esc(r.node.product_name)}</b><small class="muted">實際｜${esc(actualState(r.node.id))}${state.trial.has(r.node.id) ? ' · 試算假設完成' : ''}</small></span></label>${badge(r)}<div class="product-extra"><p>${r.complete}／${r.total} 必要條件已滿足 · ${new Set(r.pending.map(e => e.source)).size} 項前置產品待處理</p>${r.pending.slice(0, 2).map(e => `<div class="muted">等待 ${esc(nname(e.source))} · ${esc(m.by.get(e.source).department_name)}</div>`).join('')}<button data-product="${r.node.id}">前置圖</button><button data-detail="${r.node.id}">狀態與證據</button></div></div>`).join('')}<div class="empty" data-factory-empty ${count ? 'hidden' : ''}>此部門沒有符合篩選的產品</div></section>`;
  }).join('')}</div><div class="empty" data-factory-no-results ${visibleFactoryProducts().length ? 'hidden' : ''}>目前部門範圍沒有符合此狀態的產品。</div></section>${blockerPanel()}${graphPanel('跨部門依賴決策圖', '選取候選檢查共同前置；點擊圖中產品，可切換上游前置／下游影響。', `<div class="tools">${[['shared', '跨部門牽制'], ['impact', '解除影響'], ['cycles', '循環與下游']].map(([v, t]) => `<button data-gmode="${v}" class="mode ${state.graphMode === v ? 'active' : ''}">${t}</button>`).join('')}</div>`)}<section class="panel"><div class="panelhead"><h2>已保存的候選方案</h2><button data-action="export">匯出目前分析</button></div><div id="savedPlans"></div></section></div><div>${selectionPanel()}${detailPanel()}</div></div>`);
  drawContextGraph();
  showDetail(state.detail);
  showSavedPlans();
}
function drawContextGraph() {
  if (state.view === 'factory' && state.graphMode === 'cycles') {
    graphRequest = {
      cycle: true
    };
    return;
  }
  let ids = new Set(),
    targets = new Set();
  if (state.view === 'factory' && state.graphMode === 'cycles') {
    for (const c of m.cycles) for (const id of reachable(c, m.gates)) ids.add(id);
    targets = new Set(m.cycles.flat());
  } else if (state.focus && (state.graphMode === 'impact' || !state.selected.size)) {
    ids = reachable([state.focus], m.gates);
    targets.add(state.focus);
    for (const id of [...ids]) for (const a of m.ancestors(id)) ids.add(a);
  } else {
    const chosen = [...state.selected].filter(id => state.view !== 'department' || departmentAllowed(m.by.get(id)));
    const rs = chosen.length ? chosen.map(id => m.results.get(id)) : state.view === 'department' ? [...m.results.values()].filter(r => departmentAllowed(r.node) && r.execution === 'pending') : [];
    for (const r of rs) {
      targets.add(r.node.id);
      for (const id of r.ids) ids.add(id);
    }
  }
  drawGraph(ids, targets);
}
function drawGraph(ids, targets) {
  graphRequest = {
    ids,
    targets
  };
}
function drawGraphNow(ids, targets) {
  if (!$('#graph') || !$('#graph').getClientRects().length) return;
  if (!ids.size) {
    renderRegion($('#graph'), empty(state.graphMode === 'cycles' ? '目前沒有未解除的必要循環。' : '選取候選產品或點選協調清單，展開相關依賴圖。'));
    $('#graphcaption').textContent = '依目前決策展開子圖';
    return;
  }
  const g = condensed(m, ids),
    max = Math.max(0, ...g.rank.values()),
    rows = new Map(),
    elements = [],
    shownGroups = new Set();
  const matches = r => graphStateMatches(r.node, r, state.graphExecution, state.graphPrerequisite);
  const matchedIds = new Set([...ids].filter(id => matches(m.results.get(id))));
  $('#graph').dataset.visibleProducts = String(matchedIds.size);
  $('#graph').dataset.totalProducts = String(ids.size);
  $('#graph').dataset.analysisTargetVisible = String(!!state.focus && matchedIds.has(state.focus));
  const focusNote = $('#analysisVisibility');
  if (focusNote && state.focus) {
    renderRegion(focusNote, matchedIds.has(state.focus) ? '<span>圖中已高亮目標節點</span>' : '<span>目標被狀態篩選隱藏或不在目前子圖</span><button data-action="reveal-analysis-target">顯示分析目標</button>');
  }
  for (const group of g.groups) {
    const rank = g.rank.get(group.id),
      col = max - rank,
      idx = rows.get(col) || 0;
    const rs = group.members.map(id => m.results.get(id));
    if (!rs.some(matches)) continue;
    rows.set(col, idx + 1);
    shownGroups.add(group.id);
    const matchingMembers = group.members.filter(id => matchedIds.has(id));
    const color = rs.some(r => r.color === 'red') ? 'red' : rs.some(r => r.color === 'gray') ? 'gray' : rs.some(r => r.color === 'yellow') ? 'yellow' : 'green',
      target = group.members.some(id => targets.has(id));
    const visual = group.cycle ? null : deploymentVisual(rs[0].node, rs[0]);
    const label = group.cycle ? '循環群組 · 符合 ' + matchingMembers.length + '／' + group.members.length + ' 項\n' + matchingMembers.slice(0, 3).map(nname).join('\n') + '\n前置：' + lamps[color] : '';
    const svg = group.cycle ? 'none' : nodeSVG(rs[0], visual, targets.has(group.members[0]), state.view === 'product' && state.products.size === 1 && state.direction === 'up' ? rank ? '前 ' + rank + ' 層' : '目標產品' : '依賴層級 ' + (col + 1));
    elements.push({
      data: {
        id: group.id,
        label,
        svg,
        fill: visual?.fill || '#f2f3f3',
        color: group.cycle ? colors[color] : '#aab8bd',
        members: group.members,
        analysisFocus: group.members.includes(state.focus) ? 1 : 0,
        target: target ? 4 : 1.5
      },
      position: {
        x: col * 325 + 160,
        y: idx * 190 + 100
      }
    });
  }
  for (const e of g.edges) {
    const a = g.map.get(e.source),
      b = g.map.get(e.target);
    if (a !== b && shownGroups.has(a) && shownGroups.has(b)) elements.push({
      data: {
        id: e.edge_id,
        source: a,
        target: b,
        color: m.met(e) ? '#a8beb6' : '#c99c5b',
        style: m.met(e) ? 'dashed' : 'solid',
        edge: e
      }
    });
  }
  if (!shownGroups.size) {
    renderRegion($('#graph'), empty('沒有符合兩種狀態條件的產品。請調整選項或清除圖形篩選。'));
    $('#graphcaption').textContent = `顯示 0／${ids.size} 項產品 · 完整前置判定維持不變`;
    return;
  }
  $('#graph').replaceChildren();
  cy = cytoscape({
    container: $('#graph'),
    elements,
    layout: {
      name: 'preset'
    },
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    textureOnViewport: false,
    motionBlur: false,
    userZoomingEnabled: false,
    minZoom: .12,
    maxZoom: 2.5,
    style: [{
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': 205,
        'font-family': 'sans-serif',
        'font-size': 15,
        'line-height': 1.5,
        'text-valign': 'center',
        'text-halign': 'center',
        'background-color': 'data(fill)',
        'background-image': 'data(svg)',
        'background-fit': 'contain',
        'background-clip': 'node',
        'border-color': 'data(color)',
        'border-width': 'data(target)',
        width: 285,
        height: 154,
        shape: 'roundrectangle',
        color: '#193342'
      }
    }, {
      selector: 'edge',
      style: {
        width: 1.6,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'line-style': 'data(style)',
        'arrow-scale': .8
      }
    }, {
      selector: 'node[analysisFocus = 1]',
      style: {
        'border-color': '#7a3e43',
        'border-width': 5,
        'overlay-color': '#7a3e43',
        'overlay-opacity': .08,
        'overlay-padding': 7
      }
    }, {
      selector: '.inspection-focus',
      style: {
        'border-color': '#7a3e43',
        'border-width': 5,
        'overlay-color': '#7a3e43',
        'overlay-opacity': .06
      }
    }, {
      selector: '.dim',
      style: {
        opacity: .13
      }
    }, {
      selector: ':selected',
      style: {
        'overlay-color': '#368c83',
        'overlay-opacity': .12
      }
    }]
  });
  bindViewportEvents(cy);
  graphViewports.mount(cy, state.factory + '|' + state.view + '|normal', cy.nodes().filter(n => n.data('members').some(id => targets.has(id))).first());
  updateZoomUI();
  bindGraphWheel();
  $('#graphcaption').textContent = `顯示 ${matchedIds.size}／${ids.size} 項產品 · ${g.edges.length} 個必要條件 · ${g.groups.filter(g => g.cycle).length} 個設定循環群組 · 拖曳查看其他層級${state.onlyBlocked ? ' · 聚焦顯示不改變完整判定' : ''}`;
  cy.on('mouseover', 'node', showGraphHover);
  cy.on('mousemove', 'node', showGraphHover);
  cy.on('mouseout', 'node', hideGraphHover);
  cy.on('mousemove', evt => {
    if (evt.target === cy) hideGraphHover();
  });
  cy.on('pan zoom drag', hideGraphHover);
  $('#graph').addEventListener('pointerleave', hideGraphHover);
  $('#graph').addEventListener('pointercancel', hideGraphHover);
  cy.on('tap', 'node', evt => {
    $('#graphHover')?.remove();
    const members = evt.target.data('members');
    inspectProduct(members.includes(inspectionTarget) ? inspectionTarget : members[0]);
  });
  cy.on('tap', 'edge', evt => {
    showEdge(evt.target.data('edge'));
    openDrawer('evidence');
  });
  cy.on('tap', evt => {
    if (evt.target === cy) clearInspection();
  });
}
function bindGraphWheel() {
  const canvas = $('#graph');
  if (canvas.dataset.wheelBound) return;
  canvas.dataset.wheelBound = 'true';
  canvas.addEventListener('wheel', event => {
    if (!cy || !cy.elements().length) return;
    if (wheelZoom || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomGraph(cy.zoom() * Math.exp(-event.deltaY * .002), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      return;
    }
    const bounds = cy.elements().boundingBox(),
      zoom = cy.zoom(),
      pan = cy.pan(),
      height = cy.height(),
      delta = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? height : 1);
    const low = Math.min(30 - bounds.y1 * zoom, height - 30 - bounds.y2 * zoom),
      high = Math.max(30 - bounds.y1 * zoom, height - 30 - bounds.y2 * zoom);
    const next = Math.max(low, Math.min(high, pan.y - delta));
    if (Math.abs(next - pan.y) > .1) {
      event.preventDefault();
      cy.pan({
        x: pan.x,
        y: next
      });
    }
  }, {
    passive: false
  });
}
function readableGraph(targets) {
  if (!cy) return;
  if (state.view === 'factory' && state.graphMode === 'cycles') {
    cycleBench.readable();
    return;
  }
  const nodes = cy.nodes().filter(n => n.data('members').some(id => targets.has(id)));
  const node = nodes.first().length ? nodes.first() : cy.nodes().first();
  zoomGraph(.75);
  if (node.length) cy.center(node);
}
function updateZoomUI() {
  if (!cy) return;
  const picker = $('#graphZoom');
  if (!picker) return;
  const value = cy.zoom(),
    key = String(value);
  if (picker.dataset.syncedZoom === key) return;
  picker.dataset.syncedZoom = key;
  let option = [...picker.options].find(o => Math.abs(Number(o.value) - value) < .00001);
  const current = picker.querySelector('[data-current-zoom]');
  if (!option) {
    option = current || document.createElement('option');
    option.dataset.currentZoom = 'true';
    option.value = key;
    option.textContent = Math.round(value * 100) + '%';
    if (!current) picker.append(option);
  } else if (current && current !== option) current.remove();
  picker.value = option.value;
}
function bindViewportEvents(graph) {
  bindGraphScrollbars(graph);
  let frame = 0,
    zoomChanged = false;
  graph.on('pan zoom', event => {
    hideGraphHover();
    zoomChanged ||= event.type === 'zoom';
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (graph.destroyed()) return;
      const canvas = graph.container();
      canvas.dataset.panY = String(graph.pan().y);
      canvas.dataset.zoom = String(graph.zoom());
      if (zoomChanged) {
        zoomChanged = false;
        updateZoomUI();
      }
    });
  });
  graph.on('grab panstart', () => {
    graph.container().dataset.interacting = 'true';
    hideGraphHover();
  });
  graph.on('free panend', () => {
    delete graph.container().dataset.interacting;
    hideGraphHover();
  });
}
function zoomGraph(level, point) {
  if (!cy) return;
  cy.zoom({
    level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), level)),
    renderedPosition: point || {
      x: cy.width() / 2,
      y: cy.height() / 2
    }
  });
  updateZoomUI();
}
function reviewTarget() {
  return new Set([inspectionTarget, state.focus, ...state.products, ...state.selected].filter(Boolean));
}
function toggleReview() {
  reviewMode = !reviewMode;
  const panel = $('#graphPanel');
  if (!panel) return;
  if (reviewMode) reviewReturn = cy ? {
    zoom: cy.zoom(),
    pan: {
      ...cy.pan()
    }
  } : null;
  panel.classList.toggle('review-fullscreen', reviewMode);
  document.body.classList.toggle('review-open', reviewMode);
  panel.querySelector('[data-action="fullscreen"]').textContent = reviewMode ? '退出全螢幕' : '全螢幕';
  requestAnimationFrame(() => {
    cy?.resize();
    if (!reviewMode && cy && reviewReturn) {
      cy.zoom(reviewReturn.zoom);
      cy.pan(reviewReturn.pan);
    }
    updateZoomUI();
  });
}
document.addEventListener('change', e => {
  if (e.target.id === 'graphZoom') zoomGraph(Number(e.target.value));
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pan]');
  if (b && cy) {
    const p = cy.pan(),
      d = b.dataset.pan;
    cy.pan({
      x: p.x + (d === 'left' ? 240 : d === 'right' ? -240 : 0),
      y: p.y + (d === 'up' ? 180 : d === 'down' ? -180 : 0)
    });
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && reviewMode && $('#graphProductOptions')?.hidden !== false) {
    toggleReview();
    e.stopImmediatePropagation();
    return;
  }
  if (e.target.id === 'graph' && ['+', '=', '-'].includes(e.key)) {
    e.preventDefault();
    zoomGraph(cy.zoom() * (e.key === '-' ? .8 : 1.25));
  }
}, true);
function showDetail(id) {
  const el = $('#detail');
  if (!el) return;
  if (!id) {
    evidenceState = null;
    renderRegion(el, '<h2>從決策追到證據</h2><p>點選產品、Graph 節點或依賴連線，查看完整判定與責任。</p><div class="notice">綠燈表示前置就緒。人力、共用資源與施工窗口尚未提供，不能視為已核准開工。</div>');
    return;
  }
  const r = m.results.get(id),
    n = base.by.get(id);
  renderRegion(el, `<div class="detail-product-title"><h2>${esc(n.product_name)}</h2>${badge(r)}</div><div class="actual-status">實際｜${esc(actualState(id))}</div>${trialComparison(id)}<p>${state.trial.size ? '前置判定為試算結果；原始狀態未修改' : ''}</p><details class="evidence-snapshot"><summary>產品資訊與原始證據</summary><dl><dt>工廠／部門</dt><dd>${esc(ctx.factory.factory_name)}<br>${esc(n.department_name)}</dd><dt>Product Owner（責任團隊）</dt><dd>${esc(n.owner_team)}</dd><dt>完整前置條件</dt><dd>${r.complete} / ${r.total} 已滿足；${r.ids.size - 1} 項上游產品</dd><dt>實際部署證據（原始快照）</dt><dd>${esc(n.status)} · 版本 ${esc(n.version)}<br>里程碑 ${esc((n.milestones || []).join('、') || '無')}<br>${esc(n.observed_at || '缺少更新時間')}<br>來源 ${esc(n.status_source || '未提供')}</dd><dt>判定原因</dt><dd>${r.cycles.length ? '存在未解除必要循環；' : ''}${r.bad.length ? '失敗／暫停／版本不符 ' + r.bad.length + ' 項；' : ''}${r.unknown.length ? '證據不足 ' + r.unknown.length + ' 項；' : ''}${r.pending.length ? '尚有 ' + r.pending.length + ' 個未滿足條件' : '完整必要前置均已滿足'}${!r.total ? '（原合成拓樸的起始產品）' : ''}</dd></dl></details><button data-product="${id}">產品前置圖</button><button data-trial="${id}">${state.trial.has(id) ? '取消假設' : '假設此產品完成'}</button>${r.execution === 'pending' ? `<button data-add="${id}">加入候選</button>` : ''}<div class="notice">試算以目前版本通過 Ready 驗證；不會自動修改要求版本，也不會把就緒下游當成已完成。</div><section id="evidenceTree" aria-label="前置依賴證據樹"></section>`);
  startEvidence(id);
}
function showEdge(e) {
  const p = m.by.get(e.source);
  renderRegion($('#detail'), `<h2>必要依賴條件</h2><div class="path">${esc(nname(e.source))}<br>↓<br>${esc(nname(e.target))}</div><dl><dt>要求里程碑／版本</dt><dd>${esc(e.temporal_constraint.predecessor_state || 'Ready')} ／ ${esc(e.temporal_constraint.required_version || '未限制')}</dd><dt>目前狀態／版本</dt><dd>${esc(p.status)} ／ ${esc(p.version)}</dd><dt>判定</dt><dd>${esc(edgeReason(e))}</dd><dt>責任部門／團隊</dt><dd>${esc(p.department_name)}<br>${esc(p.owner_team)}</dd><dt>證據時間／來源</dt><dd>${esc(p.observed_at || '缺漏')}<br>${esc(p.status_source)}</dd><dt>關係依據</dt><dd>${esc(e.rationale || '必要部署 gate')}</dd></dl><button data-detail="${e.source}">前置產品詳情</button><button data-product="${e.target}">完整阻擋路徑</button>`);
  cy?.elements().removeClass('dim');
  const target = m.ancestors(e.target);
  cy?.nodes().filter(n => !n.data('members').some(id => target.has(id))).addClass('dim');
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').style.display = 'block';
  setTimeout(() => $('#toast').style.display = 'none', 2600);
}
function getPlans() {
  try {
    return JSON.parse(localStorage.getItem('fieldwork-decision-plans') || '[]');
  } catch {
    return [];
  }
}
function plan() {
  batchDesk.open();
}
function showSavedPlans() {
  const plans = getPlans().filter(p => p.factory === state.factory);
  renderRegion($('#savedPlans'), plans.length ? plans.map(p => `<div class="saveitem" style="padding:12px 18px"><span><b>${esc(p.name)}</b><div class="muted">${p.selected.length} 項產品 · ${esc(p.verdict)} · 本機保存</div></span><button data-load="${p.id}">載入並重檢</button></div>`).join('') : empty('尚未保存方案；選取候選後可預覽日期並保存。'));
}
function openProduct(id) {
  if (state.view !== 'product') state.back = {
    view: state.view,
    dept: state.dept,
    query: state.query,
    filter: state.filter
  };
  state.product = id;
  state.products = new Set([id]);
  state.detail = id;
  state.view = 'product';
  state.direction = 'up';
  state.onlyBlocked = false;
  render();
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
function exportData() {
  const report = {
    factory: ctx.factory,
    profile: state.profile,
    snapshot: ctx.metadata,
    simulation: [...state.trial],
    selection: selectionCheck(m, state.selected),
    products: [...m.results.values()].map(r => ({
      id: r.node.id,
      name: r.node.product_name,
      color: r.color,
      execution: r.execution,
      pending: r.pending.map(e => e.edge_id)
    }))
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json'
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `fieldwork-${state.factory}-decision.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#factory').onchange = e => {
  state.factory = e.target.value;
  state.selected.clear();
  state.trial.clear();
  state.focus = null;
  state.product = null;
  state.products.clear();
  state.detail = null;
  state.back = null;
  refresh();
};
$('#profile').onchange = e => {
  state.profile = e.target.value;
  state.trial.clear();
  state.focus = null;
  refresh();
};
$('#collapse').onclick = () => {
  document.body.classList.toggle('collapsed');
  $('#collapse').setAttribute('aria-expanded', !document.body.classList.contains('collapsed'));
  setTimeout(() => cy?.resize(), 100);
};
$('#closePlan').onclick = () => $('#planDialog').close();
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-select]')) {
    if (t.checked) state.selected.add(t.dataset.select);else state.selected.delete(t.dataset.select);
    render();
  }
  if (t.id === 'productSelect') {
    state.product = t.value;
    state.detail = t.value;
    render();
  }
  if (t.id === 'department') {
    state.dept = t.value;
    state.focus = null;
    stats();
    render();
  }
  if (t.id === 'filter') {
    state.filter = t.value;
    render();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    $('#search').focus();
    $('#search').setSelectionRange(pos, pos);
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.view) {
    state.view = d.view;
    state.focus = null;
    state.detail = null;
    render();
  } else if (d.product) openProduct(d.product);else if (d.detail) {
    state.detail = d.detail;
    showDetail(d.detail);
    openDrawer('evidence');
  } else if (d.edge) {
    showEdge(m.gates.find(e => e.edge_id === d.edge));
    openDrawer('evidence');
  } else if (d.dept) {
    state.dept = d.dept;
    state.departments = new Set([d.dept]);
    state.view = 'department';
    state.focus = null;
    state.detail = null;
    render();
  } else if (d.trial) {
    if (state.trial.has(d.trial)) state.trial.delete(d.trial);else state.trial.add(d.trial);
    state.focus = d.trial;
    state.graphMode = 'impact';
    m = decision(ctx, state.trial);
    releaseList = null;
    decisionDesk.open(d.trial);
    decisionDesk.backgroundDirty = true;
  } else if (d.focus) {
    state.focus = d.focus;
    state.detail = d.focus;
    document.querySelectorAll('[data-coordination-row]').forEach(row => {
      const selected = row.dataset.coordinationRow === d.focus;
      row.classList.toggle('coordination-focus', selected);
      row.setAttribute('aria-current', String(selected));
    });
    decisionDesk.open(d.focus);
  } else if (d.add) {
    state.selected.add(d.add);
    toast('已加入候選，可至部門／工廠檢查');
    if (state.view !== 'product') render();
  } else if (d.remove) {
    state.selected.delete(d.remove);
    render();
  } else if (d.direction) {
    state.direction = d.direction;
    state.onlyBlocked = false;
    render();
  } else if (d.gmode) {
    state.graphMode = d.gmode;
    render();
  } else if (d.load) {
    const p = getPlans().find(p => p.id == d.load);
    if (p) batchDesk.load(p);
  } else if (d.action) {
    const a = d.action;
    if (a === 'reveal-analysis-target') {
      state.graphExecution.clear();
      state.graphPrerequisite.clear();
      state.graphMode = 'impact';
      render();
    }
    if (a === 'reset-graph-filters') {
      state.graphExecution.clear();
      state.graphPrerequisite.clear();
      state.pickerQueries.graphExecution = '';
      state.pickerQueries.graphPrerequisite = '';
      render();
    }
    if (a === 'reset-trial') {
      state.trial.clear();
      refresh();
    }
    if (a === 'clear-selection') {
      state.selected.clear();
      render();
    }
    if (a === 'select-ready') {
      state.selected = toggleScope(state.selected, bulkIds());
      render();
    }
    if (a === 'add-product') {
      for (const id of state.products) if (m.results.get(id)?.execution === 'pending') state.selected.add(id);
      render();
      toast('已加入協調候選；仍須檢查前置');
    }
    if (a === 'plan') plan();
    if (a === 'export') exportData();
    if (a === 'fit') cy?.fit(undefined, 35);
    if (a === 'readable') readableGraph(reviewTarget());
    if (a === 'center-target') {
      const nodes = cy?.nodes().filter(n => n.data('members').some(id => reviewTarget().has(id)));
      if (nodes?.length) cy.center(nodes.first());else readableGraph(reviewTarget());
    }
    if (a === 'wheel-mode') {
      wheelZoom = !wheelZoom;
      b.textContent = '滾輪：' + (wheelZoom ? '縮放' : '移動');
      b.setAttribute('aria-pressed', String(wheelZoom));
    }
    if (a === 'zoom-in' && cy) zoomGraph(cy.zoom() * 1.25);
    if (a === 'zoom-out' && cy) zoomGraph(cy.zoom() / 1.25);
    if (a === 'fullscreen') toggleReview();
    if (a === 'blockers') {
      state.onlyBlocked = !state.onlyBlocked;
      render();
    }
    if (a === 'back') {
      Object.assign(state, state.back);
      state.back = null;
      state.detail = null;
      render();
    }
  }
});
function openDrawer(mode) {
  drawerMode = mode;
  if (mode === 'cycle') {
    let pane = document.querySelector('[data-drawer-pane="cycle"]');
    if (!pane) {
      pane = document.createElement('div');
      pane.dataset.drawerPane = 'cycle';
      $('#drawerBody').append(pane);
    }
    renderRegion(pane, cycleBench.edgePane());
  }
  $('#sideDrawer').classList.toggle('evidence-tree-open', mode === 'evidence' || mode === 'cycle');
  if (mode === 'affected') renderAffected();
  $('#sideDrawer').classList.toggle('affected-open', mode === 'affected');
  const dialog = $('#sideDrawer');
  for (const p of dialog.querySelectorAll('[data-drawer-pane]')) p.hidden = p.dataset.drawerPane !== mode;
  $('#drawerTitle').textContent = mode === 'selection' ? '共同開工候選' : mode === 'affected' ? '受影響產品清單' : mode === 'cycle' ? '循環依賴檢討' : '判定與證據';
  if (!dialog.open) dialog.show();
}
function enhanceWorkspace() {
  let bar = $('#workspaceActions');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'workspaceActions';
    $('#workspace').before(bar);
  }
  renderRegion(bar, `<div class="filter-row">${multiDropdown('departments', '部門', bundle.departments.map(d => ({
    id: d.department_id,
    name: d.department_name
  })), state.departments)}${state.view === 'product' ? multiDropdown('products', '產品', m.nodes.filter(departmentAllowed).map(n => ({
    id: n.id,
    name: n.product_name + ' · ' + n.department_name
  })), state.products) : ''}${state.view === 'factory' ? `<label>狀態篩選<select id="factoryStatus" aria-label="狀態篩選">${[['pending', '全部待部署產品'], ['green', '前置就緒'], ['yellow', '等待前置'], ['red', '異常阻擋'], ['gray', '資料不足'], ['issues', '異常／資料不足'], ['executed', '已完成／部署中'], ['active', '正在部署'], ['done', '部署驗證完成'], ['all', '全部產品']].map(([v, t]) => `<option value="${v}" ${state.factoryFilter === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}${state.view === 'product' ? `<button data-direction="up" class="mode ${state.direction === 'up' ? 'active' : ''}">向上查前置</button><button data-direction="down" class="mode ${state.direction === 'down' ? 'active' : ''}">完成後下游影響</button><button data-action="add-product">加入協調候選</button>` : ''}</div><div class="tools"><span class="muted">已選候選 ${state.selected.size} 項 · 篩選外 ${[...state.selected].filter(id => !departmentAllowed(m.by.get(id)) || state.view === 'factory' && !visibleFactoryProducts().some(r => r.node.id === id)).length} 項</span><button data-drawer="selection" aria-disabled="${state.selected.size === 0}" class="${state.selected.size === 0 ? 'is-disabled' : ''}">共同開工候選（${state.selected.size}）</button><button data-drawer="evidence">判定與證據</button></div>`);
  const deploymentTools = bar.querySelector(':scope > .tools');
  deploymentTools.classList.add('deployment-tools');
  deploymentTools.querySelector('.muted').classList.add('candidate-summary');
  let actionHead = $('#deploymentProducts > .panelhead') || $('#workspace .panel > .panelhead');
  if (state.view === 'product') {
    const panel = document.createElement('section');
    panel.className = 'panel deployment-action-panel';
    renderRegion(panel, '<div class="panelhead"><h2>部署產品與候選</h2></div>');
    $('#workspace').prepend(panel);
    actionHead = panel.querySelector('.panelhead');
  }
  actionHead?.append(deploymentTools);
  const bulk = $('#workspace [data-action="select-ready"]');
  if (bulk) deploymentTools.insertBefore(bulk, deploymentTools.querySelector('[data-drawer="selection"]'));
  for (const b of actionHead?.querySelectorAll(':scope > [data-action="clear-selection"],:scope > [data-factory-clear-filter]') || []) b.remove();
  insertRegion(deploymentTools, 'beforeend', '<details class="clear-picker"><summary>清除</summary><div><button data-action="clear-selection">清除候選項目</button><button data-clear-deployment-filters>清除過濾條件</button></div></details>');
  let drawer = $('#sideDrawer');
  if (!drawer) {
    drawer = document.createElement('dialog');
    drawer.id = 'sideDrawer';
    drawer.setAttribute('aria-labelledby', 'drawerTitle');
    document.body.append(drawer);
    drawer.addEventListener('close', () => drawerMode = null);
    drawer.addEventListener('click', e => {
      if (e.target === drawer) {
        const r = drawer.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) drawer.close();
      }
    });
  }
  const reopen = drawer.open,
    mode = drawerMode;
  renderRegion(drawer, '<div class="drawer-header"><h2 id="drawerTitle">判定與證據</h2><button id="closeDrawer" aria-label="關閉右側抽屜">✕ 關閉</button></div><div id="drawerBody"></div>');
  const selection = [...$('#workspace').querySelectorAll('.panel')].find(p => p.querySelector('h2')?.textContent.startsWith('共同開工候選'));
  const detail = $('#workspace #detail')?.closest('.panel');
  for (const [pane, type] of [[selection, 'selection'], [detail, 'evidence']]) if (pane) {
    pane.dataset.drawerPane = type;
    $('#drawerBody').append(pane);
    pane.hidden = type !== mode;
  }
  if (!selection) {
    const pane = document.createElement('div');
    pane.dataset.drawerPane = 'selection';
    renderRegion(pane, selectionPanel());
    pane.hidden = mode !== 'selection';
    $('#drawerBody').append(pane);
  }
  $('#closeDrawer').onclick = () => drawer.close();
  for (const layout of $('#workspace').querySelectorAll('.layout')) {
    layout.classList.add('main-only');
    for (const child of [...layout.children]) if (!child.children.length) child.remove();
  }
  // Every primary panel, department lane and product card has its own stable collapse key.
  for (const card of $('#workspace').querySelectorAll('.panel,.lane,.productcard')) {
    let head = card.querySelector(':scope > .panelhead,:scope > .lanehead,:scope > label');
    if (!head) continue;
    const title = head.querySelector('h2')?.textContent || (head.querySelector('select') ? '篩選與操作' : head.textContent.trim());
    const kind = card.classList.contains('productcard') ? 'product' : card.classList.contains('lane') ? 'department' : 'panel';
    const identity = kind === 'product' ? card.querySelector('[data-select]')?.dataset.select : kind === 'department' ? card.querySelector('[data-dept]')?.dataset.dept : title;
    const key = state.view + ':' + kind + ':' + identity;
    if ((kind === 'product' || state.view === 'factory' && kind === 'panel' && identity === '各部門部署產品') && !initializedCards.has(key)) {
      collapsedCards.add(key);
      initializedCards.add(key);
    }
    const button = document.createElement('button');
    button.className = 'card-toggle';
    button.dataset.cardKey = key;
    button.setAttribute('aria-label', '收合／展開 ' + title);
    button.setAttribute('aria-expanded', String(!collapsedCards.has(key)));
    button.textContent = collapsedCards.has(key) ? '＋ 展開' : '− 收合';
    if (head.tagName === 'LABEL') {
      const status = card.querySelector(':scope > .badge');
      if (status) head.append(status);
      const wrap = document.createElement('div');
      wrap.className = 'product-card-head';
      head.before(wrap);
      wrap.append(head, button);
      head = wrap;
    } else head.append(button);
    const body = document.createElement('div');
    body.className = 'card-content';
    head.after(body);
    for (const child of [...card.childNodes]) if (child !== head && child !== body) body.append(child);
    body.hidden = collapsedCards.has(key);
    button.onclick = () => {
      const closed = !body.hidden;
      body.hidden = closed;
      button.textContent = closed ? '＋ 展開' : '− 收合';
      button.setAttribute('aria-expanded', String(!closed));
      if (closed) collapsedCards.add(key);else collapsedCards.delete(key);
      requestAnimationFrame(() => {
        if (!cy && graphRequest && $('#graph')?.getClientRects().length) {
          if (graphRequest.cycle) cycleBench.draw();else drawGraphNow(graphRequest.ids, graphRequest.targets);
        } else cy?.resize();
      });
    };
  }
  if (reopen) openDrawer(mode || 'evidence');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-drawer]');
  if (b) {
    if (b.dataset.drawer === 'selection' && !state.selected.size) {
      toast('請先選擇欲開工的產品');
      return;
    }
    openDrawer(b.dataset.drawer);
  }
});
function departmentAllowed(n) {
  return !!n && (!state.departments.size || state.departments.has(n.department_id));
}
function visibleFactoryProducts() {
  return [...m.results.values()].filter(r => departmentAllowed(r.node) && factoryStatusMatches(r, state.factoryFilter));
}
function bulkIds() {
  return (state.view === 'factory' ? visibleFactoryProducts() : scopeProducts()).filter(r => r.candidate).map(r => r.node.id);
}
function bulkButton() {
  const ids = bulkIds(),
    all = ids.length && ids.every(id => state.selected.has(id));
  return `<button data-action="select-ready" ${!ids.length ? 'disabled' : ''}>${all ? '取消' : '選取'}範圍內綠燈（${ids.length}）</button>`;
}
function multiDropdown(kind, title, options, selected) {
  const outside = [...selected].filter(id => !options.some(o => o.id === id)).length;
  return `<details class="multi-picker" data-picker="${kind}" ${state.openDropdown === kind ? 'open' : ''}><summary aria-label="${title}多選">${title}：${selected.size ? '已選 ' + selected.size + ' 項' + (outside ? '（篩選外 ' + outside + '）' : '') : 'departments' === kind ? '全部部門' : kind.startsWith('graph') ? '全部狀態' : '請選擇產品'}</summary><div class="picker-pop"><input class="picker-search" data-picker-search="${kind}" aria-label="搜尋${title}" placeholder="${title}名稱模糊搜尋…" value="${attr(state.pickerQueries[kind] || '')}"><div class="picker-actions"><button data-picker-all="${kind}">選取搜尋結果</button><button data-picker-clear="${kind}">清除選取</button><button data-picker-close="${kind}">完成</button></div><div class="picker-options">${options.map(o => `<label class="picker-option" ${!fuzzyMatch(o.name, state.pickerQueries[kind] || '') ? 'hidden' : ''} data-option-name="${attr(o.name)}"><input type="checkbox" data-multi="${kind}" value="${attr(o.id)}" ${selected.has(o.id) ? 'checked' : ''}>${esc(o.name)}</label>`).join('')}</div><p class="picker-empty" hidden>沒有符合的項目</p>${outside ? '<small>已選產品在部門篩選外仍保留；可清除或返回原部門查看。</small>' : ''}</div></details>`;
}
const strokePaths = {
  check: '<circle cx="10" cy="10" r="8"/><path d="m6 10 3 3 5-6"/>',
  progress: '<path d="M10 2a8 8 0 1 1-8 8"/><path d="M10 5v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2v4m8-4v4M3 8h14"/>',
  calendarAdd: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2v4m8-4v4M3 8h14m-7 2v5m-2.5-2.5h5"/>',
  alert: '<circle cx="10" cy="10" r="8"/><path d="M10 5v6m0 3v.1"/>',
  pause: '<circle cx="10" cy="10" r="8"/><path d="M7 6v8m6-8v8"/>',
  question: '<circle cx="10" cy="10" r="8"/><path d="M7 7a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 2v.1"/>',
  clock: '<circle cx="10" cy="10" r="8"/><path d="M10 5v5l3 2"/>'
};
const nodeImageCache = new Map();
function nodeSVG(r, v, target, rank) {
  const imageKey = JSON.stringify([r.node, v, r.color, r.complete, r.total, r.pending[0]?.source, rank]);
  if (nodeImageCache.has(imageKey)) return nodeImageCache.get(imageKey);
  const n = r.node,
    prereq = colors[r.color],
    icon = r.color === 'green' ? 'check' : r.color === 'yellow' ? 'clock' : r.color === 'red' ? 'alert' : 'question',
    name = n.product_name,
    titleLayout = productTitleLayout(name),
    lines = titleLayout.lines;
  const cut = (x, k) => String(x).length > k ? String(x).slice(0, k) + '…' : String(x);
  const text = (x, y, t, size = 12, color = '#344b58', weight = 400) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(t)}</text>`;
  const symbol = (key, x, y, color) => `<g transform="translate(${x} ${y}) scale(.7)" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${strokePaths[key]}</g>`;
  const own = {
    done: ['部署｜驗證完成', '#dfebe3', '#3a6550'],
    active: ['部署｜進行中', '#e0e9f0', '#40637a'],
    scheduled: ['排程｜已安排 ' + (n.schedule?.start || ''), '#e4e8ef', '#55647a'],
    unscheduled: ['排程｜未安排', '#e6eaec', '#5d6e78'],
    missing: ['待部署｜排程資料未提供', '#e6eaec', '#5d6e78'],
    failed: ['部署｜失敗', '#f3dfdc', '#9b4c45'],
    paused: ['部署｜已暫停', '#f1e8d9', '#8c6b37'],
    unknown: [v.label, '#e6eaec', '#5d6e78']
  }[v.key];
  const pre = {
      green: ['前置｜就緒', '#deeee5', '#317554'],
      yellow: ['前置｜等待', '#f5ead0', '#8c6b21'],
      red: ['前置｜異常阻擋', '#f3dfdc', '#9b4c45'],
      gray: ['前置｜證據不足', '#e9edef', '#64737e']
    }[r.color],
    top = lines.length > 1 ? 50 : 36;
  const tag = (y, label, fill, fg, key) => `<rect x="15" y="${y}" width="254" height="23" rx="5" fill="${fill}"/>${symbol(key, 22, y + 4, fg)}${text(43, y + 15.5, label, 11.5, fg, 500)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1710" height="924" viewBox="0 0 285 154"><rect width="285" height="154" rx="9" fill="${v.fill}"/><path d="M3 9V145" stroke="${prereq}" stroke-width="5"/><g font-family="Arial, sans-serif">${lines.map((line, i) => text(16, 25 + i * 16, line, 14, '#213c4b', 600)).join('')}${departmentSvgTag(n, titleLayout.tagX, titleLayout.tagY)}${tag(top, own[0], own[1], own[2], v.icon)}${tag(top + 28, pre[0] + ' · ' + r.complete + '／' + r.total, pre[1], pre[2], icon)}${text(16, top + 69, r.pending.length ? '等待 ' + cut(nname(r.pending[0].source), 27) : '所有必要前置已滿足', 10, '#657982')}${text(16, top + 88, rank, 10, '#76868e')}</g></svg>`;
  const image = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  if (nodeImageCache.size >= 1200) nodeImageCache.delete(nodeImageCache.keys().next().value);
  nodeImageCache.set(imageKey, image);
  return image;
}
function closePickers(except = null) {
  for (const picker of document.querySelectorAll('.multi-picker[open]')) if (picker !== except) picker.open = false;
  if (!except) state.openDropdown = null;
}
document.addEventListener('pointerdown', e => {
  closePickers(e.target.closest('.multi-picker'));
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const picker = document.querySelector('.multi-picker[open]');
    if (picker) {
      closePickers();
      picker.querySelector('summary').focus();
      e.preventDefault();
    }
  }
});
document.addEventListener('focusin', e => {
  if (!e.target.closest('.multi-picker')) closePickers();
});
document.addEventListener('toggle', e => {
  if (e.target.isConnected && e.target.matches?.('.multi-picker')) {
    if (e.target.open) state.openDropdown = e.target.dataset.picker;else if (state.openDropdown === e.target.dataset.picker) state.openDropdown = null;
  }
}, true);
document.addEventListener('input', e => {
  if (e.target.matches('[data-picker-search]')) {
    const picker = e.target.closest('.multi-picker');
    state.pickerQueries[e.target.dataset.pickerSearch] = e.target.value;
    let count = 0;
    for (const label of picker.querySelectorAll('.picker-option')) {
      label.hidden = !fuzzyMatch(label.dataset.optionName, e.target.value);
      if (!label.hidden) count++;
    }
    picker.querySelector('.picker-empty').hidden = !!count;
  }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-multi]')) {
    const kind = e.target.dataset.multi,
      set = state[kind];
    if (e.target.checked) set.add(e.target.value);else set.delete(e.target.value);
    state.openDropdown = kind;
    if (!kind.startsWith('graph')) state.focus = null;
    if (kind === 'products' && set.size) {
      state.product = [...set][0];
      state.detail = state.product;
    }
    render();
  }
  if (e.target.id === 'factoryStatus') applyFactoryStatusFilter(e.target.value);
});
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const kind = b.dataset.pickerAll || b.dataset.pickerClear || b.dataset.pickerClose;
  if (!kind) return;
  if (b.dataset.pickerClose) {
    b.closest('details').open = false;
    state.openDropdown = null;
    return;
  }
  const set = state[kind];
  if (b.dataset.pickerClear) set.clear();else for (const input of b.closest('details').querySelectorAll('.picker-option:not([hidden]) input')) set.add(input.value);
  state.openDropdown = kind;
  if (kind === 'products' && set.size) {
    state.product = [...set][0];
    state.detail = state.product;
  }
  render();
});
function analysisContext() {
  if (state.focus && m.by.has(state.focus)) return `<div class="analysis-context" role="status"><div><span class="eyebrow">目前分析目標</span><strong>${esc(nname(state.focus))}</strong><span class="analysis-chip">${state.trial.has(state.focus) ? '假設完成試算' : '下游影響分析'}</span><small>${esc(m.by.get(state.focus).department_name)} · ${state.trial.has(state.focus) ? '僅試算，未修改正式狀態' : '依目前有效快照分析'}</small></div><div id="analysisVisibility"></div></div>`;
  if (state.view === 'product') return `<div class="analysis-context"><span>目前分析產品：<b>${[...state.products].map(nname).map(esc).join('、') || '尚未選取'}</b></span></div>`;
  return '';
}
function actualState(id) {
  return deploymentVisual(base.by.get(id), base.results.get(id)).label;
}
function trialComparison(id) {
  if (!state.trial.size) return '';
  const original = base.results.get(id),
    now = m.results.get(id);
  return `<div class="simulation-status">假設以下產品部署驗證完成：<ul class="trial-source-list">${[...state.trial].map(key => `<li>${esc(nname(key))}</li>`).join('')}</ul>前置判定：${esc(lamps[original.color])} → ${esc(lamps[now.color])}<br>必要條件：${original.complete}／${original.total} → ${now.complete}／${now.total}</div>`;
}
function showGraphHover(event) {
  if (event.originalEvent?.buttons || cy?.nodes(':grabbed').length || $('#graph')?.dataset.interacting) return;
  let tip = $('#graphHover');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'graphHover';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
  }
  const members = event.target.data('members'),
    hoverKey = members.join('|');
  if (tip.dataset.product !== hoverKey) {
    tip.dataset.product = hoverKey;
    renderRegion(tip, members.slice(0, 3).map(id => `<b>${esc(nname(id))}</b><div>實際狀態｜${esc(actualState(id))}</div>${trialComparison(id)}`).join('<hr>') + (members.length > 3 ? '<small>另有 ' + (members.length - 3) + ' 項，點選查看完整證據</small>' : ''));
  }
  const rect = $('#graph').getBoundingClientRect(),
    pos = event.renderedPosition || {
      x: 0,
      y: 0
    },
    x = event.originalEvent?.clientX ?? rect.left + pos.x,
    y = event.originalEvent?.clientY ?? rect.top + pos.y;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 10, x + 16)) + 'px';
  tip.style.top = Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 10, y + 16)) + 'px';
}
function inspectProduct(id, remember = true) {
  if (state.view === 'factory' && state.graphMode === 'cycles') {
    cycleBench.selectProduct(id);
    return;
  }
  if (!cy || !m.by.has(id)) return;
  if (remember && inspectionTarget !== id) inspectionHistory.push({
    id: inspectionTarget,
    direction: inspectionDirection,
    pan: {
      ...cy.pan()
    },
    zoom: cy.zoom()
  });
  inspectionTarget = id;
  state.detail = id;
  if ($('#graphProductSearch')) $('#graphProductSearch').value = nname(id);
  const downstream = inspectionDirection === 'down',
    both = inspectionDirection === 'both',
    impact = downstream || both ? downstreamImpact(id, m.gates) : null,
    ancestry = both ? new Set([...m.ancestors(id), ...impact.keys()]) : downstream ? new Set([id, ...impact.keys()]) : m.ancestors(id),
    directionLabel = both ? '上下游' : downstream ? '下游' : '上游',
    all = new Set([...(graphRequest?.ids || []), ...ancestry]);
  const hierarchy = condensed(m, all);
  const anchor = cy.nodes().filter(node => node.data('members').includes(id)).first();
  const anchorPos = anchor.length ? anchor.position() : {
      x: 0,
      y: 0
    },
    anchorGroup = hierarchy.map.get(id),
    anchorRank = hierarchy.rank.get(anchorGroup) || 0;
  const matches = r => graphStateMatches(r.node, r, state.graphExecution, state.graphPrerequisite);
  let hidden = 0;
  cy.batch(() => {
    for (const group of hierarchy.groups) {
      const results = group.members.map(key => m.results.get(key));
      if (!results.some(matches)) {
        hidden += group.members.filter(key => ancestry.has(key)).length;
        continue;
      }
      if (cy.getElementById(group.id).length) continue;
      const result = results[0],
        v = deploymentVisual(result.node, result),
        color = results.some(r => r.color === 'red') ? 'red' : results.some(r => r.color === 'gray') ? 'gray' : results.some(r => r.color === 'yellow') ? 'yellow' : 'green';
      let pos = {
        x: anchorPos.x - ((hierarchy.rank.get(group.id) || 0) - anchorRank) * 325,
        y: anchorPos.y
      };
      while (cy.nodes().some(n => Math.abs(n.position().x - pos.x) < 260 && Math.abs(n.position().y - pos.y) < 165)) pos.y += 190;
      cy.add({
        group: 'nodes',
        data: {
          id: group.id,
          members: group.members,
          label: group.cycle ? '循環群組\n' + group.members.slice(0, 3).map(nname).join('\n') : '',
          svg: group.cycle ? 'none' : nodeSVG(result, v, false, downstream ? '下游產品' : '必要上游'),
          fill: v.fill,
          color: group.cycle ? colors[color] : '#aab8bd',
          analysisFocus: 0,
          target: 1.5
        },
        position: pos
      });
    }
    for (const edge of hierarchy.edges) {
      const source = hierarchy.map.get(edge.source),
        target = hierarchy.map.get(edge.target);
      if (source === target || cy.getElementById(edge.edge_id).length || !cy.getElementById(source).length || !cy.getElementById(target).length) continue;
      cy.add({
        group: 'edges',
        data: {
          id: edge.edge_id,
          source,
          target,
          edge,
          color: m.met(edge) ? '#a8beb6' : '#c99c5b',
          style: m.met(edge) ? 'dashed' : 'solid'
        }
      });
    }
    cy.elements().removeClass('dim inspection-focus');
    cy.nodes().data('analysisFocus', 0);
    cy.nodes().filter(n => n.data('members').includes(id)).addClass('inspection-focus');
    cy.nodes().filter(n => !n.data('members').some(key => ancestry.has(key))).addClass('dim');
    cy.edges().filter(e => !ancestry.has(e.data('edge').source) || !ancestry.has(e.data('edge').target)).addClass('dim');
  });
  if (graphRequest) graphRequest.ids = all;
  const direct = downstream ? new Set([...impact.values()].filter(x => x.direct).map(x => x.id)) : new Set((m.incoming.get(id) || []).map(e => e.source));
  $('#inspectionBar').hidden = false;
  renderRegion($('#inspectionBar'), `<div><small>目前檢視目標（不變更完成假設）</small><b>${esc(nname(id))}</b><span>直接${downstream ? '下游' : '前置'} ${direct.size} 項 · 完整${directionLabel} ${ancestry.size - 1} 項${downstream ? ' · 依賴影響不等於立即可開工' : ' · 未滿足 ' + m.results.get(id).pending.length + ' 個條件'}</span>${hidden ? `<span class="yellow">${hidden} 項${directionLabel}被狀態篩選隱藏</span>` : ''}</div><div class="tools inspection-actions"><button data-decision-open="${esc(id)}">決策分析</button><button data-inspection="evidence">查看證據</button><div class="direction-toggle" role="group" aria-label="上下游切換"><button data-inspection="up" aria-pressed="${!downstream && !both}" class="${!downstream && !both ? 'active' : ''}">上游前置</button><button data-inspection="down" aria-pressed="${downstream}" class="${downstream ? 'active' : ''}">下游影響</button></div><button data-inspection="complete" aria-pressed="${both}">顯示完整 Graph</button><button data-inspection="back" ${!inspectionHistory.length ? 'disabled' : ''}>返回上一目標</button><button data-inspection="clear">清除聚焦</button></div>`);
  $('#graph').dataset.inspectionTarget = id;
  $('#graph').dataset.inspectionDirection = inspectionDirection;
  $('#graph').dataset.relatedProducts = String(ancestry.size - 1);
  $('#graph').setAttribute('tabindex', '0');
  $('#graphcaption').textContent = `目前檢視 ${nname(id)} · 完整${directionLabel} ${ancestry.size - 1} 項 · 圖中 ${cy.nodes().length} 個節點／群組`;
  requestAnimationFrame(() => cy?.resize());
  showDetail(id);
}
function clearInspection() {
  inspectionTarget = null;
  cy?.elements().removeClass('dim inspection-focus');
  cy?.nodes().forEach(n => n.data('analysisFocus', n.data('members').includes(state.focus) ? 1 : 0));
  if ($('#inspectionBar')) $('#inspectionBar').hidden = true;
  if ($('#graph')) delete $('#graph').dataset.inspectionTarget;
  requestAnimationFrame(() => cy?.resize());
}
document.addEventListener('click', e => {
  const action = e.target.closest('[data-inspection]')?.dataset.inspection;
  if (!action) return;
  if (action === 'up' || action === 'down') {
    inspectionDirection = action;
    inspectProduct(inspectionTarget, false);
  }
  if (action === 'evidence') {
    showDetail(inspectionTarget);
    openDrawer('evidence');
  }
  if (action === 'clear') clearInspection();
  if (action === 'back') {
    const previous = inspectionHistory.pop();
    if (previous) {
      if (previous.id) {
        inspectionDirection = previous.direction || 'up';
        inspectProduct(previous.id, false);
      } else clearInspection();
      cy.zoom(previous.zoom);
      cy.pan(previous.pan);
    }
  }
  if (action === 'complete') {
    inspectionDirection = 'both';
    state.graphExecution.clear();
    state.graphPrerequisite.clear();
    for (const kind of ['graphExecution', 'graphPrerequisite']) {
      const picker = document.querySelector('[data-picker="' + kind + '"]');
      if (picker) {
        picker.querySelectorAll('input[type=checkbox]').forEach(input => input.checked = false);
        picker.querySelector('summary').textContent = (kind === 'graphExecution' ? '部署／排程狀態' : '前置狀況') + '：全部狀態';
      }
    }
    inspectProduct(inspectionTarget, false);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) clearInspection();
  if (e.target.id === 'graph' && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const nodes = cy?.nodes(':visible');
    if (nodes?.length) {
      e.preventDefault();
      const selected = Array.from(nodes).findIndex(n => n.selected()),
        index = selected < 0 ? e.key === 'ArrowRight' ? 0 : nodes.length - 1 : (selected + (e.key === 'ArrowRight' ? 1 : -1) + nodes.length) % nodes.length;
      cy.nodes().unselect();
      nodes[index].select();
    }
  }
  if (e.target.id === 'graph' && ['Enter', ' '].includes(e.key)) {
    const node = cy?.nodes(':selected').first();
    if (node?.length) {
      e.preventDefault();
      inspectProduct(node.data('members')[0]);
    }
  }
});
const graphExecutionOptions = [['done', '部署驗證完成'], ['active', '正在部署'], ['scheduled', '已安排時程'], ['unscheduled', '未安排時程'], ['missing', '待部署・排程資料未提供'], ['failed', '部署失敗'], ['paused', '已暫停'], ['unknown', '狀態／完成證據待確認']].map(([id, name]) => ({
  id,
  name
}));
const graphPrerequisiteOptions = [['green', '前置就緒'], ['yellow', '等待前置'], ['red', '異常阻擋'], ['gray', '證據不足']].map(([id, name]) => ({
  id,
  name
}));
let affectedContext = null;
function openAffected(source) {
  const impacts = downstreamImpact(source, base.gates);
  const ids = [...impacts.keys()].filter(id => departmentAllowed(base.by.get(id)) && base.results.get(id).execution === 'pending');
  affectedContext = {
    source,
    factory: state.factory,
    ids,
    impacts,
    query: '',
    depth: 'all',
    status: 'all',
    expanded: new Set(),
    limits: new Map(),
    scope: state.departments.size ? [...state.departments].map(deptName).join('、') : '全廠部門'
  };
  openDrawer('affected');
}
function affectedRows() {
  if (!affectedContext) return [];
  return affectedContext.ids.map(id => ({
    ...affectedContext.impacts.get(id),
    node: base.by.get(id),
    result: m.results.get(id)
  })).filter(r => fuzzyMatch(r.node.product_name + ' ' + r.node.department_name, affectedContext.query)).filter(r => affectedContext.depth === 'all' || affectedContext.depth === 'direct' && r.depth === 1 || affectedContext.depth === 'indirect' && r.depth > 1 || affectedContext.depth === 'deep' && r.depth >= 3).filter(r => affectedContext.status === 'all' || r.result.color === affectedContext.status);
}
function renderAffected() {
  let pane = document.querySelector('[data-drawer-pane="affected"]');
  if (!pane) {
    pane = document.createElement('section');
    pane.dataset.drawerPane = 'affected';
    $('#drawerBody').append(pane);
  }
  if (!affectedContext || affectedContext.factory !== state.factory) {
    renderRegion(pane, empty('工廠範圍已變更，請重新點選受影響產品數量。'));
    return;
  }
  const c = affectedContext,
    rows = affectedRows(),
    all = c.ids.map(id => c.impacts.get(id)),
    groups = bundle.departments.map(d => ({
      ...d,
      rows: rows.filter(r => r.node.department_id === d.department_id)
    })).filter(g => g.rows.length);
  renderRegion(pane, `<div class="impact-heading"><small>來源產品</small><h2>${esc(nname(c.source))}</h2><p>${esc(ctx.factory.factory_name)} · ${esc(c.scope)}<br>基準待部署產品範圍；${state.trial.size ? '前置顯示目前試算判定' : '依原始快照判定'}。不變更Graph。</p></div><div class="impact-summary"><b>${c.ids.length}<small>受影響產品</small></b><b>${new Set(c.ids.map(id => base.by.get(id).department_id)).size}<small>個部門</small></b><b>${all.filter(r => r.depth === 1).length}<small>直接影響</small></b><b>${all.filter(r => r.depth > 1).length}<small>間接影響</small></b></div><div class="impact-filters"><input id="affectedSearch" aria-label="搜尋受影響產品" placeholder="搜尋產品或部門…" value="${attr(c.query)}"><select id="affectedDepth" aria-label="影響層級">${[['all', '全部影響'], ['direct', '直接／第1階'], ['indirect', '間接／第2階以上'], ['deep', '第3階以上']].map(([v, t]) => `<option value="${v}" ${v === c.depth ? 'selected' : ''}>${t}</option>`).join('')}</select><select id="affectedStatus" aria-label="受影響產品前置狀態">${[['all', '全部前置狀況'], ...Object.entries(lamps)].map(([v, t]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="tools"><button data-impact-action="expand">全部部門展開</button><button data-impact-action="collapse">全部部門收合</button><span class="muted">顯示 ${rows.length}／${c.ids.length} 項</span></div></div><div class="impact-groups">${groups.map(g => {
    const limit = c.limits.get(g.department_id) || 20;
    return `<details class="impact-group" data-impact-group="${g.department_id}" ${c.expanded.has(g.department_id) || c.query ? 'open' : ''}><summary><b>${esc(g.department_name)}</b><span>${g.rows.length} 項 · 直接 ${g.rows.filter(r => r.depth === 1).length}／間接 ${g.rows.filter(r => r.depth > 1).length}</span></summary><div>${g.rows.slice(0, limit).map(r => `<details class="impact-product"><summary><b>${esc(r.node.product_name)}</b><span class="impact-depth">${r.direct ? '直接 · 第1階' : '間接 · 第' + r.depth + '階'}</span><small>實際｜${esc(actualState(r.id))}</small><span class="badge ${r.result.color}">${state.trial.size ? '試算前置｜' : ''}${lamps[r.result.color]}</span>${r.result.candidate && !base.baselineReady.has(r.id) ? '<small class="green">試算新增就緒</small>' : ''}</summary><div class="impact-product-detail"><p>代表最短路徑</p><div>${r.path.map(nname).map(esc).join(' → ')}</div><p>${r.cyclic ? '涉及設定循環；層級採最短路徑，不重複計數。' : ''}</p><p>必要條件 ${r.result.complete}／${r.result.total} 已滿足</p>${r.result.pending.slice(0, 5).map(e => `<div>尚待 ${esc(nname(e.source))} → ${esc(nname(e.target))} · ${esc(base.by.get(e.source).department_name)}</div>`).join('')}${r.result.pending.length > 5 ? `<p>另有 ${r.result.pending.length - 5} 個未滿足條件。</p>` : ''}</div></details>`).join('')}${g.rows.length > limit ? `<button class="impact-more" data-impact-more="${g.department_id}">再載入 ${Math.min(20, g.rows.length - limit)} 項（尚有 ${g.rows.length - limit} 項）</button>` : ''}</div></details>`;
  }).join('') || empty('沒有符合條件的受影響產品。')}</div><p class="impact-footnote">每項產品只計數一次，以最短必要路徑區分直接／間接。依賴影響不代表目前受阻，也不代表能立即開工。</p>`);
}
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.affected) openAffected(b.dataset.affected);
  if (b.dataset.impactMore) {
    const key = b.dataset.impactMore;
    affectedContext.limits.set(key, (affectedContext.limits.get(key) || 20) + 20);
    renderAffected();
  }
  if (b.dataset.impactAction) {
    if (b.dataset.impactAction === 'collapse') {
      affectedContext.query = '';
      affectedContext.expanded.clear();
    } else for (const row of affectedRows()) affectedContext.expanded.add(row.node.department_id);
    renderAffected();
  }
});
document.addEventListener('toggle', e => {
  if (e.target.isConnected && e.target.matches?.('[data-impact-group]') && affectedContext && !affectedContext.query) {
    const id = e.target.dataset.impactGroup;
    if (e.target.open) affectedContext.expanded.add(id);else affectedContext.expanded.delete(id);
  }
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'affectedSearch') {
    const pos = e.target.selectionStart;
    affectedContext.query = e.target.value;
    affectedContext.limits.clear();
    renderAffected();
    $('#affectedSearch').focus();
    $('#affectedSearch').setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', e => {
  if (['affectedDepth', 'affectedStatus'].includes(e.target.id)) {
    affectedContext[e.target.id === 'affectedDepth' ? 'depth' : 'status'] = e.target.value;
    affectedContext.limits.clear();
    renderAffected();
  }
});
refresh();
watchProductDepartments(() => m?.nodes);
function evidenceGate(e) {
  const n = m.by.get(e.source),
    original = base.by.get(e.source),
    t = e.temporal_constraint || {};
  return `<details class="evidence-gate"><summary><span class="${m.met(e) ? 'green' : 'yellow'}">${m.met(e) ? '✓ 已滿足' : '◷ 未滿足'}</span> ${esc(nname(e.source))} → ${esc(nname(e.target))}</summary><dl><dt>要求</dt><dd>${esc(t.predecessor_state || 'Ready')} · 版本 ${esc(t.required_version || '未限制')}</dd><dt>目前判定</dt><dd>${esc(edgeReason(e))}</dd><dt>${state.trial.size ? '試算狀態' : '目前狀態'}</dt><dd>${esc(n.status)} · ${esc(n.version)} · ${esc((n.milestones || []).join('、') || '無里程碑')}</dd><dt>原始證據</dt><dd>${esc(original.status)} · ${esc(original.version)}<br>${esc(original.observed_at || '時間未提供')}<br>${esc(original.status_source || '來源未提供')}</dd><dt>責任團隊／關係依據</dt><dd>${esc(n.owner_team)}<br>${esc(e.rationale || '必要部署條件')}</dd></dl></details>`;
}
function startEvidence(id) {
  evidenceState = {
    model: evidenceHierarchy(m, id),
    onlyBlocked: true,
    mode: 'tree',
    entries: new Map(),
    serial: 0,
    canonical: new Map()
  };
  renderEvidence();
}
function evidenceRow(branch, parent, open = false) {
  const s = evidenceState,
    g = s.model.groups.get(branch.source),
    key = String(++s.serial),
    canonical = s.canonical.get(g.id),
    isReference = !!canonical;
  if (!canonical) s.canonical.set(g.id, key);
  s.entries.set(key, {
    group: g.id,
    edges: branch.edges,
    parent,
    reference: canonical,
    limit: 20
  });
  const names = g.members.map(nname).join('、'),
    dep = [...new Set(g.members.map(id => m.by.get(id).department_name))].join('、');
  const waiting = branch.edges.filter(e => !m.met(e)).length,
    children = s.model.branches(g.id, s.onlyBlocked).length;
  const summary = `<span class="evidence-name">${esc(g.cycle ? '循環群組 · ' + names : names)}</span><span class="${waiting ? 'yellow' : 'green'}">${waiting ? '本層等待 ' + waiting + ' 條' : '本層條件已滿足'}</span><small>${children ? ' · 更上游 ' + children + ' 組' : ''}${g.references > 1 ? ' · 共用前置（' + g.references + ' 處引用）' : ''}</small>`;
  return `<details class="evidence-node" id="evidence-node-${key}" data-evidence-node="${key}" ${open ? 'open' : ''}><summary>${summary}</summary><div class="evidence-node-body" ${open ? 'data-loaded="true"' : ''}>${open ? evidenceNodeBody(key) : ''}</div></details>`;
}
function evidenceNodeBody(key) {
  const s = evidenceState,
    entry = s.entries.get(key),
    g = s.model.groups.get(entry.group);
  return `<div class="evidence-context">供應給 ${esc(s.model.groups.get(entry.parent).members.map(nname).join('、'))}</div>${g.members.map(id => `<div class="evidence-state"><b>${esc(nname(id))}</b><span>實際｜${esc(actualState(id))}</span>${badge(m.results.get(id))}</div>`).join('')}${entry.edges.map(evidenceGate).join('')}${g.cycle ? `<div class="notice">此群組存在循環依賴，不代表可依序開工。群組內 ${g.internal.length} 條條件可逐一查看。</div>${g.internal.map(evidenceGate).join('')}` : ''}${entry.reference ? `<button class="evidence-reference" data-evidence-reference="${entry.reference}">↗ 查看已列出的共用前置及其上游</button>` : `<div data-evidence-children="${key}">${evidenceChildren(key)}</div>`}`;
}
function evidenceChildren(key) {
  const s = evidenceState,
    entry = s.entries.get(key),
    branches = s.model.branches(entry.group, s.onlyBlocked);
  return `${branches.slice(0, entry.limit).map(b => evidenceRow(b, entry.group)).join('')}${branches.length > entry.limit ? `<button data-evidence-more="${key}" class="evidence-more">再顯示 20 組（已顯示 ${entry.limit}／${branches.length}）</button>` : ''}`;
}
function renderEvidence() {
  const host = $('#evidenceTree'),
    s = evidenceState;
  if (!host || !s) return;
  s.entries.clear();
  s.canonical.clear();
  s.serial = 0;
  const model = s.model,
    root = model.groups.get(model.root);
  s.entries.set('root', {
    group: model.root,
    limit: 20
  });
  const branches = model.branches(model.root, s.onlyBlocked),
    shown = branches.slice(0, 20);
  let list = '';
  if (s.mode === 'department') {
    const departments = new Map();
    for (const b of shown) {
      const label = [...new Set(model.groups.get(b.source).members.map(id => m.by.get(id).department_name))].join('、');
      if (!departments.has(label)) departments.set(label, []);
      departments.get(label).push(b);
    }
    list = [...departments].map(([dept, items]) => `<details class="evidence-department" data-evidence-department="${attr(dept)}" open><summary>${esc(dept)} · ${items.length} 組</summary>${items.map(b => evidenceRow(b, model.root, true)).join('')}</details>`).join('');
  } else list = shown.map(b => evidenceRow(b, model.root, true)).join('');
  renderRegion(host, `<div class="evidence-controls"><div class="evidence-heading"><h3>目標的前置依賴</h3><b>${esc(nname(model.target))}</b><p>直接等待 ${model.directProducts} 項產品 · 完整上游 ${model.pending} 條未滿足條件</p></div><div class="evidence-tools"><label><input type="checkbox" data-evidence-blocked ${s.onlyBlocked ? 'checked' : ''}>只看阻擋路徑</label><select aria-label="證據分組方式" id="evidenceGrouping"><option value="tree" ${s.mode === 'tree' ? 'selected' : ''}>依賴階層</option><option value="department" ${s.mode === 'department' ? 'selected' : ''}>責任部門（第一層）</option></select><button data-evidence-collapse>全部收合</button></div></div><p class="evidence-hint">由目標往上追溯；「本層已滿足」仍可能有更上游阻擋。產品數去重，條件逐條計算。</p>${root.cycle ? `<details class="evidence-root-cycle"><summary>目標位於循環群組 · ${root.members.length} 項產品</summary><p>${esc(root.members.map(nname).join('、'))}</p>${root.internal.map(evidenceGate).join('')}</details>` : ''}<div id="evidenceBranches">${list || '<p class="empty">' + (s.onlyBlocked ? '沒有未滿足的前置路徑' : '此目標沒有群組外的必要前置') + '</p>'}</div>${branches.length > 20 ? `<button data-evidence-root-more>再顯示 20 組（已顯示 20／${branches.length}）</button>` : ''}<p class="evidence-hint">本層顯示 ${Math.min(20, branches.length)}／${branches.length} 組 · 共用前置僅展開一次，可透過引用跳轉。${state.trial.size ? '目前為試算結果。' : ''}</p>`);
}
document.addEventListener('toggle', e => {
  const row = e.target;
  if (!row.matches?.('[data-evidence-node]') || !row.open || !row.isConnected || !evidenceState) return;
  const body = row.querySelector(':scope > .evidence-node-body');
  if (body.dataset.loaded) return;
  body.dataset.loaded = 'true';
  renderRegion(body, evidenceNodeBody(row.dataset.evidenceNode));
}, true);
document.addEventListener('change', e => {
  if (!evidenceState) return;
  if (e.target.matches('[data-evidence-blocked]')) {
    evidenceState.onlyBlocked = e.target.checked;
    renderEvidence();
  }
  if (e.target.id === 'evidenceGrouping') {
    evidenceState.mode = e.target.value;
    renderEvidence();
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !evidenceState) return;
  const s = evidenceState;
  if (b.hasAttribute('data-evidence-collapse')) $('#evidenceTree').querySelectorAll('details').forEach(row => row.open = false);
  if (b.dataset.evidenceReference) {
    const row = $('#evidence-node-' + b.dataset.evidenceReference);
    if (row) {
      for (let parent = row.parentElement; parent && parent !== $('#evidenceTree'); parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      row.open = true;
      row.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      row.classList.add('evidence-jump');
      setTimeout(() => row.classList.remove('evidence-jump'), 1800);
    }
  }
  if (b.dataset.evidenceMore) {
    const key = b.dataset.evidenceMore,
      entry = s.entries.get(key),
      branches = s.model.branches(entry.group, s.onlyBlocked),
      next = branches.slice(entry.limit, entry.limit + 20);
    entry.limit += 20;
    insertRegion(b, 'beforebegin', next.map(x => evidenceRow(x, entry.group)).join(''));
    if (entry.limit >= branches.length) b.remove();else b.textContent = '再顯示 20 組（已顯示 ' + entry.limit + '／' + branches.length + '）';
  }
  if (b.hasAttribute('data-evidence-root-more')) {
    const entry = s.entries.get('root'),
      branches = s.model.branches(s.model.root, s.onlyBlocked),
      next = branches.slice(entry.limit, entry.limit + 20);
    entry.limit += 20;
    appendEvidenceRoot(next);
    if (entry.limit >= branches.length) b.remove();else b.textContent = '再顯示 20 組（已顯示 ' + entry.limit + '／' + branches.length + '）';
    $('#evidenceTree').querySelectorAll(':scope > .evidence-hint').forEach(p => {
      if (p.textContent.startsWith('本層顯示')) p.textContent = '本層顯示 ' + Math.min(entry.limit, branches.length) + '／' + branches.length + ' 組 · 共用前置僅展開一次，可透過引用跳轉。';
    });
  }
});
function appendEvidenceRoot(branches) {
  const s = evidenceState,
    host = $('#evidenceBranches');
  for (const b of branches) {
    let container = host;
    if (s.mode === 'department') {
      const label = [...new Set(s.model.groups.get(b.source).members.map(id => m.by.get(id).department_name))].join('、');
      container = [...host.querySelectorAll(':scope > [data-evidence-department]')].find(x => x.dataset.evidenceDepartment === label);
      if (!container) {
        insertRegion(host, 'beforeend', `<details class="evidence-department" data-evidence-department="${attr(label)}" open><summary>${esc(label)}</summary></details>`);
        container = host.lastElementChild;
      }
    }
    insertRegion(container, 'beforeend', evidenceRow(b, s.model.root, true));
    if (s.mode === 'department') container.querySelector(':scope > summary').textContent = container.dataset.evidenceDepartment + ' · ' + container.querySelectorAll(':scope > .evidence-node').length + ' 組';
  }
}
function hideGraphHover() {
  $('#graphHover')?.remove();
}
document.addEventListener('scroll', hideGraphHover, true);
document.addEventListener('pointerdown', hideGraphHover, true);
window.addEventListener('blur', hideGraphHover);
function graphProductPicker() {
  return `<div class="graph-product-picker"><label for="graphProductSearch">搜尋並定位產品</label><div class="graph-product-input"><input id="graphProductSearch" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="graphProductOptions" autocomplete="off" placeholder="輸入產品名稱…"><button type="button" data-graph-search-toggle aria-label="展開產品單選選單">⌄</button></div><div id="graphProductOptions" class="graph-product-options" role="listbox" aria-label="產品搜尋結果" hidden></div></div>`;
}
function closeGraphSearch() {
  const list = $('#graphProductOptions'),
    input = $('#graphProductSearch');
  if (list) list.hidden = true;
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
}
function renderGraphSearch() {
  const input = $('#graphProductSearch'),
    list = $('#graphProductOptions');
  if (!input || !list) return;
  const query = input.value.trim(),
    nodes = m.nodes.filter(n => fuzzyMatch(n.product_name + ' ' + n.department_name, query));
  renderRegion(list, nodes.map((n, i) => `<button type="button" id="graph-search-option-${i}" role="option" aria-selected="${n.id === inspectionTarget}" data-graph-product="${attr(n.id)}"><span>${esc(n.product_name)}</span></button>`).join('') || '<p class="empty">沒有符合的產品</p>');
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  input.removeAttribute('aria-activedescendant');
}
function chooseGraphProduct(id) {
  if (!m.by.has(id)) return;
  if (state.view === 'factory' && state.graphMode === 'cycles') {
    closeGraphSearch();
    cycleBench.selectProduct(id);
    return;
  }
  closeGraphSearch();
  hideGraphHover();
  const r = m.results.get(id);
  if (!graphStateMatches(r.node, r, state.graphExecution, state.graphPrerequisite)) {
    state.graphExecution.clear();
    state.graphPrerequisite.clear();
    for (const kind of ['graphExecution', 'graphPrerequisite']) {
      const picker = document.querySelector('[data-picker="' + kind + '"]');
      if (picker) {
        picker.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
        picker.querySelector('summary').textContent = (kind === 'graphExecution' ? '部署／排程狀態' : '前置狀況') + '：全部狀態';
      }
    }
    toast('已清除圖形狀態篩選，以顯示選取產品');
  }
  if (!cy) {
    const ids = m.ancestors(id);
    drawGraph(ids, new Set([id]));
    drawGraphNow(ids, new Set([id]));
  }
  if (!cy) return;
  inspectProduct(id);
  $('#graphProductSearch').value = nname(id);
  requestAnimationFrame(() => {
    if (cy && inspectionTarget === id) {
      cy.resize();
      const node = cy.nodes().filter(n => n.data('members').includes(id)).first();
      if (node.length) cy.center(node);
      $('#graph').focus({
        preventScroll: true
      });
    }
  });
}
document.addEventListener('input', e => {
  if (e.target.id === 'graphProductSearch') renderGraphSearch();
});
document.addEventListener('focusin', e => {
  if (e.target.id === 'graphProductSearch') renderGraphSearch();else if (!e.target.closest('.graph-product-picker')) closeGraphSearch();
});
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.graph-product-picker')) closeGraphSearch();
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.graphProduct) chooseGraphProduct(b.dataset.graphProduct);
  if (b.hasAttribute('data-graph-search-toggle')) {
    if ($('#graphProductOptions').hidden) {
      $('#graphProductSearch').focus();
      renderGraphSearch();
    } else closeGraphSearch();
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'graphProductSearch') return;
  const list = $('#graphProductOptions');
  if (e.key === 'Escape' && !list.hidden) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeGraphSearch();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (list.hidden) renderGraphSearch();
  const options = [...list.querySelectorAll('[data-graph-product]')];
  if (!options.length) return;
  const active = options.findIndex(o => o.id === e.target.getAttribute('aria-activedescendant'));
  if (e.key === 'Enter') {
    chooseGraphProduct(options[active < 0 ? 0 : active].dataset.graphProduct);
    return;
  }
  const index = active < 0 ? e.key === 'ArrowDown' ? 0 : options.length - 1 : (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  for (const o of options) o.classList.remove('keyboard-active');
  options[index].classList.add('keyboard-active');
  e.target.setAttribute('aria-activedescendant', options[index].id);
  options[index].scrollIntoView({
    block: 'nearest'
  });
}, true);
function applyFactoryStatusFilter(filter) {
  if (state.view !== 'factory') return;
  state.factoryFilter = filter;
  stats();
  const status = $('#factoryStatus');
  if (status) status.value = filter;
  const panel = $('#deploymentProducts');
  if (!panel) return;
  const ids = new Set(visibleFactoryProducts().map(r => r.node.id));
  panel.querySelector('[data-factory-filter-summary]').textContent = '顯示 ' + ids.size + ' 項 · ' + factoryFilterLabel(filter) + '；勾選不代表前置已完成。';
  for (const card of panel.querySelectorAll('[data-factory-product]')) card.hidden = !ids.has(card.dataset.factoryProduct);
  for (const lane of panel.querySelectorAll('[data-factory-lane]')) {
    const count = [...lane.querySelectorAll('[data-factory-product]')].filter(c => !c.hidden).length;
    lane.hidden = count === 0;
    lane.querySelector('[data-factory-count]').textContent = count + ' 項';
    lane.querySelector('[data-factory-empty]').hidden = count > 0;
  }
  panel.querySelector('[data-factory-no-results]').hidden = ids.size > 0;
  const body = panel.querySelector(':scope > .card-content'),
    toggle = panel.querySelector(':scope > .panelhead > .card-toggle');
  if (body) body.hidden = false;
  if (toggle) {
    collapsedCards.delete(toggle.dataset.cardKey);
    initializedCards.add(toggle.dataset.cardKey);
    toggle.textContent = '− 收合';
    toggle.setAttribute('aria-expanded', 'true');
  }
  const bulk = panel.querySelector('[data-action="select-ready"]');
  if (bulk) replaceRegion(bulk, bulkButton());
  const outside = $('.deployment-tools > .candidate-summary');
  if (outside) outside.textContent = '已選候選 ' + state.selected.size + ' 項 · 篩選外 ' + [...state.selected].filter(id => !ids.has(id)).length + ' 項';
  if (!reviewMode) panel.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.kpiFilter) applyFactoryStatusFilter(b.dataset.kpiFilter);
  if (b.hasAttribute('data-factory-clear-filter')) applyFactoryStatusFilter('all');
});
function factoryFilterLabel(filter) {
  return {
    pending: '全部待部署產品',
    green: '可安排部署',
    yellow: '等待前置',
    red: '異常阻擋',
    gray: '資料不足',
    issues: '異常／資料不足',
    executed: '已完成／部署中',
    active: '正在部署',
    done: '部署驗證完成',
    all: '全部產品狀態'
  }[filter] || '全部產品狀態';
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-clear-deployment-filters]')) {
    state.departments.clear();
    state.query = '';
    state.filter = 'all';
    state.factoryFilter = 'all';
    state.pickerQueries.departments = '';
    render();
  }
  if (!e.target.closest('.clear-picker')) document.querySelectorAll('.clear-picker[open]').forEach(p => p.open = false);
});
