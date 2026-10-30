import { components, stale } from './factory-model.mjs';
import { downstreamImpact } from './affected-model.mjs';

// Use the complete necessary-gate model, independently of visual grouping.
export function downstreamEvidence(model, target) {
  const sameCycle = new Set(components(new Set(model.by.keys()), model.gates).find(ids => ids.includes(target)) || []);
  sameCycle.delete(target);
  const groups = new Map(),
    counts = {
      direct: 0,
      indirect: 0,
      cycle: 0
    };
  for (const item of downstreamImpact(target, model.gates).values()) {
    const kind = sameCycle.has(item.id) ? 'cycle' : item.direct ? 'direct' : 'indirect',
      node = model.by.get(item.id);
    if (!node) continue;
    counts[kind]++;
    const key = kind + '|' + node.department_id;
    if (!groups.has(key)) groups.set(key, {
      key,
      kind,
      department: node.department_name,
      items: []
    });
    groups.get(key).items.push({
      ...item,
      gates: model.gates.filter(e => e.source === target && e.target === item.id),
      pathGates: item.path.slice(1).map((id, i) => model.gates.filter(e => e.source === item.path[i] && e.target === id))
    });
  }
  for (const group of groups.values()) group.items.sort((a, b) => a.depth - b.depth || model.by.get(a.id).product_name.localeCompare(model.by.get(b.id).product_name));
  return {
    target,
    groups,
    counts,
    total: counts.direct + counts.indirect
  };
}
export function filterDownstream(data, model, filter = 'all') {
  const counts = {
      all: data.total,
      waiting: 0,
      ready: 0
    },
    groups = new Map(),
    visible = {
      direct: 0,
      indirect: 0,
      cycle: 0
    };
  for (const g of data.groups.values()) {
    for (const item of g.items) if (g.kind !== 'cycle') counts[model.results.get(item.id).color === 'green' ? 'ready' : 'waiting']++;
    const items = g.items.filter(item => filter === 'all' || (model.results.get(item.id).color === 'green' ? 'ready' : 'waiting') === filter);
    if (items.length) {
      groups.set(g.key, {
        ...g,
        items,
        total: g.items.length
      });
      visible[g.kind] += items.length;
    }
  }
  return {
    groups,
    counts,
    visible,
    total: visible.direct + visible.indirect
  };
}

// Deduplicate every unmet source across complete ancestry, excluding only the
// viewed product itself. Its unresolved upstream sources must remain visible.
export function otherWaiting(model, product, target) {
  const direct = new Set((model.incoming.get(product) || []).map(e => e.source)),
    sources = new Map();
  for (const gate of model.results.get(product).pending) {
    if (gate.source === target || gate.source === product) continue;
    if (!sources.has(gate.source)) sources.set(gate.source, {
      id: gate.source,
      direct: direct.has(gate.source),
      gates: []
    });
    sources.get(gate.source).gates.push(gate);
  }
  return [...sources.values()].sort((a, b) => Number(b.direct) - Number(a.direct) || model.by.get(a.id).product_name.localeCompare(model.by.get(b.id).product_name));
}
export function gateWaitReasons(model, gate) {
  const n = model.by.get(gate.source),
    reasons = [];
  if (stale(n, model.ctx)) reasons.push('證據過期或觀測時間待確認');
  if (n.status === 'Unknown') reasons.push('狀態未知');
  if (n.status === 'Failed') reasons.push('部署失敗');
  if (n.status === 'Paused') reasons.push('部署暫停');
  if (n.status !== 'Ready' && !['Unknown', 'Failed', 'Paused'].includes(n.status)) reasons.push('尚未部署驗證完成');
  if (gate.temporal_constraint?.required_version && n.version !== gate.temporal_constraint.required_version) reasons.push('版本不符');
  if (n.status === 'Ready' && !(n.milestones || []).includes('Ready')) reasons.push('缺少完成里程碑');
  if (model.cycleIds.has(n.id)) reasons.push('循環阻擋');
  if (!reasons.length) reasons.push('依賴條件尚未滿足');
  return reasons;
}
