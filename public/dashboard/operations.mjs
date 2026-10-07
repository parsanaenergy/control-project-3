import {jalaliDay,quantity,validateUpdate,norm,stages} from './model.mjs';
export const operations=[['cutting','برش'],['forming','فرمینگ و خم'],['assembly','جوش و مونتاژ'],['coating','رنگ و پوشش'],['packing','بسته‌بندی'],['final','تکمیل محصول و تأیید نهایی']];
export const units=['عدد','متر','کیلوگرم','برگ','شاخه','لیتر','دست'];
export const movementTypes=[['opening','موجودی مبنا'],['receipt','ورود خرید / ساخت'],['issue','خروج و مصرف'],['return','برگشت به انبار'],['transfer','انتقال بین مکان‌ها'],['count','شمارش و انبارگردانی'],['scrap','خروج ضایعات']];
export function freshState(){return {schema:2,revision:0,updates:{},items:[],locations:[{id:'raw',name:'انبار مواد اولیه'},{id:'parts',name:'انبار قطعات'},{id:'line',name:'خط تولید'},{id:'finished',name:'انبار محصول نهایی'}],tx:[],production:[],reserves:[],links:{},audit:[],applied:[]};}
const round=n=>Math.round(n*1e6)/1e6;
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
const validNumber=(v,min=0)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=1e9;
export function stock(state,itemId,location){let amount=0,known=false;for(const t of state.tx){if(t.voided||t.itemId!==itemId)continue;if(t.location===location){if(['opening','count'].includes(t.type)){amount=t.qty;known=true;}else if(['receipt','return'].includes(t.type)){ensure(known,'موجودی مبنا ثبت نشده است.');amount=round(amount+t.qty);}else if(['issue','scrap','transfer'].includes(t.type)){ensure(known,'موجودی مبنا ثبت نشده است.');amount=round(amount-t.qty);ensure(amount>=0,'لغو این سند باعث موجودی منفی می‌شود.');}}if(t.type==='transfer'&&t.toLocation===location){ensure(known,'موجودی مبنای مقصد ثبت نشده است.');amount=round(amount+t.qty);}}
 const reserved=round(state.reserves.filter(r=>r.itemId===itemId&&r.location===location).reduce((a,r)=>a+r.qty,0));return {known,amount:known?amount:null,reserved,free:known?round(amount-reserved):null};}
