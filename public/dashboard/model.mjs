export const DAY=86400000;
export const stages=[['untracked','وضعیت نامشخص'],['materials','تأمین مواد'],['cutting','برش و فرمینگ'],['assembly','مونتاژ و جوش'],['coating','رنگ و پوشش'],['production','در خط تولید'],['ready','آماده ارسال'],['partial','ارسال بخشی'],['recorded','تحویل ثبت‌شده'],['delivered','تحویل کامل تأییدشده'],['cancelled','لغوشده']];
export const fa=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(n);
export const digits=s=>String(s??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
export const norm=s=>digits(s).trim().toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ');
export const stageLabel=s=>stages.find(x=>x[0]===s)?.[1]??'وضعیت نامشخص';
const jf=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
function parts(d){return Object.fromEntries(jf.formatToParts(d).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));}
export function jalaliDay(s){
 const m=digits(s).trim().match(/^(1[34]\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);if(!m)return null;
 const [y,mo,da]=m.slice(1).map(Number);if(mo<1||mo>12||da<1||da>31)return null;
 let start=null;for(let i=0;i<35;i++){const t=Date.UTC(y+621,2,1)+i*DAY;const p=parts(new Date(t));if(p.year===y&&p.month===1&&p.day===1){start=t;break;}}
 if(start===null)return null;const offset=mo<=7?(mo-1)*31:186+(mo-7)*30;
 const ts=start+(offset+da-1)*DAY;const p=parts(new Date(ts));return p.year===y&&p.month===mo&&p.day===da?ts/DAY:null;
}
export function currentJalali(){const f=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'});const p=Object.fromEntries(f.formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}/${p.month}/${p.day}`;}
export function effective(o,updates={}){const u=updates[o.id]??{};return {...o,...u,quantity:u.quantity!==undefined?u.quantity:o.quantity,edited:!!updates[o.id]};}
export function quantity(o){return typeof o.quantity==='number'&&Number.isFinite(o.quantity)&&o.quantity>0?o.quantity:null;}
export function status(o){
 if(o.stage)return o.stage;
 if(norm(o.delivery).includes('کنسل')||norm(o.project).includes('کنسل'))return 'cancelled';
 if(quantity(o)!==null&&typeof o.shipped==='number'&&o.shipped===quantity(o))return 'delivered';
 if(typeof o.shipped==='number'&&o.shipped>0)return 'partial';
 if(norm(o.delivery).includes('آماده'))return 'ready';
 if(jalaliDay(o.delivery)!==null||/ارسال|تحویل/.test(o.delivery))return 'recorded';
 if(typeof o.produced==='number'&&o.produced===quantity(o))return 'ready';
 if(/در خط تولید/.test(o.planningNote))return 'production';
 return 'untracked';
}
export const active=o=>!['cancelled','recorded','delivered'].includes(status(o));
export function lateness(o,today){const d=jalaliDay(o.due),t=jalaliDay(today);return active(o)&&d!==null&&t!==null&&d<t?t-d:0;}
export const projectKey=o=>/^[a-z]+\d+$/i.test(o.project)?o.project:`uncoded-${o.id}`;
export const projectName=o=>projectKey(o).startsWith('uncoded-')?'سفارش لغوشده بدون کد':o.project.toUpperCase();
export function projectGroups(orders){const map=new Map();for(const o of orders){const k=projectKey(o);if(!map.has(k))map.set(k,[]);map.get(k).push(o);}return [...map.entries()].map(([id,rows])=>({id,rows,name:projectName(rows[0]),open:rows.filter(active).length,late:rows.filter(o=>lateness(o,currentJalali())>0).length}));}
export function problems(o,data,today){const a=[];if(quantity(o)===null)a.push('تعداد نیازمند تفکیک');if(active(o)&&jalaliDay(o.due)===null)a.push(o.due?'موعد نامعتبر':'موعد تعیین نشده');if(status(o)==='untracked')a.push('وضعیت اجرا ثبت نشده');if(active(o)&&!data.parts.some(p=>p.project===o.project))a.push('قطعات پروژه ثبت نشده');if(lateness(o,today)>0)a.push(`${fa(lateness(o,today))} روز تأخیر`);return a;}
export function validateUpdate(o,u){
 if(u.due&&jalaliDay(u.due)===null)return 'موعد را به صورت تاریخ شمسی معتبر، مانند 1405/07/21 وارد کنید.';
 if(u.quantity!==undefined&&(!Number.isInteger(u.quantity)||u.quantity<=0))return 'تعداد سفارش باید عدد صحیح مثبت باشد.';
 const q=quantity({...o,...u});
 for(const k of ['produced','shipped'])if(u[k]!==null&&u[k]!==undefined&&(!Number.isInteger(u[k])||u[k]<0||(q!==null&&u[k]>q)))return 'تعداد تولید یا ارسال باید عدد صحیح غیرمنفی و حداکثر برابر تعداد سفارش باشد.';
 if(u.shipped!==null&&u.produced!==null&&u.shipped>u.produced)return 'تعداد ارسال نمی‌تواند بیشتر از تعداد تولید تأییدشده باشد.';
 if(q!==null&&u.shipped===q&&u.stage&&!['delivered','cancelled'].includes(u.stage))return 'وقتی تمام سفارش ارسال شده، مرحله را «تحویل کامل تأییدشده» یا «بر اساس فایل و تعدادها» انتخاب کنید.';
 if(u.stage==='delivered'&&(q===null||u.shipped!==q))return 'برای تأیید تحویل کامل، تعداد سفارش و تعداد ارسال را برابر و عددی ثبت کنید.';
 if(u.stage==='ready'&&(q===null||u.produced!==q))return 'برای تأیید آماده ارسال، تولید تکمیل‌شده را برابر تعداد سفارش ثبت کنید.';
 return '';
}
export function csv(rows){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
