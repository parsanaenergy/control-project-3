import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {freshState,applyCommand} from './public/dashboard/operations.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const source=JSON.parse(await fs.readFile(path.join(publicRoot,'dashboard/data.json'),'utf8'));
const bind=process.env.RAMNOOR_HOST||'127.0.0.1',port=Number(process.env.PORT||8080);
const user=process.env.RAMNOOR_AUTH_USER||'',password=process.env.RAMNOOR_AUTH_PASSWORD||'';
if((user&&!password)||(!user&&password))throw new Error('Both RAMNOOR_AUTH_USER and RAMNOOR_AUTH_PASSWORD are required.');
if(!['127.0.0.1','localhost','::1'].includes(bind)&&!password)throw new Error('Configure authentication before binding to a network address.');
const dbPath=process.env.RAMNOOR_DB_PATH||path.join(root,'var/dashboard.sqlite');await fs.mkdir(path.dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS factory_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL);');
const get=db.prepare('SELECT payload FROM factory_state WHERE id=?');
const put=db.prepare('INSERT INTO factory_state(id,revision,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload');
const read=()=>{const row=get.get('ramnoor');return row?JSON.parse(row.payload):freshState();};
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function authorized(req){if(!password)return true;const auth=req.headers.authorization||'';if(!auth.startsWith('Basic '))return false;return equal(Buffer.from(auth.slice(6),'base64').toString('utf8'),user+':'+password);}
const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export const server=http.createServer(async(req,res)=>{
 try{
  if(!authorized(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Ram Noor", charset="UTF-8"','Cache-Control':'no-store'});res.end('Authentication required');return;}
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/api/factory'){
   if(req.method==='GET'){json(res,read());return;}
   if(req.method!=='POST'){json(res,{error:'روش درخواست معتبر نیست.'},405);return;}
   if(!(req.headers['content-type']||'').includes('application/json')){json(res,{error:'نوع درخواست باید JSON باشد.'},415);return;}
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){json(res,{error:'مبدأ درخواست معتبر نیست.'},403);return;}
   let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>5000000){json(res,{error:'درخواست بیش از ۵ مگابایت است.'},413);return;}}
   const value=JSON.parse(body);db.exec('BEGIN IMMEDIATE');try{const before=read();if(before.applied.includes(value.command?.id)){db.exec('COMMIT');json(res,before);return;}if(value.revision!==before.revision){db.exec('ROLLBACK');json(res,{error:'ثبت دیگری انجام شده است؛ دوباره همگام کنید.'},409);return;}const next=applyCommand(before,value.command,source,user||'local-user').state;put.run('ramnoor',next.revision,JSON.stringify(next));db.exec('COMMIT');json(res,next);}catch(e){db.exec('ROLLBACK');json(res,{error:e.message},400);}return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(url.pathname==='/'){res.writeHead(302,{Location:'/dashboard/index.html'});res.end();return;}
  const filename=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));if(!filename.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return;}
  let stat;try{stat=await fs.stat(filename);}catch{res.writeHead(404);res.end('Not found');return;}if(!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:await fs.readFile(filename));
 }catch{json(res,{error:'درخواست پردازش نشد.'},400);}
});
server.listen(port,bind,()=>console.log(`Ram Noor dashboard: http://${bind}:${server.address().port}/`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
