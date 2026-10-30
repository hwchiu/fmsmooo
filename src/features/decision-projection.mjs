import { components, reachable } from './factory-model.mjs';
// Analysis always uses model; this module only projects a reversible display graph.
export function projectDecision(model, target, {
  expanded = new Set(),
  full = false,
  cycleMembers = []
} = {}) {
  const focus = new Set(cycleMembers.length ? cycleMembers : [target]);
  const up = new Set(),
    down = reachable([...focus], model.gates);
  for (const id of focus) for (const a of model.ancestors(id)) up.add(a);
  const ids = new Set([...up, ...down]);
  const edges = model.gates.filter(e => ids.has(e.source) && ids.has(e.target)),
    scc = components(ids, edges),
    used = new Set(scc.flat()),
    componentsList = [...scc.map(members => ({
      key: 'scc:' + members.slice().sort().join('|'),
      members,
      cycle: true
    })), ...[...ids].filter(id => !used.has(id)).map(id => ({
      key: id,
      members: [id],
      cycle: false
    }))];
  const componentOf = new Map(componentsList.flatMap(c => c.members.map(id => [id, c.key]))),
    byComponent = new Map(componentsList.map(c => [c.key, c])),
    incoming = new Map(componentsList.map(c => [c.key, new Set()])),
    outgoing = new Map(componentsList.map(c => [c.key, new Set()]));
  for (const e of edges) {
    const a = componentOf.get(e.source),
      b = componentOf.get(e.target);
    if (a !== b) {
      incoming.get(b).add(a);
      outgoing.get(a).add(b);
    }
  }
  const ranks = new Map();
  function rank(key) {
    if (ranks.has(key)) return ranks.get(key);
    const value = Math.max(0, ...[...incoming.get(key)].map(p => rank(p) + 1));
    ranks.set(key, value);
    return value;
  }
  componentsList.forEach(c => rank(c.key));
  const distance = new Map([...focus].map(id => [componentOf.get(id), 0])),
    queue = [...distance.keys()];
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    for (const n of [...incoming.get(key), ...outgoing.get(key)]) if (!distance.has(n)) {
      distance.set(n, distance.get(key) + 1);
      queue.push(n);
    }
  }
  const protectedIds = new Set(focus);
  for (const e of edges) if (focus.has(e.target) && !model.met(e)) protectedIds.add(e.source);
  const buckets = new Map();
  for (const c of componentsList) {
    const isFocus = c.members.some(id => focus.has(id)),
      protect = c.members.some(id => protectedIds.has(id)),
      dept = model.by.get(c.members[0]).department_id,
      side = c.members.some(id => up.has(id)) ? 'up' : 'down';
    // Only structurally equivalent remote siblings are grouped: avoids inventing paths/cycles.
    const signature = [side, dept, rank(c.key), [...incoming.get(c.key)].sort().join(','), [...outgoing.get(c.key)].sort().join(',')].join('~');
    const terminalDownstream = side === 'down' && !c.cycle && !protect && outgoing.get(c.key).size === 0;
    const key = full || protect || c.cycle ? 'single:' + c.key : terminalDownstream ? 'downstream-leaves:' + dept : (distance.get(c.key) || 0) <= 1 ? 'single:' + c.key : 'siblings:' + signature;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }

  // A satisfied root-closed upstream region has no external incoming edge. Collapsing it
  // cannot create a new path between visible products; its original gates remain traceable.
  if (!full) {
    const region = new Set(componentsList.filter(c => !c.cycle && (distance.get(c.key) || 0) > 1 && c.members.every(id => up.has(id) && !protectedIds.has(id) && model.results.get(id).color === 'green' && model.results.get(id).execution === 'done' && edges.filter(e => e.source === id).every(e => model.met(e)))).map(c => c.key));
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of [...region]) if ([...incoming.get(key)].some(parent => !region.has(parent))) {
        region.delete(key);
        changed = true;
      }
    }
    if (region.size > 2) {
      const cs = [...region].map(key => byComponent.get(key));
      for (const [key, items] of [...buckets]) {
        const rest = items.filter(c => !region.has(c.key));
        if (rest.length) buckets.set(key, rest);else buckets.delete(key);
      }
      buckets.set('satisfied-roots:' + cs.map(c => c.key).sort().join('|'), cs);
    }
  }
  // Contract remote, unbranched same-department chains; a chain has exactly one entrance/exit.
  const eligible = new Set(componentsList.filter(c => !c.cycle && !c.members.some(id => protectedIds.has(id)) && (distance.get(c.key) || 0) > 1).map(c => c.key)),
    bucketFor = new Map([...buckets].flatMap(([k, cs]) => cs.map(c => [c.key, k]))),
    consumed = new Set();
  for (const c of componentsList) {
    if (!eligible.has(c.key) || consumed.has(c.key) || (buckets.get(bucketFor.get(c.key)) || []).length !== 1) continue;
    const chain = [c];
    let current = c;
    while (outgoing.get(current.key).size === 1) {
      const nextKey = [...outgoing.get(current.key)][0],
        next = byComponent.get(nextKey);
      if (!eligible.has(nextKey) || consumed.has(nextKey) || incoming.get(nextKey).size !== 1 || (buckets.get(bucketFor.get(nextKey)) || []).length !== 1 || model.by.get(next.members[0]).department_id !== model.by.get(c.members[0]).department_id || up.has(next.members[0]) !== up.has(c.members[0])) break;
      chain.push(next);
      current = next;
    }
    if (chain.length > 1) {
      for (const item of chain) {
        buckets.delete(bucketFor.get(item.key));
        consumed.add(item.key);
      }
      buckets.set('chain:' + chain.map(c => c.key).join('|'), chain);
    }
  }
  const nodes = [],
    map = new Map();
  for (const [key, cs] of buckets) {
    const members = cs.flatMap(c => c.members),
      selectedCycle = cs.some(c => c.cycle && c.members.some(id => focus.has(id))),
      canGroup = !full && !selectedCycle && (members.length > 1 || cs[0].cycle);
    const exposed = new Set();
    if (expanded instanceof Map) {
      const levels = expanded.get(key) || 0;
      if (levels === Infinity || cs.some(c => c.cycle) && levels) members.forEach(id => exposed.add(id));else for (let level = 0; level < levels; level++) {
        const remaining = new Set(members.filter(id => !exposed.has(id))),
          boundary = [...remaining].filter(id => !edges.some(e => e.source === id && remaining.has(e.target)));
        if (!boundary.length) break;
        boundary.forEach(id => exposed.add(id));
      }
    } else if (expanded.has(key)) members.forEach(id => exposed.add(id));
    const residual = members.filter(id => !exposed.has(id));
    if (canGroup && residual.length > 1 || canGroup && cs[0].cycle && residual.length) {
      const node = {
        id: 'group:' + key,
        key,
        members: residual,
        group: true,
        satisfiedRegion: key.startsWith('satisfied-roots:'),
        chain: key.startsWith('chain:'),
        cycle: cs.some(c => c.cycle),
        rank: rank(cs[0].key),
        side: residual.some(id => up.has(id)) ? 'up' : 'down',
        blocked: residual.filter(id => model.results.get(id).color !== 'green').length
      };
      nodes.push(node);
      residual.forEach(id => map.set(id, node.id));
    } else residual.forEach(id => exposed.add(id));
    for (const id of members.filter(id => exposed.has(id))) {
      const node = {
        id: 'product:' + id,
        members: [id],
        product: id,
        rank: rank(componentOf.get(id)),
        focus: focus.has(id),
        cycle: cs.some(c => c.cycle)
      };
      nodes.push(node);
      map.set(id, node.id);
    }
  }
  const links = new Map(),
    internal = [];
  for (const e of edges) {
    const source = map.get(e.source),
      targetId = map.get(e.target);
    if (source === targetId) {
      internal.push(e);
      continue;
    }
    const key = source + '→' + targetId;
    if (!links.has(key)) links.set(key, {
      id: 'link:' + key,
      source,
      target: targetId,
      gates: [],
      pending: 0
    });
    const link = links.get(key);
    link.gates.push(e);
    if (!model.met(e)) link.pending++;
  }
  const projectedEdges = [...links.values()],
    projectionCycles = components(new Set(nodes.map(n => n.id)), projectedEdges),
    owner = new Map(nodes.map(n => [n.id, n.id]));
  for (const cycle of projectionCycles) for (const id of cycle) owner.set(id, 'display-scc:' + cycle.join('|'));
  const parents = new Map([...owner.values()].map(id => [id, new Set()]));
  for (const e of projectedEdges) if (owner.get(e.source) !== owner.get(e.target)) parents.get(owner.get(e.target)).add(owner.get(e.source));
  const displayRanks = new Map();
  function displayRank(id) {
    if (displayRanks.has(id)) return displayRanks.get(id);
    const result = Math.max(0, ...[...parents.get(id)].map(p => displayRank(p) + 1));
    displayRanks.set(id, result);
    return result;
  }
  for (const n of nodes) n.rank = displayRank(owner.get(n.id));
  return {
    nodes,
    edges: projectedEdges,
    internal,
    ids,
    focus,
    up,
    down,
    map,
    protectedIds,
    rawEdges: edges
  };
}
