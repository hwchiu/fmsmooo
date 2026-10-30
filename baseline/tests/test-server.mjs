import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApp} from './server/index.mjs';
const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try{
 for(const file of ['index.html','decision.js','decision.css','data/factories.json','data/schema.json','vendor/cytoscape.min.js']){
  const response=await fetch(base+'/'+file);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile('dist/'+file));
 }
 assert.equal((await fetch(base+'/decision-model.mjs')).headers.get('content-type'),'text/javascript; charset=utf-8');
 assert.equal((await fetch(base+'/missing')).status,404);
 assert.equal((await fetch(base+'/api/v1/factories')).status,501);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
 assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
 assert.equal((await fetch(base+'/healthz')).status,200);
 console.log('PASS: Node server asset parity, MIME, HEAD, errors, API boundary and traversal');
}finally{await new Promise(r=>server.close(r))}
