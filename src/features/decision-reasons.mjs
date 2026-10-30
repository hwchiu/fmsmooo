import { stale } from './factory-model.mjs';
import { lamps } from './decision-model.mjs';
const definitions = [['self-failed', '自身部署失敗', '自身失敗', 'red', 'R01：產品自身狀態為 Failed。'], ['self-paused', '自身部署暫停', '自身暫停', 'red', 'R02：產品自身狀態為 Paused。'], ['own-cycle', '本產品所在循環尚未解除', '本環未解', 'red', 'R03：尚未滿足的必要條件形成循環，且包含本產品。'], ['up-cycle', '其他上游循環尚未解除', '上游循環', 'red', 'R04：完整必要上游中仍有未滿足條件形成的循環。'], ['pre-failed', '前置產品部署失敗', '前置失敗', 'red', 'R05：未滿足必要條件的來源狀態為 Failed。'], ['pre-paused', '前置產品部署暫停', '前置暫停', 'red', 'R06：未滿足必要條件的來源狀態為 Paused。'], ['version', '完成證據的版本不符', '版本不符', 'red', 'R07：來源已 Ready、觀測有效，但版本與必要條件要求不同。'], ['stale', '觀測證據過期或時間異常', '證據待確認', 'gray', 'R08：產品自身或等待前置的觀測時間缺漏、超前快照或超過有效期限。'], ['unknown', '產品狀態未知', '狀態未知', 'gray', 'R09：產品自身或等待前置的狀態為 Unknown。'], ['milestone', '缺少完成里程碑', '里程碑缺漏', 'gray', 'R10：產品已標記 Ready，卻沒有 Ready 完成里程碑。'], ['waiting', '其他必要前置尚未完成', '前置未完', 'yellow', 'R11：仍有未滿足的必要條件；一般等待不等於異常阻擋。']];
export function decisionReasons(m, id) {
  const r = m.results.get(id),
    n = m.by.get(id),
    entries = new Map();
  const add = (code, ids, gates = []) => {
    if (!entries.has(code)) entries.set(code, new Map());
    const key = ids.slice().sort().join('|'),
      by = entries.get(code);
    if (!by.has(key)) by.set(key, {
      ids,
      gates: []
    });
    const item = by.get(key);
    for (const e of gates) if (!item.gates.some(x => x.edge_id === e.edge_id)) item.gates.push(e);
  };
  if (n.status === 'Failed') add('self-failed', [id]);
  if (n.status === 'Paused') add('self-paused', [id]);
  const cycleEdges = new Set();
  for (const cycle of r.cycles) {
    const set = new Set(cycle),
      gates = r.pending.filter(e => set.has(e.source) && set.has(e.target));
    gates.forEach(e => cycleEdges.add(e.edge_id));
    add(cycle.includes(id) ? 'own-cycle' : 'up-cycle', cycle, gates);
  }
  for (const e of r.bad) {
    const source = m.by.get(e.source);
    if (source.status === 'Failed') add('pre-failed', [e.source], [e]);else if (source.status === 'Paused') add('pre-paused', [e.source], [e]);else add('version', [e.source], [e]);
  }
  const inspect = (node, gates) => {
    if (stale(node, m.ctx)) add('stale', [node.id], gates);
    if (node.status === 'Unknown') add('unknown', [node.id], gates);
    if (node.status === 'Ready' && !(node.milestones || []).includes('Ready')) add('milestone', [node.id], gates);
  };
  inspect(n, []);
  for (const e of r.unknown) inspect(m.by.get(e.source), [e]);
  const special = new Set([...r.bad, ...r.unknown].map(e => e.edge_id));
  for (const e of r.pending) if (!special.has(e.edge_id) && !cycleEdges.has(e.edge_id)) add('waiting', [e.source], [e]);
  return definitions.filter(([code]) => entries.has(code)).map(([code, label, short, severity, rule]) => ({
    code,
    label,
    short,
    severity,
    rule,
    entries: [...entries.get(code).values()],
    gateCount: new Set([...entries.get(code).values()].flatMap(x => x.gates.map(e => e.edge_id))).size
  }));
}
export function reasonNodeLabel(m, id) {
  const r = m.results.get(id),
    reasons = decisionReasons(m, id);
  if (['red', 'gray'].includes(r.color) && reasons.length) return lamps[r.color] + ' · ' + reasons[0].short + (reasons.length > 1 ? ' ＋' + (reasons.length - 1) + '類' : '');
  if (r.color === 'yellow') return lamps[r.color] + ' · ' + new Set(r.pending.map(e => e.source)).size + ' 項產品';
  return lamps[r.color];
}
export function reasonSummary(m, id) {
  return decisionReasons(m, id).map(r => r.short + ' ' + r.entries.length + (r.code.includes('cycle') ? ' 組' : ' 項')).join('、') || '所有必要前置已滿足';
}
