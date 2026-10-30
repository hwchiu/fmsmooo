import {spawnSync} from 'node:child_process';
import path from 'node:path';
const runtime=process.versions.node.startsWith('22.')?process.execPath:path.resolve('node_modules/node/bin/node');
const r=spawnSync(runtime,['scripts/verify.mjs'],{stdio:'inherit'});process.exit(r.status||0);
