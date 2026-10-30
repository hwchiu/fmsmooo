import assert from 'node:assert/strict';
import fs from 'node:fs';
import {factoryData,reachable,components} from './dist/factory-model.mjs';
import {decision} from './dist/decision-model.mjs';
import {downstreamEvidence} from './dist/downstream-evidence.mjs';
const bundle=JSON.parse(fs.readFileSync('dist/data/factories.json'));
let checked=0;
for(const factory of bundle.factories)for(const profile of ['baseline','configured']){
 const m=decision(factoryData(bundle,factory.factory_id,{},profile));
 for(const n of m.nodes){
  const d=downstreamEvidence(m,n.id),items=[...d.groups.values()].flatMap(g=>g.items),expected=reachable([n.id],m.gates);expected.delete(n.id);
  assert.deepEqual(new Set(items.map(x=>x.id)),expected);assert.equal(items.length,expected.size);
  const cycle=new Set(components(new Set(m.by.keys()),m.gates).find(c=>c.includes(n.id))||[]);cycle.delete(n.id);
  assert.equal(d.counts.cycle,cycle.size);assert.equal(d.total+d.counts.cycle,expected.size);
  for(const g of d.groups.values())for(const item of g.items){
   assert.equal(item.path[0],n.id);assert.equal(item.path.at(-1),item.id);assert.equal(new Set(item.path).size,item.path.length);
   assert.equal(g.kind,cycle.has(item.id)?'cycle':m.gates.some(e=>e.source===n.id&&e.target===item.id)?'direct':'indirect');
   assert.equal(item.pathGates.length,item.depth);assert(item.pathGates.every(es=>es.length>0));assert(item.gates.every(e=>e.source===n.id&&e.target===item.id));
  }
  checked++;
 }
}
const ctx=factoryData(bundle,'TNN',{},'baseline'),base=decision(ctx),target=base.nodes.find(n=>n.product_name==='Shared PostgreSQL Database').id,trial=decision(ctx,new Set([target]));
assert.deepEqual(downstreamEvidence(base,target).counts,downstreamEvidence(trial,target).counts);
assert([...downstreamEvidence(trial,target).groups.values()].flatMap(g=>g.items).filter(x=>x.direct).some(x=>x.gates.every(e=>trial.met(e))));
console.log(`PASS: ${checked} product/profile downstream sets, cycle separation, deduplication, shortest paths, condition provenance and simulation`);

// Filter partitions are based on complete prerequisite verdict, never execution.
const {filterDownstream,otherWaiting,gateWaitReasons}=await import('./dist/downstream-evidence.mjs');
for(const factory of bundle.factories)for(const profile of ['baseline','configured']){
 const m=decision(factoryData(bundle,factory.factory_id,{},profile));
 for(const n of m.nodes){
  const data=downstreamEvidence(m,n.id),all=filterDownstream(data,m),ready=filterDownstream(data,m,'ready'),waiting=filterDownstream(data,m,'waiting');
  assert.equal(ready.total+waiting.total,all.total);assert.equal(all.counts.all,all.counts.ready+all.counts.waiting);
  for(const [f,v]of [['ready',ready],['waiting',waiting]])for(const g of v.groups.values())for(const item of g.items)assert.equal(m.results.get(item.id).color==='green',f==='ready');
  for(const g of data.groups.values())for(const item of g.items){
   const others=otherWaiting(m,item.id,n.id),expected=new Set(m.results.get(item.id).pending.filter(e=>e.source!==n.id&&e.source!==item.id).map(e=>e.source));
   assert.deepEqual(new Set(others.map(x=>x.id)),expected);assert.equal(others.length,expected.size);
   assert(others.every(x=>x.gates.length&&x.gates.every(e=>!m.met(e))));
  }
 }
}
// An unmet ancestor of the viewed target remains an "other" prerequisite.
const chainTarget=base.nodes.find(n=>n.product_name==='Container Registry').id;
const chainItem=[...downstreamEvidence(base,chainTarget).groups.values()].flatMap(g=>g.items).find(x=>base.results.get(x.id).pending.some(e=>e.source!==chainTarget));
assert(chainItem);const waitingSources=otherWaiting(base,chainItem.id,chainTarget);assert(waitingSources.length);assert(!waitingSources.some(x=>x.id===chainTarget));
assert(base.results.get(chainItem.id).pending.filter(e=>e.source!==chainTarget&&e.source!==chainItem.id).every(e=>waitingSources.some(x=>x.id===e.source)));
for(const e of base.gates.filter(e=>!base.met(e)))assert(gateWaitReasons(base,e).length);
console.log('PASS: full readiness partitions, filtered counts, source deduplication, exclusion of target without losing upstream blockers, wait reasons');
