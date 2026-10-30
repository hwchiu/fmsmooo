import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const runtime=process.versions.node.startsWith('22.')?process.execPath:path.resolve('node_modules/node/bin/node');
function run(args){const result=spawnSync(runtime,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1)}
run(['scripts/check-runtime.mjs']);
run(['node_modules/typescript/bin/tsc','--noEmit']);
run(['node_modules/vite/bin/vite.js','build']);
const version=spawnSync(runtime,['--version'],{encoding:'utf8'}).stdout.trim();
writeFileSync('design/build-verification.json',JSON.stringify({runtime:version,react:'19.2.0',vite:'6.4.1',typescript:'5.9.3',baselineVersion:37,staticOutput:'dist',goBackendImplemented:false},null,2)+'\n');
