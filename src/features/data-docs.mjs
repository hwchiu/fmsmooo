import { snapshotRepository } from '../repository';
import { renderRegion, replaceRegion, insertRegion } from "../react/region-api.mjs";
const labels = {
  metadata: '快照與規則',
  catalog: '產品目錄',
  factories: '工廠',
  instances: '部署實例',
  fault_instance_overrides: '異常狀態覆寫',
  baseline_attempts: '正常部署嘗試',
  topology: '拓樸設定',
  dependencies: '依賴關係',
  attempts: '異常部署嘗試',
  scenarios: '異常情境',
  departments: '責任部門',
  schema_version: 'Schema 版本'
};
const notes = {
  product_id: '產品目錄主鍵；實例透過此欄連至 catalog。',
  instance_id: '工廠部署實例識別碼；格式為 factory_id::product_id。',
  factory_id: '工廠識別碼，連至 factories。',
  department_id: '責任部門識別碼，連至 departments。',
  source: '前置產品的 instance_id。',
  target: '使用產品的 instance_id；箭頭方向為 source → target。',
  edge_id: '依賴關係識別碼。',
  temporal_constraint: 'Gate 條件：前置狀態、必須完成的時點與版本。',
  required_version: '必須符合的前置產品版本。',
  predecessor_state: '要求前置達到的里程碑；預設 Ready。',
  required_before: '目標進入此階段前，應滿足前置條件。',
  mandatory: '必要依賴；false 不列入必要 Gate。',
  enabled: '是否啟用；false 不列入必要 Gate。',
  origin: 'catalog_template 為正常拓樸；異常情境另納入注入關係。',
  status: '原始產品狀態，與計算後的前置就緒狀態不同。',
  milestones: '已達成的里程碑；Ready 狀態仍需對應里程碑證據。',
  observed_at: '狀態證據的觀測時間，與快照時間比較判定時效。',
  snapshot_at: '合成資料快照基準時間。',
  status_stale_after_hours: '狀態證據有效時數；目前為 6 小時。',
  waiting_for: '部署嘗試記錄中的等待項目。',
  member_ids: '異常情境涉及的產品目錄 ID。',
  suggested_fix: '情境提供的建議處置，並非已核准的變更。',
  owner_team: '原始合成責任團隊；不等同責任部門。',
  build_stage: '六階段建置分類，不代表完整部署時程。',
  synthetic: '合成資料標記。'
};
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
let section = 'overview',
  collection = 'catalog',
  query = '',
  page = 0,
  bundle,
  schema;
