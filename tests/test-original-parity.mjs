import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as oldFactory from '../baseline/dist/factory-model.mjs';
import * as oldDecision from '../baseline/dist/decision-model.mjs';
import * as newFactory from '../src/features/factory-model.mjs';
import * as newDecision from '../src/features/decision-model.mjs';
const bundle=JSON.parse(fs.readFileSync('public/data/factories.json'));
const stable=x=>JSON.stringify(x,(_,v)=>v instanceof Set?[...v]:v instanceof Map?[...v]:v);
let products=0,trials=0;
for(const f of bundle.factories)for(const profile of ['baseline','configured']){
 const before=oldFactory.factoryData(bundle,f.factory_id,{},profile),after=newFactory.factoryData(bundle,f.factory_id,{},profile);
 assert.equal(stable(after),stable(before));
 const a=oldDecision.decision(before),b=newDecision.decision(after);
 assert.equal(stable([...a.results]),stable([...b.results]));products+=a.results.size;
 const cases=[...new Set([...a.nodes.slice(0,3).map(n=>n.id),...a.nodes.filter(n=>/PostgreSQL|Oracle Database|MES Core|Container Registry/.test(n.product_name)).map(n=>n.id)])];
 for(const id of cases){const trial=new Set([id]);assert.equal(stable([...oldDecision.decision(before,trial).results]),stable([...newDecision.decision(after,trial).results]));trials++;}
 assert.equal(stable(oldDecision.selectionCheck(a,new Set(cases))),stable(newDecision.selectionCheck(b,new Set(cases))));
}
console.log(`PASS: original v37 vs migrated model: ${products} full product/profile records, ${trials} whole-factory simulation comparisons, selection verdict parity`);
