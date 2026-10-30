import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(!process.version.startsWith('v22.'))throw Error('Verification must run on Node.js 22');
for(const name of (await readdir('tests')).filter(n=>/^test-.*\.mjs$/.test(n)).sort()){
 const p=spawnSync(process.execPath,['tests/'+name],{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);
}
const baseline=JSON.parse(await readFile('design/frontend-baseline.json','utf8'));
for(const file of ['decision.css','data/factories.json','data/schema.json','vendor/cytoscape.min.js']){
 const current=file==='decision.css'?'src/react/original.css':'public/'+file;
 const actual=createHash('sha256').update(await readFile(current)).digest('hex');
 if(actual!==baseline.files[file])throw Error('Baseline changed: '+file);
}
console.log('PASS: Node 22 verification, original CSS, vendor and data are byte-identical');