export function initDataDocs(data, open) {
  bundle = data;
  renderRegion(document.querySelector('#dataNav'), `<details><summary title="合成資料"><span aria-hidden="true">▤</span><span class="data-nav-label">合成資料</span></summary><div class="data-tree"><button data-doc-section="overview">資料總覽</button><button data-doc-section="schema">Schema 字典</button><details><summary>原始資料</summary>${Object.entries(labels).map(([k, v]) => `<button data-doc-collection="${k}">${v}</button>`).join('')}</details></div></details>`);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-doc-section],[data-doc-collection]');
    if (b) {
      section = b.dataset.docSection || 'records';
      if (b.dataset.docCollection) collection = b.dataset.docCollection;
      query = '';
      page = 0;
      open();
    }
    if (e.target.closest('[data-doc-prev]')) {
      page = Math.max(0, page - 1);
      renderDataDocs(bundle);
    }
    if (e.target.closest('[data-doc-next]')) {
      page++;
      renderDataDocs(bundle);
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'dataDocSearch') {
      query = e.target.value;
      page = 0;
      renderRecords();
    }
  });
}
function shell() {
  document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-doc-section],[data-doc-collection]').forEach(b => {
    const on = b.dataset.docSection === section || section === 'records' && b.dataset.docCollection === collection;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  document.querySelector('#role').textContent = 'DATA REFERENCE';
  document.querySelector('#title').textContent = '合成資料文件';
  document.querySelector('#subtitle').textContent = '目前網站實際使用的原始快照、資料結構與判定規則。';
  renderRegion(document.querySelector('#workspace'), `<section class="panel data-document" data-no-dept-tag><div class="panelhead"><h2>${section === 'overview' ? '資料總覽' : section === 'schema' ? 'Schema 字典' : labels[collection]}</h2><div class="tools"><a class="doc-download" href="data/factories.json" download="fieldwork-synthetic-data.json">下載完整 JSON</a><a class="doc-download" href="data/schema.json" download="fieldwork-schema.json">下載 Schema</a></div></div><div class="detail" id="dataDocBody"></div></section>`);
}
export async function renderDataDocs(data) {
  bundle = data;
  shell();
  const host = document.querySelector('#dataDocBody');
  if (section === 'overview') {
    renderRegion(host, `<p>Schema 版本：<code>${esc(data.schema_version)}</code> · 基準：${esc(data.metadata.snapshot_at)}</p><div class="notice">此頁展示完整原始資料，不套用上方工廠、情境、候選或假設完成的篩選。三座工廠獨立計算，無跨廠依賴；產品目錄 200 種不等於各廠都有 200 個實例。</div><h3>資料關聯</h3><p>工廠 → 部署實例 ← 產品目錄；實例 → 責任部門。依賴 source／target 皆連至部署實例；部署嘗試與異常覆寫透過 instance_id 連至實例。</p><div class="tablewrap"><table><thead><tr><th>資料集</th><th>筆數</th><th>用途</th></tr></thead><tbody>${Object.entries(labels).map(([k, v]) => `<tr><td><button class="link" data-doc-collection="${k}">${v}</button><br><code>${k}</code></td><td>${Array.isArray(data[k]) ? data[k].length : '1 個物件／值'}</td><td>${purpose(k)}</td></tr>`).join('')}</tbody></table></div><h3>情境與判定規則</h3><ol><li>正常快照：instances + catalog；依賴僅取 origin = catalog_template；使用 baseline_attempts。</li><li>含循環與異常案例：在實例上套用 fault_instance_overrides，納入全部依賴與 attempts。scenarios 是異常案例說明。</li><li>必要 Gate：enabled ≠ false、mandatory ≠ false，且有 temporal_constraint。完成需前置 Ready、證據有效、里程碑與要求版本均符合。</li><li>前置就緒是計算結果：完整必要上游都需符合；未解除循環、失敗或版本異常會阻擋。無時程欄位，因此不推測已安排時程。</li><li>假設完成與循環解除試算不會改寫此處原始 JSON。</li></ol>`);
    return;
  }
  if (section === 'records') {
    renderRegion(host, '<label>搜尋目前資料集<input id="dataDocSearch" placeholder="輸入名稱、ID 或欄位值…" value="' + esc(query) + '"></label><div id="dataDocRecords"></div>');
    renderRecords();
    return;
  }
  renderRegion(host, '<p>讀取 Schema…</p>');
  schema ||= await snapshotRepository.loadSchema();
  if (section !== 'schema') return;
  renderRegion(host, '<p>依目前完整樣本歸納；「必有」表示所有目前樣本都有該欄位，並非正式 API 契約。巢狀物件與陣列另以路徑列出。</p>' + Object.entries(schema.properties).map(([k, v]) => `<details class="schema-group"><summary>${labels[k] || k} <code>${k}</code></summary><div class="tablewrap"><table><thead><tr><th>欄位路徑</th><th>型別</th><th>必有</th><th>說明</th></tr></thead><tbody>${schemaRows(v, k, true)}</tbody></table></div></details>`).join(''));
}
function purpose(k) {
  return {
    catalog: '共用產品定義、分類、團隊與建置階段。',
    instances: '各廠產品版本、狀態與里程碑快照。',
    dependencies: '部署前置及運行依賴；含正常模板與異常注入。',
    fault_instance_overrides: '異常情境的狀態覆寫；並非額外部署實例。',
    baseline_attempts: '正常情境的部署執行記錄。',
    attempts: '含異常情境的部署執行記錄。',
    scenarios: '循環案例、涉及產品及建議突破方式。',
    departments: '八個責任部門與建置階段對照。',
    factories: '工廠範圍、時區與快照基準。',
    metadata: '資料來源、時效門檻與規則版本。',
    topology: '六階段、主幹／平行依賴比例統計。',
    schema_version: '資料快照結構版本。'
  }[k] || '';
}
function schemaRows(s, path, required) {
  if (s.anyOf) return s.anyOf.map(v => schemaRows(v, path, required)).join('');
  let result = `<tr><td><code>${esc(path)}</code></td><td>${esc(s.type || '未限定（空樣本）')}</td><td>${required ? '是' : '否／依樣本'}</td><td>${esc(notes[path.split('.').pop().replace('[]', '')] || '原始快照欄位；值見原始資料。')}</td></tr>`;
  for (const [k, v] of Object.entries(s.properties || {})) result += schemaRows(v, path + '.' + k, (s.required || []).includes(k));
  if (s.items) result += schemaRows(s.items, path + '[]', false);
  return result;
}
function renderRecords() {
  const host = document.querySelector('#dataDocRecords');
  if (!host) return;
  const raw = bundle[collection],
    all = Array.isArray(raw) ? raw : [raw],
    rows = all.map((value, index) => ({
      value,
      index
    })).filter(r => JSON.stringify(r.value).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  page = Math.min(page, pages - 1);
  renderRegion(host, `<div class="doc-pagination"><span>符合 ${rows.length}／${all.length} 筆 · 第 ${page + 1}／${pages} 頁</span><button data-doc-prev ${page ? '' : 'disabled'}>上一頁</button><button data-doc-next ${page + 1 < pages ? '' : 'disabled'}>下一頁</button></div>${rows.slice(page * 20, page * 20 + 20).map(r => `<details class="schema-group"><summary><span>#${r.index + 1}　${esc(r.value?.product_name || r.value?.instance_name || r.value?.factory_name || r.value?.department_name || r.value?.scenario_id || r.value?.edge_id || r.value?.instance_id || collection)}</span></summary><pre>${esc(JSON.stringify(r.value, null, 2))}</pre></details>`).join('') || '<p class="empty">沒有符合的資料</p>'}`);
}
