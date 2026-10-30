export const isGate = e => e.enabled !== false && e.mandatory !== false && e.temporal_constraint != null;
export function factoryData(bundle, factoryId, overrides = {}, profile = 'configured') {
  const factory = bundle.factories.find(f => f.factory_id === factoryId);
  if (!factory) throw Error('Unknown factory');
  const faults = new Map((profile === 'baseline' ? [] : bundle.fault_instance_overrides || []).map(n => [n.instance_id, n]));
  const catalog = new Map(bundle.catalog.map(p => [p.product_id, p]));
  const nodes = bundle.instances.filter(p => p.factory_id === factoryId).map(i => {
    const o = overrides[i.instance_id] || {};
    return {
      ...catalog.get(i.product_id),
      ...i,
      ...faults.get(i.instance_id),
      ...o,
      catalog_id: i.product_id,
      product_id: i.instance_id,
      id: i.instance_id
    };
  });
  const ids = new Set(nodes.map(p => p.id));
  const edges = bundle.dependencies.filter(e => e.factory_id === factoryId && (profile === 'baseline' ? e.origin === 'catalog_template' : profile.startsWith('scenario:') ? e.origin === 'catalog_template' || e.scenario_id === profile.slice(9) : true)).map(e => ({
    ...e
  }));
  for (const e of edges) if (!ids.has(e.source) || !ids.has(e.target)) throw Error('工廠依賴端點不完整或跨工廠');
  const attempts = (profile === 'baseline' ? bundle.baseline_attempts || [] : bundle.attempts).filter(a => a.factory_id === factoryId).map(a => ({
    ...a,
    ...(overrides[a.instance_id]?.attempt || {})
  }));
  for (const n of nodes) if (overrides[n.id]?.attempt && !attempts.some(a => a.instance_id === n.id)) attempts.push(overrides[n.id].attempt);
  return {
    factory,
    nodes,
    edges,
    attempts,
    metadata: bundle.metadata,
    topology: bundle.topology,
    departments: bundle.departments,
    profile,
    scenarios: bundle.scenarios
  };
}
export function stale(p, ctx) {
  const t = Date.parse(p.observed_at);
  return !Number.isFinite(t) || t > Date.parse(ctx.factory.snapshot_at) || Date.parse(ctx.factory.snapshot_at) - t > ctx.metadata.status_stale_after_hours * 3600000;
}
export function satisfied(edge, ctx) {
  const p = ctx.nodes.find(n => n.id === edge.source);
  if (!isGate(edge)) return null;
  const c = edge.temporal_constraint;
  return !!p && p.status === 'Ready' && !stale(p, ctx) && (p.milestones || []).includes(c.predecessor_state || 'Ready') && (!c.required_version || p.version === c.required_version);
}
export function components(ids, edges) {
  const adj = new Map([...ids].map(i => [i, new Set()]));
  for (const e of edges) if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source).add(e.target);
  let num = 0;
  const idx = new Map(),
    low = new Map(),
    stack = [],
    on = new Set(),
    out = [];
  function visit(v) {
    idx.set(v, num);
    low.set(v, num++);
    stack.push(v);
    on.add(v);
    for (const w of [...adj.get(v)].sort()) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        c.push(w);
      } while (w !== v);
      if (c.length > 1 || adj.get(v).has(v)) out.push(c.sort());
    }
  }
  for (const v of [...ids].sort()) if (!idx.has(v)) visit(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
export function reachable(starts, edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }
  const seen = new Set(starts),
    todo = [...starts];
  while (todo.length) for (const b of adj.get(todo.pop()) || []) if (!seen.has(b)) {
    seen.add(b);
    todo.push(b);
  }
  return seen;
}
export function witness(members, edges) {
  const set = new Set(members),
    rev = new Map(members.map(i => [i, new Set()]));
  for (const e of edges) if (set.has(e.source) && set.has(e.target)) rev.get(e.target).add(e.source);
  let best = null;
  for (const start of members) for (const next of rev.get(start)) {
    const q = [[next, [start, next]]],
      seen = new Set([next]);
    if (next === start) return [start, start];
    while (q.length) {
      const [a, path] = q.shift();
      for (const b of rev.get(a)) {
        if (b === start) {
          const w = [...path, b];
          if (!best || w.length < best.length) best = w;
          q.length = 0;
          break;
        }
        if (!seen.has(b)) {
          seen.add(b);
          q.push([b, [...path, b]]);
        }
      }
    }
  }
  return best || [];
}
function cycleTypes(members, edges) {
  const set = new Set(members),
    pairs = new Set(edges.filter(e => set.has(e.source) && set.has(e.target)).map(e => e.source + '|' + e.target)),
    types = [];
  if (members.some(a => pairs.has(a + '|' + a))) types.push('self');
  if (members.some(a => members.some(b => a !== b && pairs.has(a + '|' + b) && pairs.has(b + '|' + a)))) types.push('two');
  if (members.some(a => members.some(b => a !== b && pairs.has(a + '|' + b) && members.some(c => c !== a && c !== b && pairs.has(b + '|' + c) && pairs.has(c + '|' + a))))) types.push('three');
  if (members.length >= 4) types.push('multi');
  return types;
}
export function analyzeFactory(ctx, disabled = new Set()) {
  const nodes = new Map(ctx.nodes.map(n => [n.id, n])),
    ids = new Set(nodes.keys()),
    edges = ctx.edges.filter(e => e.enabled !== false && !disabled.has(e.edge_id)),
    gates = edges.filter(isGate);
  const activeAttempts = new Map(ctx.attempts.map(a => [a.instance_id, a]));
  const usableReady = n => n.status === 'Ready' && !stale(n, ctx) && (n.milestones || []).includes('Ready') && (!(activeAttempts.get(n.id)?.state === 'Running') || activeAttempts.get(n.id).target_version === n.version);
  const unresolved = gates.filter(e => !usableReady(nodes.get(e.target)) && !satisfied(e, ctx));
  const configured = components(ids, gates),
    pending = components(ids, unresolved),
    pendingCore = new Set(pending.flat());
  const attempts = new Map(ctx.attempts.map(a => [a.instance_id, a]));
  const observed = unresolved.filter(e => {
    const a = attempts.get(e.target);
    const w = a?.waiting_for?.find(w => w.dependency_id === e.edge_id && w.prerequisite_instance_id === e.source);
    return a?.state === 'Running' && a.target_version && w && Number.isFinite(Date.parse(w.observed_at)) && Date.parse(ctx.factory.snapshot_at) - Date.parse(w.observed_at) <= ctx.metadata.status_stale_after_hours * 3600000 && Date.parse(w.observed_at) <= Date.parse(ctx.factory.snapshot_at) && Date.parse(w.wait_started_at) <= Date.parse(w.observed_at);
  });
  const observedCore = new Set(components(ids, observed).flat());
  const issues = [];
  const configCore = new Set(configured.flat());
  for (const members of configured) {
    const set = new Set(members),
      internal = gates.filter(e => set.has(e.source) && set.has(e.target)),
      unknown = members.some(i => stale(nodes.get(i), ctx) || ['Unknown', 'Failed', 'Paused'].includes(nodes.get(i).status) || nodes.get(i).status === 'Ready' && !(nodes.get(i).milestones || []).includes('Ready'));
    const remaining = members.some(i => pendingCore.has(i));
    const current = members.some(i => observedCore.has(i));
    const classification = unknown ? 'unknown' : !remaining ? 'resolved' : current ? 'current' : 'potential';
    const affected = remaining ? reachable(members.filter(i => pendingCore.has(i)), unresolved) : new Set();
    const downstream = [...affected].filter(i => !set.has(i));
    const high = members.some(i => nodes.get(i).criticality.business === 'High');
    let priority, risk, reason;
    if (classification === 'unknown') {
      priority = 'Review';
      risk = 'Unknown';
      reason = '狀態缺失、過期、失敗或暫停；不能確認目前封閉等待。';
    } else if (classification === 'resolved') {
      priority = 'P2';
      risk = 'Medium';
      reason = '目前未滿足等待已解除；設定循環仍需整理，重部署時可能再發生。';
    } else if (affected.size >= 100) {
      priority = 'P0';
      risk = 'Critical';
      reason = '必要 gate 循環，去重後受阻風險達 100 個實例。';
    } else if (affected.size >= 20 || high) {
      priority = 'P1';
      risk = 'High';
      reason = high ? '核心包含 Business Criticality = High。' : '受阻風險為 20–99 個實例。';
    } else {
      priority = 'P2';
      risk = 'Medium';
      reason = '必要 gate 循環，受阻風險為 1–19 個實例。';
    }
    const tags = [...new Set(internal.map(e => e.scenario_id).filter(Boolean))];
    const hint = ctx.scenarios.find(s => tags.includes(s.scenario_id));
    issues.push({
      id: 'cycle:' + members.join('|'),
      members,
      internal,
      types: cycleTypes(members, internal),
      classification,
      priority,
      risk,
      reason,
      tags,
      crossLayer: new Set(members.map(i => nodes.get(i).layer)).size > 1,
      shared: members.some(i => nodes.get(i).shared_service),
      affected: [...affected],
      downstream,
      witness: witness(members, classification === 'current' ? observed : internal),
      fix: hint?.suggested_fix || '拆分部署 readiness 與整合驗收，審查必要 gate。',
      description: hint?.description || '必要部署 gate 形成封閉循環。'
    });
  }
  // Supplementary service SCCs are separate only if they do not already contain a hard cycle.
  for (const members of components(ids, edges)) {
    if (members.some(i => configCore.has(i))) continue;
    const set = new Set(members),
      internal = edges.filter(e => set.has(e.source) && set.has(e.target)),
      mixed = internal.some(isGate);
    issues.push({
      id: 'service:' + members.join('|'),
      members,
      internal,
      types: cycleTypes(members, internal),
      classification: mixed ? 'mixed' : 'nonblocking',
      priority: mixed ? 'Review' : 'P3',
      risk: mixed ? 'Unknown' : 'Low',
      reason: mixed ? '封閉路徑混合必要 gate 與非阻擋服務，部署等待圖本身無循環。' : '僅服務關係循環，沒有必要部署 gate 封閉等待；不代表服務無業務風險。',
      tags: [...new Set(internal.map(e => e.scenario_id).filter(Boolean))],
      crossLayer: new Set(members.map(i => nodes.get(i).layer)).size > 1,
      shared: members.some(i => nodes.get(i).shared_service),
      affected: [],
      downstream: [],
      witness: witness(members, internal),
      fix: '確認非阻擋關係維持 optional／非啟動 gate，不將服務互通誤設為部署前置。',
      description: '服務循環對照案例。'
    });
  }
  const order = {
    P0: 0,
    P1: 1,
    Review: 2,
    P2: 3,
    P3: 4
  };
  issues.sort((a, b) => order[a.priority] - order[b.priority] || b.affected.length - a.affected.length || a.id.localeCompare(b.id));
  const blocked = reachable(pendingCore, unresolved);
  return {
    issues,
    gates,
    unresolved,
    observed,
    configuredCount: configured.length,
    coreIds: [...pendingCore],
    blockedIds: [...blocked],
    downstreamIds: [...blocked].filter(i => !pendingCore.has(i)),
    unknownCount: ctx.nodes.filter(n => n.status === 'Unknown' || stale(n, ctx)).length,
    counts: Object.fromEntries(['current', 'potential', 'resolved', 'unknown', 'mixed', 'nonblocking'].map(c => [c, issues.filter(i => i.classification === c).length]))
  };
}
export function filterIssues(issues, nodes, filter = {}) {
  const by = new Map(nodes.map(n => [n.id, n]));
  const q = (filter.query || '').toLowerCase();
  return issues.filter(i => (!filter.priority || i.priority === filter.priority) && (!filter.classification || i.classification === filter.classification) && (!filter.type || i.types.includes(filter.type)) && (!filter.layer || (filter.layerMode === 'only' ? i.members.every(id => by.get(id).layer === filter.layer) : i.members.some(id => by.get(id).layer === filter.layer))) && (!filter.tag || (filter.tag === 'cross' ? i.crossLayer : i.shared)) && (!q || [i.id, ...i.tags, ...i.members.flatMap(id => [by.get(id).product_name, id])].join(' ').toLowerCase().includes(q)));
}
