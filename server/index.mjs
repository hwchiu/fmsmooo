import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const defaultRoot=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
export function createApp({root=defaultRoot}={}){
 return http.createServer(async(req,res)=>{
  const respond=(status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body)};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return respond(405,'Method not allowed')}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return respond(400,'Bad request')}
  if(pathname==='/healthz')return respond(200,JSON.stringify({status:'ok'}),'application/json');
  // API boundary is reserved for a separately deployed Go service. No mock writes.
  if(pathname.startsWith('/api/'))return respond(501,JSON.stringify({error:'go_api_not_configured'}),'application/json');
  try{
   const base=await realpath(root),file=await realpath(path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname)));
   if(!file.startsWith(base+path.sep))return respond(403,'Forbidden');
   if(!(await stat(file)).isFile())return respond(404,'Not found');
   respond(200,await readFile(file),types[path.extname(file)]||'application/octet-stream');
  }catch(error){respond(error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,'Not found')}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 createApp().listen(port,host,()=>console.log(`FIELDWORK listening on http://${host}:${port}`));
}
