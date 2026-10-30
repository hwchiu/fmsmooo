import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createApp} from '../server/index.mjs';
const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
try{
 const html=await (await fetch(base+'/')).text();assert(html.includes('/assets/'));
 const assets=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
 for(const asset of [...assets,'/data/factories.json','/data/schema.json']){const response=await fetch(base+asset);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await fs.readFile('dist/'+asset.slice(1)));}
 assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);assert.equal((await fetch(base+'/missing')).status,404);assert.equal((await fetch(base+'/api/v1/snapshot')).status,501);assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
 console.log('PASS: production React HTML, asset bytes, JSON, HTTP methods, API boundary and traversal isolation');
}finally{await new Promise(r=>server.close(r))}
