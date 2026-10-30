import { isGate, satisfied, stale, components, reachable } from './factory-model.mjs';
export const lamps = {
  green: '前置就緒',
  yellow: '等待前置',
  red: '異常阻擋',
  gray: '無法判定'
};
export function decision(ctx, trial = new Set(), gateOverrides = new Map()) {
  const nodes = ctx.nodes.map(n => trial.has(n.id) ? {
      ...n,
      status: 'Ready',
      milestones: [...new Set([...(n.milestones || []), 'Ready'])],
      observed_at: ctx.factory.snapshot_at
    } : n),
    by = new Map(nodes.map(n => [n.id, n])),
    sim = {
      ...ctx,
      nodes
    };
  const gates = ctx.edges.filter(isGate).filter(e => gateOverrides.get(e.edge_id)?.mode !== 'remove'),
    incoming = new Map(nodes.map(n => [n.id, []]));
  for (const e of gates) incoming.get(e.target).push(e);
  const met = e => gateOverrides.get(e.edge_id)?.mode === 'satisfy' || satisfied(e, sim),
    unresolved = gates.filter(e => !met(e)),
    cycles = components(new Set(by.keys()), unresolved),
    cycleIds = new Set(cycles.flat());
  const ancestors = id => {
    const ids = new Set([id]),
      todo = [id];
    while (todo.length) {
      for (const e of incoming.get(todo.pop()) || []) if (!ids.has(e.source)) {
        ids.add(e.source);
        todo.push(e.source);
      }
    }
    return ids;
  };
  const results = new Map();
  for (const n of nodes) {
    const ids = ancestors(n.id),
      edges = gates.filter(e => ids.has(e.source) && ids.has(e.target)),
      pending = edges.filter(e => !met(e));
    const bad = pending.filter(e => ['Failed', 'Paused'].includes(by.get(e.source).status) || !stale(by.get(e.source), sim) && by.get(e.source).status === 'Ready' && e.temporal_constraint.required_version && by.get(e.source).version !== e.temporal_constraint.required_version);
    const unknown = pending.filter(e => stale(by.get(e.source), sim) || by.get(e.source).status === 'Unknown' || by.get(e.source).status === 'Ready' && !(by.get(e.source).milestones || []).includes('Ready'));
    const cyc = cycles.filter(c => c.some(id => ids.has(id))),
      color = cyc.length || bad.length || ['Failed', 'Paused'].includes(n.status) ? 'red' : unknown.length || stale(n, sim) || n.status === 'Unknown' || n.status === 'Ready' && !(n.milestones || []).includes('Ready') ? 'gray' : pending.length ? 'yellow' : 'green';
    const running = ctx.attempts.find(a => a.instance_id === n.id && a.state === 'Running');
    const execution = n.status === 'Ready' && !stale(n, sim) && (n.milestones || []).includes('Ready') ? 'done' : n.status === 'Deploying' && running?.phase !== 'Preflight' ? 'active' : 'pending';
    results.set(n.id, {
      node: n,
      ids,
      edges,
      pending,
      bad,
      unknown,
      cycles: cyc,
      color,
      execution,
      complete: edges.length - pending.length,
      total: edges.length,
      candidate: color === 'green' && execution === 'pending' && !['Unknown', 'Failed', 'Paused'].includes(n.status) && !stale(n, sim)
    });
  }
  const baselineReady = new Set([...results.values()].filter(r => r.candidate).map(r => r.node.id));
  return {
    ctx: sim,
    nodes,
    by,
    gates,
    incoming,
    met,
    ancestors,
    results,
    cycles,
    cycleIds,
    trial,
    baselineReady
  };
}
export function selectionCheck(m, ids) {
  const chosen = [...ids].map(id => m.results.get(id)).filter(Boolean),
    pairs = [];
  for (const a of chosen) for (const b of chosen) if (a !== b && b.ids.has(a.node.id)) pairs.push([a.node.id, b.node.id]);
  return {
    chosen,
    pairs,
    blocked: chosen.filter(r => !r.candidate),
    verdict: !chosen.length ? '請先選取部署候選' : pairs.length ? '存在必要先後順序，請拆分批次' : chosen.some(r => !r.candidate) ? '尚有前置或執行條件未滿足' : '前置允許平行；資源／窗口待確認'
  };
}
export function releases(base) {
  return base.nodes.filter(n => n.status !== 'Ready' || stale(n, base.ctx) || !(n.milestones || []).includes('Ready')).map(n => {
    const after = decision(base.ctx, new Set([...base.trial, n.id]));
    const fresh = [...after.results.values()].filter(r => r.candidate && !base.baselineReady.has(r.node.id) && r.node.id !== n.id);
    const affected = reachable([n.id], base.gates);
    affected.delete(n.id);
    return {
      node: n,
      fresh,
      affected: [...affected],
      after
    };
  }).filter(r => r.affected.length).sort((a, b) => b.fresh.length - a.fresh.length || b.affected.length - a.affected.length);
}
export function condensed(m, ids) {
  const edges = m.gates.filter(e => ids.has(e.source) && ids.has(e.target)),
    cycles = components(ids, edges),
    groups = cycles.map((members, i) => ({
      id: 'scc:' + members.slice().sort().join('|'),
      members,
      cycle: true
    })),
    used = new Set(cycles.flat());
  for (const id of ids) if (!used.has(id)) groups.push({
    id,
    members: [id],
    cycle: false
  });
  const map = new Map(groups.flatMap(g => g.members.map(id => [id, g.id]))),
    adj = new Map(groups.map(g => [g.id, new Set()])),
    rank = new Map(groups.map(g => [g.id, 0]));
  for (const e of edges) if (map.get(e.source) !== map.get(e.target)) adj.get(map.get(e.source)).add(map.get(e.target));
  const memo = new Map();
  const depth = id => {
    if (memo.has(id)) return memo.get(id);
    const d = Math.max(0, ...[...adj.get(id)].map(x => 1 + depth(x)));
    memo.set(id, d);
    return d;
  };
  for (const g of groups) rank.set(g.id, depth(g.id));
  return {
    groups,
    map,
    edges,
    rank
  };
}
