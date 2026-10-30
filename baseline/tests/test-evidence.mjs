import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evidenceHierarchy} from './dist/evidence-model.mjs';
import {factoryData} from './dist/factory-model.mjs';
import {decision} from './dist/decision-model.mjs';
const edge=(source,target,id,met=false)=>({source,target,edge_id:id,met});
function model(edges,target){const nodes=[...new Set(edges.flatMap(e=>[e.source,e.target]).concat(target))];const incoming=new Map(nodes.map(x=>[x,edges.filter(e=>e.target===x)]));const ancestors=id=>{const found=new Set([id]),todo=[id];while(todo.length)for(const e of incoming.get(todo.pop()))if(!found.has(e.source)){found.add(e.source);todo.push(e.source)}return found};return {gates:edges,incoming,met:e=>e.met,ancestors,results:new Map([[target,{pending:edges.filter(e=>!e.met)}]])}}
let edges=[edge('A','B','ab'),edge('B','T','bt',true),edge('A','C','ac'),edge('C','T','ct',true),edge('X','T','xt',true),edge('A','B','ab2',true)];
let h=evidenceHierarchy(model(edges,'T'),'T');assert.equal(h.branches(h.root).length,2);assert.equal(h.branches(h.root,false).length,3);assert.equal(h.groups.get('A').references,2);assert(h.groups.get('B').blocked);assert.equal(h.groups.get('B').incoming[0].edges.length,2);assert.equal(h.directProducts,0);
edges=[edge('A','B','ab'),edge('B','A','ba'),edge('B','T','bt')];h=evidenceHierarchy(model(edges,'T'),'T');assert.equal(h.groups.size,2);const cycle=[...h.groups.values()].find(g=>g.cycle);assert.equal(cycle.internal.length,2);assert.equal(h.branches(cycle.id).length,0);assert.equal(h.branches(h.root).length,1);
const bundle=JSON.parse(fs.readFileSync('dist/data/factories.json'));for(const f of bundle.factories)for(const profile of ['baseline','configured']){const m=decision(factoryData(bundle,f.factory_id,{},profile));for(const n of m.nodes){const h=evidenceHierarchy(m,n.id),seen=new Set();for(const g of h.groups.values()){for(const e of g.internal)seen.add(e.edge_id);for(const b of g.incoming)for(const e of b.edges)seen.add(e.edge_id)}assert.deepEqual(seen,new Set(m.results.get(n.id).edges.map(e=>e.edge_id)));assert.equal(h.pending,m.results.get(n.id).pending.length);assert.deepEqual(h.ids,m.ancestors(n.id))}}
console.log('PASS: satisfied bridges retain remote blockers, shared references, multigate preservation, SCC termination, complete gates for every product/factory/profile');