export function stockPairs(state){const pairs=new Map();for(const item of state.items)pairs.set(item.id+'|'+item.homeLocation,{itemId:item.id,location:item.homeLocation});for(const t of state.tx){pairs.set(t.itemId+'|'+t.location,{itemId:t.itemId,location:t.location});if(t.toLocation)pairs.set(t.itemId+'|'+t.toLocation,{itemId:t.itemId,location:t.toLocation});}return [...pairs.values()].map(p=>({...p,...stock(state,p.itemId,p.location)}));}
function validateBalances(s){for(const p of stockPairs(s)){ensure(p.known||p.reserved===0,'موجودی دارای رزرو باید مبنای شمارش معتبر داشته باشد.');ensure(!p.known||p.free>=0,'این تغییر موجودی آزاد را منفی می‌کند؛ ابتدا رزرو مربوط را آزاد کنید.');}}
export function applyCommand(state,command,data,actor='user'){
 ensure(command&&typeof command==='object','درخواست معتبر نیست.');ensure(typeof command.id==='string'&&/^[A-Za-z0-9_-]{8,120}$/.test(command.id),'شناسه ثبت معتبر نیست.');
 if(state.applied.includes(command.id))return {state,duplicate:true};
 const s=structuredClone(state),c=command,p=c.payload??{},now=new Date().toISOString();
 const item=()=>{const i=s.items.find(i=>i.id===p.itemId);ensure(i,'کالا را از فهرست انتخاب کنید.');return i;};
 const loc=(id)=>ensure(s.locations.some(l=>l.id===id),'مکان معتبر نیست.');
 const order=()=>{const o=data.orders.find(o=>o.id===p.orderId);ensure(o,'سفارش تولید را انتخاب کنید.');return {...o,...s.updates[o.id]};};
 const recordFields=()=>{ensure(jalaliDay(p.date)!==null,'تاریخ شمسی معتبر وارد کنید.');ensure(text(p.operator),'نام ثبت‌کننده یا اپراتور را وارد کنید.');return {date:p.date,operator:text(p.operator,100),note:text(p.note,2000),document:text(p.document,100),recordedAt:now,actor};};
 if(c.type==='restore'){
  ensure(state.revision===0,'بازیابی کامل فقط روی پایگاه داده خالی مجاز است؛ گزارش‌های فعلی حفظ می‌شوند.');const b=p.snapshot;ensure(b&&b.schema===2&&Array.isArray(b.items)&&Array.isArray(b.locations)&&Array.isArray(b.tx)&&Array.isArray(b.production)&&Array.isArray(b.reserves)&&Array.isArray(b.applied)&&Array.isArray(b.audit)&&b.updates&&b.links,'ساختار پشتیبان معتبر نیست.');
  const ids=new Set();for(const i of b.items){ensure(typeof i.id==='string'&&!ids.has(i.id)&&units.includes(i.unit)&&text(i.name)&&text(i.code),'کالای پشتیبان معتبر نیست.');ids.add(i.id);}const lids=new Set(b.locations.map(l=>l.id));ensure(lids.size===b.locations.length&&b.locations.every(l=>typeof l.id==='string'&&text(l.name)),'مکان‌های پشتیبان معتبر نیستند.');
  const orderIds=new Set(data.orders.map(o=>o.id));for(const t of b.tx){ensure(ids.has(t.itemId)&&lids.has(t.location)&&validNumber(t.qty)&&movementTypes.some(([id])=>id===t.type)&&jalaliDay(t.date)!==null&&typeof t.id==='string','گردش پشتیبان معتبر نیست.');if(t.toLocation)ensure(lids.has(t.toLocation),'مقصد گردش معتبر نیست.');}
  for(const r of b.reserves)ensure(ids.has(r.itemId)&&lids.has(r.location)&&orderIds.has(r.orderId)&&validNumber(r.qty),'رزرو پشتیبان معتبر نیست.');
  for(const r of b.production)ensure(orderIds.has(r.orderId)&&operations.some(([id])=>id===r.operation)&&['good','scrap','rework','stopMinutes'].every(k=>validNumber(r[k])&&Number.isInteger(r[k]))&&jalaliDay(r.date)!==null&&typeof r.id==='string','گزارش تولید پشتیبان معتبر نیست.');
  for(const [id,u] of Object.entries(b.updates)){ensure(orderIds.has(id),'سفارش پشتیبان پیدا نشد.');const err=validateUpdate(data.orders.find(o=>o.id===id),u);ensure(!err,err);if(u._baselineProduced!==undefined)ensure(validNumber(u._baselineProduced)&&Number.isInteger(u._baselineProduced),'مبنای تولید معتبر نیست.');}
  for(const [id,itemId] of Object.entries(b.links))ensure(data.parts.some(p=>p.id===id)&&ids.has(itemId),'اتصال کالا معتبر نیست.');
  Object.assign(s,structuredClone(b),{revision:0});validateBalances(s);
 }else if(c.type==='item'){
  const name=text(p.name),code=text(p.code,60);ensure(name&&code,'نام و کد یکتای کالا لازم است.');ensure(!s.items.some(i=>norm(i.code)===norm(code)),'این کد کالا قبلاً ثبت شده است.');ensure(units.includes(p.unit),'واحد پایه معتبر نیست.');loc(p.homeLocation);
  s.items.push({id:c.id,code,name,unit:p.unit,spec:text(p.spec),category:text(p.category,60),homeLocation:p.homeLocation,createdAt:now,actor});
 }else if(c.type==='location'){
  const name=text(p.name,100);ensure(name,'نام مکان لازم است.');ensure(!s.locations.some(l=>norm(l.name)===norm(name)),'این مکان قبلاً ثبت شده است.');s.locations.push({id:c.id,name});
 }else if(c.type==='movement'){
  const i=item();loc(p.location);ensure(movementTypes.some(([t])=>t===p.type),'نوع گردش معتبر نیست.');ensure(validNumber(p.qty),'مقدار عددی غیرمنفی وارد کنید.');if(!['opening','count'].includes(p.type))ensure(p.qty>0,'مقدار گردش باید بیشتر از صفر باشد.');if(i.unit==='عدد')ensure(Number.isInteger(p.qty),'کالای با واحد عدد، مقدار صحیح نیاز دارد.');const fields=recordFields();
  if(!['opening','count'].includes(p.type))ensure(fields.document,'شماره سند / حواله لازم است.');
  const before=stock(s,i.id,p.location);if(p.type==='opening')ensure(!before.known,'موجودی مبنا قبلاً ثبت شده؛ برای اصلاح از شمارش استفاده کنید.');
  if(!['opening','count'].includes(p.type))ensure(before.known,'ابتدا موجودی مبنای این کالا و مکان را شمارش و ثبت کنید؛ مقدار نامشخص صفر نیست.');
  if(p.type==='count')ensure(fields.note,'علت شمارش یا مغایرت را بنویسید.');
  if(['issue','scrap','transfer'].includes(p.type)){const own=s.reserves.find(r=>r.itemId===i.id&&r.location===p.location&&r.orderId===p.orderId)?.qty??0;ensure(p.qty<=before.free+(['issue'].includes(p.type)?own:0),'موجودی آزاد کافی نیست؛ رزرو سایر سفارش‌ها حفظ می‌شود.');}
  if(p.type==='transfer'){loc(p.toLocation);ensure(p.toLocation!==p.location,'مبدأ و مقصد باید متفاوت باشند.');ensure(stock(s,i.id,p.toLocation).known,'ابتدا موجودی مبنای مقصد را ثبت کنید، حتی اگر صفر است.');}
  if(p.orderId)order();
  let reservationReleased=0;if(p.type==='issue'){ensure(p.orderId||fields.note,'سفارش مصرف را انتخاب کنید یا علت مصرف عمومی را بنویسید.');const r=s.reserves.find(r=>r.itemId===i.id&&r.location===p.location&&r.orderId===p.orderId);if(r){reservationReleased=Math.min(r.qty,p.qty);r.qty=Math.max(0,round(r.qty-p.qty));}}
  s.tx.push({id:c.id,type:p.type,itemId:i.id,location:p.location,toLocation:p.type==='transfer'?p.toLocation:null,qty:p.qty,orderId:p.orderId||null,reservationReleased,lot:text(p.lot,100),receiver:text(p.receiver,100),bookBefore:before.amount,countDelta:before.known&&p.type==='count'?round(p.qty-before.amount):null,...fields});validateBalances(s);
 }else if(c.type==='reserve'){
  const i=item();loc(p.location);order();ensure(validNumber(p.qty),'مقدار رزرو معتبر نیست.');if(i.unit==='عدد')ensure(Number.isInteger(p.qty),'رزرو کالای عددی باید صحیح باشد.');const b=stock(s,p.itemId,p.location);ensure(b.known,'ابتدا موجودی مبنا را ثبت کنید.');const old=s.reserves.find(r=>r.itemId===p.itemId&&r.location===p.location&&r.orderId===p.orderId);ensure(p.qty<=b.free+(old?.qty??0),'موجودی آزاد کافی برای رزرو نیست.');s.reserves=s.reserves.filter(r=>r!==old);if(p.qty>0)s.reserves.push({id:c.id,itemId:p.itemId,location:p.location,orderId:p.orderId,qty:p.qty,actor,recordedAt:now});
 }else if(c.type==='production'){
  const o=order(),q=quantity(o);ensure(q!==null,'ابتدا تعداد سفارش را در ثبت وضعیت تأیید کنید.');ensure(text(p.station),'ایستگاه یا دستگاه را وارد کنید.');if(p.partId)ensure(data.parts.some(r=>r.id===p.partId&&r.project===o.project),'قطعه انتخاب‌شده متعلق به این پروژه نیست.');ensure(p.operation!=='final'||!p.partId,'تأیید نهایی باید برای محصول کامل باشد، نه قطعه.');ensure(operations.some(([op])=>op===p.operation),'عملیات معتبر نیست.');for(const key of ['good','scrap','rework','stopMinutes'])ensure(validNumber(p[key])&&Number.isInteger(p[key]),'تعداد سالم، ضایعات، دوباره‌کاری و دقیقه توقف باید صحیح و غیرمنفی باشند.');ensure(p.good+p.scrap+p.rework>0||p.stopMinutes>0,'حداقل تعداد یا زمان توقف ثبت کنید.');ensure(p.stopMinutes===0||text(p.stopReason),'علت توقف لازم است.');ensure(['صبح','عصر','شب'].includes(p.shift),'شیفت را انتخاب کنید.');const fields=recordFields();
  if(p.operation==='final'){
   let base=o._baselineProduced;if(base===undefined){if(typeof o.produced==='number')base=o.produced;else{ensure(validNumber(p.initialProduced)&&Number.isInteger(p.initialProduced),'برای اولین گزارش نهایی، تعداد تکمیل‌شده قبل از این گزارش را وارد کنید؛ صفر هم باید تأیید شود.');base=p.initialProduced;}}
   const previous=s.production.filter(r=>r.orderId===o.id&&r.operation==='final'&&!r.voided).reduce((a,r)=>a+r.good,0);const total=base+previous+p.good;ensure(total<=q,'تعداد تکمیل‌شده از مقدار سفارش بیشتر می‌شود.');s.updates[o.id]={...s.updates[o.id],_baselineProduced:base,produced:total,stage:total===q?'ready':'production',reportDate:p.date};
  }else{s.updates[o.id]={...s.updates[o.id],stage:p.operation==='forming'||p.operation==='cutting'?'cutting':p.operation==='packing'?'production':p.operation,reportDate:p.date};}
  s.production.push({id:c.id,orderId:o.id,operation:p.operation,station:text(p.station,100),partId:p.partId||null,good:p.good,scrap:p.scrap,rework:p.rework,stopMinutes:p.stopMinutes,stopReason:text(p.stopReason),shift:p.shift,batch:text(p.batch,100),...fields});
 }else if(c.type==='orderUpdate'){
  const o=order(),u=p.update;ensure(u&&typeof u==='object','گزارش سفارش معتبر نیست.');const allowed=['quantity','stage','priority','owner','due','produced','shipped','reportDate','actionNote'];const clean={};for(const k of allowed)if(u[k]!==undefined)clean[k]=u[k];
  for(const k of ['owner','due','reportDate','actionNote','stage','priority'])if(clean[k]!==undefined)ensure(typeof clean[k]==='string'&&clean[k].length<=3000,'فیلد متنی نامعتبر است.');
  const hasFinal=s.production.some(r=>r.orderId===o.id&&r.operation==='final'&&!r.voided);if(hasFinal)ensure(clean.produced===undefined||clean.produced===o.produced,'تعداد تکمیل‌شده از گزارش عملیات می‌آید؛ برای اصلاح، گزارش اشتباه را لغو و دوباره ثبت کنید.');
  if(!hasFinal&&typeof clean.produced==='number')clean._baselineProduced=clean.produced;
  if(clean.stage)ensure(stages.some(([id])=>id===clean.stage),'مرحله سفارش معتبر نیست.');const error=validateUpdate(o,{...o,...clean});ensure(!error,error);if(clean.reportDate)ensure(jalaliDay(clean.reportDate)!==null,'تاریخ گزارش معتبر نیست.');s.updates[o.id]={...s.updates[o.id],...clean,updatedAt:now};
 }else if(c.type==='link'){
  ensure(data.parts.some(r=>r.id===p.partId),'ردیف قطعه معتبر نیست.');item();s.links[p.partId]=p.itemId;
 }else if(c.type==='void'){
  ensure(text(p.reason),'علت لغو را وارد کنید.');const r=s.tx.find(r=>r.id===p.recordId)??s.production.find(r=>r.id===p.recordId);ensure(r&&!r.voided,'رکورد پیدا نشد یا قبلاً لغو شده است.');r.voided={at:now,reason:text(p.reason),actor};
  if(s.tx.some(t=>t.id===r.id)){if(r.reservationReleased){let reserve=s.reserves.find(x=>x.itemId===r.itemId&&x.location===r.location&&x.orderId===r.orderId);if(!reserve){reserve={id:c.id,itemId:r.itemId,location:r.location,orderId:r.orderId,qty:0};s.reserves.push(reserve);}reserve.qty=round(reserve.qty+r.reservationReleased);}validateBalances(s);}
  else if(r.operation==='final'){const o=data.orders.find(o=>o.id===r.orderId),u=s.updates[o.id];const total=(u._baselineProduced??0)+s.production.filter(x=>x.orderId===o.id&&x.operation==='final'&&!x.voided).reduce((a,x)=>a+x.good,0);ensure(total>=(u.shipped??0),'تعداد تکمیل پس از لغو کمتر از مقدار ارسال می‌شود.');u.produced=total;u.stage=total===quantity({...o,...u})?'ready':'production';}
 }else{throw new Error('نوع درخواست معتبر نیست.');}
 s.revision++;s.applied.push(c.id);s.audit.push({id:c.id,type:c.type,actor,at:now});return {state:s,duplicate:false};
}
