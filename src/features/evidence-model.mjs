import { condensed } from './decision-model.mjs';
// The tree is a projection of a DAG. Keep gates distinct; collapse SCCs first.
export function evidenceHierarchy(m, target) {
  const ids = m.ancestors(target),
    g = condensed(m, ids),
    groups = new Map(g.groups.map(x => [x.id, {
      ...x,
      incoming: [],
      internal: [],
      references: 0
    }]));
  for (const e of g.edges) {
    const source = g.map.get(e.source),
      consumer = g.map.get(e.target);
    if (source === consumer) {
      groups.get(source).internal.push(e);
      continue;
    }
    const parent = groups.get(consumer);
    let branch = parent.incoming.find(x => x.source === source);
    if (!branch) {
      branch = {
        source,
        edges: []
      };
      parent.incoming.push(branch);
      groups.get(source).references++;
    }
    branch.edges.push(e);
  }
  const memo = new Map();
  const blocked = id => {
    if (memo.has(id)) return memo.get(id);
    const group = groups.get(id);
    const value = group.internal.some(e => !m.met(e)) || group.incoming.some(b => b.edges.some(e => !m.met(e)) || blocked(b.source));
    memo.set(id, value);
    return value;
  };
  for (const group of groups.values()) group.blocked = blocked(group.id);
  const root = g.map.get(target),
    direct = m.incoming.get(target) || [];
  return {
    target,
    root,
    ids,
    groups,
    directProducts: new Set(direct.filter(e => !m.met(e)).map(e => e.source)).size,
    pending: m.results.get(target).pending.length,
    branches: (id, onlyBlocked = true) => groups.get(id).incoming.filter(b => !onlyBlocked || b.edges.some(e => !m.met(e)) || groups.get(b.source).blocked)
  };
}
