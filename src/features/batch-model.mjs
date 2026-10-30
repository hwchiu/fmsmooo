import { decision, selectionCheck } from './decision-model.mjs';
export function evaluateBatch(model, ids) {
  const selected = new Set([...ids].filter(id => model.by.has(id))),
    check = selectionCheck(model, selected),
    after = decision(model.ctx, new Set([...model.trial, ...selected]));
  const unlocked = [...after.results.values()].filter(r => !selected.has(r.node.id) && r.candidate && !model.results.get(r.node.id).candidate);
  const waves = [],
    remaining = new Set(selected);
  while (remaining.size) {
    const wave = [...remaining].filter(id => ![...model.ancestors(id)].some(up => up !== id && remaining.has(up)));
    if (!wave.length) break;
    waves.push(wave);
    wave.forEach(id => remaining.delete(id));
  }
  return {
    selected,
    check,
    unlocked,
    departments: new Set([...selected].map(id => model.by.get(id).department_id)),
    waves,
    cyclic: [...remaining]
  };
}
export function effectiveWindow(batch, id) {
  return batch.exceptions?.[id] || {
    start: batch.start || '',
    end: batch.end || ''
  };
}
export function validateBatch(batch, model, formal = model) {
  const errors = [],
    evaluation = evaluateBatch(model, batch.selected || []);
  if (!evaluation.selected.size) errors.push('請選擇批次產品');
  if (!batch.name?.trim()) errors.push('請填寫批次名稱');
  for (const id of evaluation.selected) {
    const w = effectiveWindow(batch, id);
    if (!w.start || !w.end) errors.push('每項產品需有共用或例外窗口');else if (w.end < w.start) errors.push('窗口結束時間不可早於開始時間');
  }
  if (batch.resource === 'confirmed' && (!batch.owner?.trim() || !batch.resourceNote?.trim())) errors.push('確認資源需填寫確認人與確認依據');
  if (batch.planRef?.trim()) {
    if (batch.resource !== 'confirmed') errors.push('記錄計畫關聯前需確認資源與窗口');
    if ([...evaluation.selected].some(id => !formal.results.get(id)?.candidate)) errors.push('正式快照前置未全部就緒，不能記錄計畫關聯');
    if (evaluation.check.pairs.length) errors.push('批次內有必要先後順序，請先拆批');
  }
  return [...new Set(errors)];
}
export function migrateBatch(plan) {
  return {
    version: 2,
    id: plan.id || null,
    name: plan.name || '新部署批次',
    factory: plan.factory,
    profile: plan.profile,
    selected: [...(plan.selected || [])],
    start: plan.start || '',
    end: plan.end || '',
    exceptions: plan.exceptions || Object.fromEntries(Object.entries(plan.dates || {}).map(([id, date]) => [id, {
      start: date + 'T09:00',
      end: date + 'T18:00'
    }])),
    resource: plan.resource || 'unreviewed',
    owner: plan.owner || '',
    resourceNote: plan.resourceNote || '',
    planRef: plan.planRef || '',
    trial: plan.trial || [],
    snapshot: plan.snapshot,
    confirmedAt: plan.confirmedAt || null
  };
}
