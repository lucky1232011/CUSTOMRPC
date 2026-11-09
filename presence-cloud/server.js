const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
fs.mkdirSync(DATA_DIR, { recursive: true });
const seed = { profiles: [
  { id:'p1', name:'Deep work', category:'Focus', favorite:true, type:'Playing', details:'Building something great', state:'Do not disturb', largeImage:'', largeText:'Focus mode', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 },
  { id:'p2', name:'Now playing', category:'Games', favorite:false, type:'Playing', details:'Hades II', state:'Attempt 12', largeImage:'', largeText:'The Crossroads', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 },
  { id:'p3', name:'Listening', category:'Music', favorite:false, type:'Listening', details:'The Dark Side of the Moon', state:'Pink Floyd', largeImage:'', largeText:'Now playing', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 }
], activeId:'p1', rotations:[], schedules:[], logs:[{id:'l1',time:new Date().toISOString(),level:'info',message:'Dashboard initialized. Discord publishing is not connected.'}], settings:{applicationId:'', timezone:Intl.DateTimeFormat().resolvedOptions().timeZone, sleepEnabled:false,sleepMinutes:60}, worker:{state:'dashboard-only',lastUpdate:null} };
function read(){ try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch { fs.writeFileSync(DB_FILE, JSON.stringify(seed,null,2)); return structuredClone(seed); } }
let db = read();
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }
function log(level,message){ db.logs.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),level,message}); db.logs=db.logs.slice(0,200); save(); }
function send(res,status,obj){ res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); }
function body(req){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c;if(s.length>1e6) reject(Error('Payload too large'));});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(Error('Invalid JSON'));}});}); }
function cleanProfile(p){
  const str=(x,max=180)=>String(x??'').trim().slice(0,max);
  const url=(x)=>{const v=str(x,500); if(!v)return ''; try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?v:'';}catch{return '';}};
  const buttons=Array.isArray(p.buttons)?p.buttons.slice(0,2).map(b=>({label:str(b.label,32),url:url(b.url)})).filter(b=>b.label&&b.url):[];
  return {id:str(p.id,80)||crypto.randomUUID(),name:str(p.name,60)||'Untitled activity',category:str(p.category,40)||'Other',favorite:!!p.favorite,type:['Playing','Listening','Watching','Competing'].includes(p.type)?p.type:'Playing',details:str(p.details),state:str(p.state),largeImage:url(p.largeImage),largeText:str(p.largeText),smallImage:url(p.smallImage),smallText:str(p.smallText),buttons,startAt:Number(p.startAt)||null,partyId:str(p.partyId,100),partySize:Math.max(0,Number(p.partySize)||0),partyMax:Math.max(0,Number(p.partyMax)||0)};
}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET' && u.pathname==='/api/state') return send(res,200,db);
  if(req.method==='GET' && u.pathname==='/api/health') return send(res,200,{ok:true,mode:'dashboard-only',discordConnected:false,worker:'not-configured'});
  if(req.method==='POST' && u.pathname==='/api/profiles') { try {const p=cleanProfile(await body(req)); if(db.profiles.some(x=>x.id===p.id))p.id=crypto.randomUUID(); db.profiles.unshift(p);save();log('success',`Profile “${p.name}” saved.`);return send(res,201,p);}catch(e){return send(res,400,{error:e.message});} }
  const match=u.pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if(match){const id=decodeURIComponent(match[1]),i=db.profiles.findIndex(p=>p.id===id);
    if(req.method==='PUT'){try{if(i<0)return send(res,404,{error:'Profile not found'});const p=cleanProfile({...await body(req),id});db.profiles[i]=p;save();log('success',`Profile “${p.name}” updated.`);return send(res,200,p);}catch(e){return send(res,400,{error:e.message});}}
    if(req.method==='DELETE'){if(i<0)return send(res,404,{error:'Profile not found'});const [p]=db.profiles.splice(i,1);if(db.activeId===id)db.activeId=db.profiles[0]?.id||null;save();log('warning',`Profile “${p.name}” deleted.`);return send(res,204,{});}
  }
  if(req.method==='POST'&&u.pathname==='/api/activate'){const x=await body(req);if(!db.profiles.some(p=>p.id===x.id))return send(res,404,{error:'Profile not found'});db.activeId=x.id;db.worker.lastUpdate=new Date().toISOString();save();log('info',`Selected “${db.profiles.find(p=>p.id===x.id).name}” in dashboard. No Discord activity was published.`);return send(res,200,{activeId:db.activeId,published:false});}
  if(req.method==='POST'&&u.pathname==='/api/settings'){db.settings={...db.settings,...await body(req)};save();return send(res,200,db.settings);}
  if(req.method==='POST'&&u.pathname==='/api/rotations'){const x=await body(req);const item={id:crypto.randomUUID(),name:String(x.name||'Rotation').slice(0,60),items:Array.isArray(x.items)?x.items.filter(i=>db.profiles.some(p=>p.id===i.profileId)).map(i=>({profileId:i.profileId,minutes:Math.max(1,Math.min(1440,Number(i.minutes)||15)),enabled:i.enabled!==false})):[],mode:x.mode==='random'?'random':'sequential',enabled:!!x.enabled};db.rotations.unshift(item);save();log('info',`Rotation preset “${item.name}” saved. Background execution requires a hosted worker.`);return send(res,201,item);}
  if(req.method==='DELETE'&&u.pathname.startsWith('/api/rotations/')){db.rotations=db.rotations.filter(r=>r.id!==u.pathname.split('/').pop());save();return send(res,204,{});}
  if(req.method==='POST'&&u.pathname==='/api/schedules'){const x=await body(req);const item={id:crypto.randomUUID(),name:String(x.name||'Schedule').slice(0,60),profileId:db.profiles.some(p=>p.id===x.profileId)?x.profileId:null,time:String(x.time||'09:00'),days:Array.isArray(x.days)?x.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6):[],timezone:String(x.timezone||db.settings.timezone),enabled:!!x.enabled};db.schedules.unshift(item);save();log('info',`Schedule “${item.name}” saved. It will not execute until a backend worker is deployed.`);return send(res,201,item);}
  if(req.method==='DELETE'&&u.pathname.startsWith('/api/schedules/')){db.schedules=db.schedules.filter(s=>s.id!==u.pathname.split('/').pop());save();return send(res,204,{});}
  if(req.method==='POST'&&u.pathname==='/api/logs'){const x=await body(req);log(['info','warning','error','success'].includes(x.level)?x.level:'info',String(x.message||'').slice(0,300));return send(res,201,{ok:true});}
  if(req.method==='GET'&&u.pathname.startsWith('/api/'))return send(res,404,{error:'Not found'});
  let file=path.resolve(ROOT,u.pathname==='/'?'index.html':'.'+decodeURIComponent(u.pathname));const rel=path.relative(ROOT,file);if(rel.startsWith('..')||path.isAbsolute(rel))return send(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(data);});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Presence Cloud dashboard at http://localhost:${PORT}`));

