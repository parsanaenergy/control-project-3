import {env} from 'cloudflare:workers';
import source from '../../../public/dashboard/data.json';
import {freshState,applyCommand} from '../../../public/dashboard/operations.mjs';
export const dynamic='force-dynamic';
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function readState(){const row=await env.DB!.prepare('SELECT revision,payload FROM factory_state WHERE id=?').bind('ramnoor').first<any>();return row?JSON.parse(row.payload):freshState();}
export async function GET(){try{return json(await readState());}catch{return json({error:'دریافت داده‌های سرور انجام نشد.'},503);}}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'مبدأ درخواست معتبر نیست.'},403);
  const text=await request.text();if(text.length>5000000)return json({error:'درخواست بیش از حد بزرگ است.'},413);const body=JSON.parse(text),before=await readState();
  if(before.applied.includes(body.command?.id))return json(before);
  if(body.revision!==before.revision)return json({error:'اطلاعات در دستگاه دیگری تغییر کرده است. دوباره همگام کنید.'},409);
  const {state}=applyCommand(before,body.command,source,request.headers.get('oai-authenticated-user-id')??'private-service');
  let result;if(before.revision===0){result=await env.DB!.prepare('INSERT OR IGNORE INTO factory_state(id,revision,payload) VALUES(?,?,?)').bind('ramnoor',state.revision,JSON.stringify(state)).run();}
  else{result=await env.DB!.prepare('UPDATE factory_state SET revision=?,payload=? WHERE id=? AND revision=?').bind(state.revision,JSON.stringify(state),'ramnoor',before.revision).run();}
  if(!result.meta.changes)return json({error:'ثبت هم‌زمان دیگری انجام شد؛ دوباره همگام کنید.'},409);return json(state);
 }catch(e){return json({error:e instanceof Error?e.message:'ثبت گزارش انجام نشد.'},400);}
}
