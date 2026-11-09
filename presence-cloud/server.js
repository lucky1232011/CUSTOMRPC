const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);
const APP_ID = process.env.DISCORD_APPLICATION_ID || '1569073956802134157';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || APP_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production' ? crypto.randomBytes(32).toString('hex') : '');
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false' && (process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || PUBLIC_URL.startsWith('https://'));
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

if (!SESSION_SECRET) throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
if (process.env.NODE_ENV === 'production' && (!CLIENT_SECRET || !TOKEN_KEY || !PUBLIC_URL)) {
  throw new Error('Production requires DISCORD_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY and PUBLIC_URL.');
}
if (TOKEN_KEY && !/^[0-9a-f]{64}$/i.test(TOKEN_KEY)) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
fs.mkdirSync(DATA_DIR, { recursive: true });

const seed = { profiles: [
  { id:'p1', name:'Deep work', category:'Focus', favorite:true, type:'Playing', details:'Building something great', state:'Do not disturb', largeImage:'', largeText:'Focus mode', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 },
  { id:'p2', name:'Now playing', category:'Games', favorite:false, type:'Playing', details:'Hades II', state:'Attempt 12', largeImage:'', largeText:'The Crossroads', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 },
  { id:'p3', name:'Listening', category:'Music', favorite:false, type:'Playing', details:'The Dark Side of the Moon', state:'Pink Floyd', largeImage:'', largeText:'Now playing', smallImage:'', smallText:'', buttons:[], startAt:null, partyId:'', partySize:0, partyMax:0 }
], activeId:'p1', rotations:[], schedules:[], logs:[], settings:{applicationId:APP_ID, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone, sleepEnabled:false,sleepMinutes:60}, ownerId:null, credential:null, worker:{state:'stopped',enabled:false,lastUpdate:null} };
function read(){ try { return { ...structuredClone(seed), ...JSON.parse(fs.readFileSync(DB_FILE,'utf8')) }; } catch { fs.writeFileSync(DB_FILE, JSON.stringify(seed,null,2)); return structuredClone(seed); } }
let db = read();
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2), { mode:0o600 }); if(process.platform!=='win32')fs.chmodSync(DB_FILE,0o600); }
function log(level,message){ db.logs.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),level,message}); db.logs=db.logs.slice(0,200); save(); }
function send(res,status,obj){ res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); }
function body(req){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c;if(s.length>1e6) reject(Error('Payload too large'));});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(Error('Invalid JSON'));}});}); }
function encrypt(value){ if(!TOKEN_KEY)throw Error('Token encryption is not configured.'); const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(TOKEN_KEY,'hex'),iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return [iv.toString('hex'),c.getAuthTag().toString('hex'),data.toString('hex')].join('.'); }
function decrypt(value){const [iv,tag,data]=String(value).split('.');const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(TOKEN_KEY,'hex'),Buffer.from(iv,'hex'));d.setAuthTag(Buffer.from(tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(data,'hex')),d.final()]).toString());}
function sign(value){const b=Buffer.from(JSON.stringify(value)).toString('base64url');return `${b}.${crypto.createHmac('sha256',SESSION_SECRET).update(b).digest('base64url')}`;}
function verify(value){try{const [b,s]=String(value||'').split('.');const expected=crypto.createHmac('sha256',SESSION_SECRET).update(b).digest();const actual=Buffer.from(s,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const data=JSON.parse(Buffer.from(b,'base64url'));return data.exp>Date.now()?data:null;}catch{return null;}}
function cookie(res,name,value,maxAge){res.appendHeader('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE?'; Secure':''}`);}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));}
function sessionFor(req){return verify(cookies(req).pc_session);}
const oauthStates=new Map();
function cleanProfile(p){
  const str=(x,max=180)=>String(x??'').trim().slice(0,max);
  const url=(x)=>{const v=str(x,500); if(!v)return ''; try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?v:'';}catch{return '';}};
  const buttons=Array.isArray(p.buttons)?p.buttons.slice(0,2).map(b=>({label:str(b.label,32),url:url(b.url)})).filter(b=>b.label&&b.url):[];
  return {id:str(p.id,80)||crypto.randomUUID(),name:str(p.name,60)||'Untitled activity',category:str(p.category,40)||'Other',favorite:!!p.favorite,type:['Playing','Listening','Watching','Competing'].includes(p.type)?p.type:'Playing',details:str(p.details),state:str(p.state),largeImage:url(p.largeImage),largeText:str(p.largeText),smallImage:url(p.smallImage),smallText:str(p.smallText),buttons,startAt:Number(p.startAt)||null,partyId:str(p.partyId,100),partySize:Math.max(0,Number(p.partySize)||0),partyMax:Math.max(0,Number(p.partyMax)||0)};
}
function publicState(){const {credential,ownerId,...safe}=db;return safe;}
function ensureOwner(session){return !!session&&!!db.ownerId&&session.sub===db.ownerId;}
function requireSameOrigin(req){if(!['POST','PUT','DELETE'].includes(req.method))return true;const origin=req.headers.origin;if(!origin)return false;try{const expected=PUBLIC_URL?new URL(PUBLIC_URL):new URL(`${req.headers['x-forwarded-proto']||'http'}://${req.headers['x-forwarded-host']||req.headers.host}`);return new URL(origin).origin===expected.origin;}catch{return false;}}
function tokenRequest(fields){return fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}).then(async r=>{const x=await r.json();if(!r.ok)throw Error(x.error_description||x.error||'Discord token request failed');return x;});}
let refreshTimer=null;
function scheduleRefresh(tokens){clearTimeout(refreshTimer);const delay=Math.max(15_000,Number(tokens.expiresAt||0)-Date.now()-90_000);refreshTimer=setTimeout(async()=>{try{const next=await tokenRequest({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'refresh_token',refresh_token:tokens.refreshToken});const updated={accessToken:next.access_token,refreshToken:next.refresh_token||tokens.refreshToken,expiresAt:Date.now()+Number(next.expires_in||3600)*1000};db.credential=encrypt(updated);save();if(worker)workerSend({op:'token',token:updated.accessToken});else startWorker(updated.accessToken);scheduleRefresh(updated);}catch(e){db.worker.state='auth-expired';save();log('error',`Discord authorization needs reconnecting: ${String(e.message).slice(0,180)}`);}},delay);refreshTimer.unref?.();}
let worker=null, workerReady=false, workerConnected=false;
let restartTimer=null;
function workerSend(command){if(worker?.stdin?.writable)worker.stdin.write(JSON.stringify(command)+'\n');}
function startWorker(token){
  const executable=process.env.PRESENCE_WORKER || path.join(ROOT,'worker','build','presence-worker');
  if(!fs.existsSync(executable)){db.worker={state:'sdk-not-installed',lastUpdate:db.worker?.lastUpdate||null};save();return false;}
  if(worker && !worker.killed){workerSend({op:'token',token});return true;}
  worker=spawn(executable,[APP_ID],{stdio:['pipe','pipe','pipe']});workerReady=false;workerConnected=false;
  let lines='';worker.stdout.on('data',chunk=>{lines+=chunk.toString();let n;while((n=lines.indexOf('\n'))>=0){const raw=lines.slice(0,n);lines=lines.slice(n+1);try{const event=JSON.parse(raw);if(event.event==='ready'){workerReady=true;workerSend({op:'connect',token});}if(event.event==='authenticated'){db.worker.state='connecting';save();}if(event.event==='connection'){workerConnected=event.status===3;if(workerConnected){db.worker.state='connected';if(db.activeId){const p=db.profiles.find(x=>x.id===db.activeId);if(p)workerSend({op:'activity',profile:p});}}else if(event.status===0||event.status===4){db.worker.state=event.status===4?'reconnecting':'connecting';}save();}if(event.event==='presence_updated'){db.worker.state='running';db.worker.lastUpdate=new Date().toISOString();save();log('success','Rich Presence updated on Discord.');}if(['auth_error','presence_error','status_error','error'].includes(event.event)){db.worker.state='error';save();log('error',String(event.message||event.event).slice(0,240));}}catch{}}});
  worker.stderr.on('data',chunk=>console.error('[presence-worker]',chunk.toString().slice(0,1000)));
  worker.on('exit',(code)=>{worker=null;workerReady=false;workerConnected=false;db.worker.state=db.worker.enabled?'reconnecting':'stopped';save();if(code)log('warning',`Presence worker exited (${code}).`);if(db.worker.enabled){clearTimeout(restartTimer);restartTimer=setTimeout(()=>{try{const tokens=decrypt(db.credential);startWorker(tokens.accessToken);}catch(e){log('error',`Worker restart failed: ${String(e.message).slice(0,160)}`);}},5000);restartTimer.unref?.();}});
  db.worker.state='starting';save();return true;
}
function stopWorker(){clearTimeout(restartTimer);if(worker){workerSend({op:'stop'});worker.stdin.end();}worker=null;workerReady=false;workerConnected=false;db.worker.state='stopped';db.worker.lastUpdate=new Date().toISOString();save();}
function safeLoggedIn(req){return ensureOwner(sessionFor(req));}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/auth/discord'){
    if(!CLIENT_SECRET)return send(res,503,{error:'Set DISCORD_CLIENT_SECRET on the server first.'});
    const state=crypto.randomBytes(24).toString('base64url');oauthStates.set(state,Date.now()+10*60_000);cookie(res,'pc_oauth',state,600);
    const redirectUri=`${PUBLIC_URL||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`}/auth/callback`;
    const q=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:redirectUri,scope:'identify openid sdk.social_layer_presence',state,prompt:'consent'});
    return res.writeHead(302,{Location:`https://discord.com/oauth2/authorize?${q}`,'Cache-Control':'no-store'}).end();
  }
  if(req.method==='GET'&&u.pathname==='/auth/callback'){
    const state=u.searchParams.get('state'),expiry=oauthStates.get(state);oauthStates.delete(state);cookie(res,'pc_oauth','',0);
    if(!state||state!==cookies(req).pc_oauth||!expiry||expiry<Date.now()||u.searchParams.has('error'))return send(res,400,{error:'Discord sign-in was cancelled or expired. Go back and try again.'});
    try{
      const redirectUri=`${PUBLIC_URL||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`}/auth/callback`;
      const t=await tokenRequest({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirectUri});
      const who=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${t.access_token}`}}).then(r=>r.json());
      if(!who.id)throw Error('Discord did not return your account identity.');
      if(db.ownerId&&db.ownerId!==who.id)throw Error('This private dashboard is already linked to a different Discord account.');
      db.ownerId=who.id;db.discordUser={id:who.id,username:who.global_name||who.username,avatar:who.avatar};
      const tokens={accessToken:t.access_token,refreshToken:t.refresh_token,expiresAt:Date.now()+Number(t.expires_in||3600)*1000};db.credential=encrypt(tokens);
      save();cookie(res,'pc_session',sign({sub:who.id,exp:Date.now()+7*86400_000}),7*86400);log('success',`Discord account ${String(db.discordUser.username).slice(0,80)} connected.`);scheduleRefresh(tokens);
      return res.writeHead(302,{Location:'/','Cache-Control':'no-store'}).end();
    }catch(e){return send(res,400,{error:e.message||'Discord sign-in failed.'});}
  }
  if(req.method==='POST'&&u.pathname==='/auth/logout'){cookie(res,'pc_session','',0);db.worker.enabled=false;stopWorker();return send(res,200,{ok:true});}
  if(u.pathname.startsWith('/api/')&&!safeLoggedIn(req))return send(res,401,{error:'Sign in with Discord to use this dashboard.'});
  if(!requireSameOrigin(req))return send(res,403,{error:'Request origin rejected.'});
  if(req.method==='GET'&&u.pathname==='/api/auth')return send(res,200,{authenticated:true,user:db.discordUser||null,worker:db.worker});
  if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,publicState());
  if(req.method==='GET'&&u.pathname==='/api/health')return send(res,200,{ok:true,mode:'social-sdk-worker',discordConnected:workerConnected,worker:db.worker.state});
  if(req.method==='POST'&&u.pathname==='/api/worker/start'){
    try{const token=decrypt(db.credential);db.worker.enabled=true;save();if(!startWorker(token.accessToken)){db.worker.enabled=false;save();return send(res,503,{error:'Install the Discord Social SDK files and build the worker before starting it.'});}return send(res,200,{ok:true,state:db.worker.state});}catch(e){return send(res,503,{error:e.message});}
  }
  if(req.method==='POST'&&u.pathname==='/api/worker/stop'){workerSend({op:'clear'});db.worker.enabled=false;stopWorker();log('info','Rich Presence worker stopped by user.');return send(res,200,{ok:true,state:'stopped'});}
  if(req.method==='POST'&&u.pathname==='/api/presence/status'){const x=await body(req);if(!workerConnected)return send(res,409,{error:'Worker is not connected.'});workerSend({op:'status',status:String(x.status||'Online')});return send(res,200,{ok:true});}
  if(req.method==='POST' && u.pathname==='/api/profiles') { try {const p=cleanProfile(await body(req)); if(db.profiles.some(x=>x.id===p.id))p.id=crypto.randomUUID(); db.profiles.unshift(p);save();log('success',`Profile “${p.name}” saved.`);return send(res,201,p);}catch(e){return send(res,400,{error:e.message});} }
  const match=u.pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if(match){const id=decodeURIComponent(match[1]),i=db.profiles.findIndex(p=>p.id===id);
    if(req.method==='PUT'){try{if(i<0)return send(res,404,{error:'Profile not found'});const p=cleanProfile({...await body(req),id});db.profiles[i]=p;save();log('success',`Profile “${p.name}” updated.`);if(id===db.activeId&&workerConnected)workerSend({op:'activity',profile:p});return send(res,200,p);}catch(e){return send(res,400,{error:e.message});}}
    if(req.method==='DELETE'){if(i<0)return send(res,404,{error:'Profile not found'});const [p]=db.profiles.splice(i,1);if(db.activeId===id)db.activeId=db.profiles[0]?.id||null;save();log('warning',`Profile “${p.name}” deleted.`);return send(res,204,{});}
  }
  if(req.method==='POST'&&u.pathname==='/api/activate'){const x=await body(req);if(!db.profiles.some(p=>p.id===x.id))return send(res,404,{error:'Profile not found'});db.activeId=x.id;db.worker.lastUpdate=new Date().toISOString();save();const p=db.profiles.find(y=>y.id===x.id);if(workerConnected)workerSend({op:'activity',profile:p});log('info',workerConnected?`Publishing “${p.name}” to Discord.`:`Selected “${p.name}”; worker is offline.`);return send(res,200,{activeId:db.activeId,published:workerConnected});}
  if(req.method==='POST'&&u.pathname==='/api/settings'){db.settings={...db.settings,...await body(req),applicationId:APP_ID};save();return send(res,200,db.settings);}
  if(req.method==='POST'&&u.pathname==='/api/rotations'){const x=await body(req);const item={id:crypto.randomUUID(),name:String(x.name||'Rotation').slice(0,60),items:Array.isArray(x.items)?x.items.filter(i=>db.profiles.some(p=>p.id===i.profileId)).map(i=>({profileId:i.profileId,minutes:Math.max(1,Math.min(1440,Number(i.minutes)||15)),enabled:i.enabled!==false})):[],mode:x.mode==='random'?'random':'sequential',enabled:!!x.enabled};db.rotations.unshift(item);save();log('info',`Rotation preset “${item.name}” saved.`);return send(res,201,item);}
  if(req.method==='DELETE'&&u.pathname.startsWith('/api/rotations/')){db.rotations=db.rotations.filter(r=>r.id!==u.pathname.split('/').pop());save();return send(res,204,{});}
  if(req.method==='POST'&&u.pathname==='/api/schedules'){const x=await body(req);const item={id:crypto.randomUUID(),name:String(x.name||'Schedule').slice(0,60),profileId:db.profiles.some(p=>p.id===x.profileId)?x.profileId:null,time:String(x.time||'09:00'),days:Array.isArray(x.days)?x.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6):[],timezone:String(x.timezone||db.settings.timezone),enabled:!!x.enabled};db.schedules.unshift(item);save();log('info',`Schedule “${item.name}” saved.`);return send(res,201,item);}
  if(req.method==='DELETE'&&u.pathname.startsWith('/api/schedules/')){db.schedules=db.schedules.filter(s=>s.id!==u.pathname.split('/').pop());save();return send(res,204,{});}
  if(req.method==='POST'&&u.pathname==='/api/logs'){const x=await body(req);log(['info','warning','error','success'].includes(x.level)?x.level:'info',String(x.message||'').slice(0,300));return send(res,201,{ok:true});}
  if(req.method==='GET'&&u.pathname.startsWith('/api/'))return send(res,404,{error:'Not found'});
  if(req.method==='GET'&&u.pathname==='/'){
    if(!safeLoggedIn(req)){const login=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presence Cloud · Sign in</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0b12;color:#f5f1fa;font:16px system-ui}.box{width:min(430px,calc(100% - 32px));padding:38px;border:1px solid #30263a;border-radius:24px;background:linear-gradient(145deg,#191221,#100d15);box-shadow:0 28px 90px #0008}.logo{color:#c38cff;font-size:14px;letter-spacing:.12em;font-weight:800}h1{font-size:32px;margin:20px 0 8px}p{color:#aca5b5;line-height:1.6}.go{display:block;margin-top:24px;padding:14px;text-align:center;border-radius:12px;background:#8060cf;color:white;text-decoration:none;font-weight:700}.fine{font-size:12px;margin-top:18px}</style><main class="box"><div class="logo">✳ PRESENCE CLOUD</div><h1>Your Discord, your controls.</h1><p>Sign in with Discord to manage your remote activity worker. Your password stays with Discord.</p><a class="go" href="/auth/discord">Continue with Discord</a><p class="fine">OAuth scopes requested: account identity and Social SDK presence. You can revoke access in Discord settings.</p></main>`;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});return res.end(login);}
  }
  if(req.method==='GET'&&u.pathname==='/')res.setHeader('Cache-Control','no-store');
  let file=path.resolve(ROOT,u.pathname==='/'?'index.html':'.'+decodeURIComponent(u.pathname));const rel=path.relative(ROOT,file);if(rel.startsWith('..')||path.isAbsolute(rel))return send(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store'});res.end(data);});
});

if(db.credential){try{const t=decrypt(db.credential);if(t.expiresAt<Date.now()+60_000)tokenRequest({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'refresh_token',refresh_token:t.refreshToken}).then(next=>{const renewed={accessToken:next.access_token,refreshToken:next.refresh_token||t.refreshToken,expiresAt:Date.now()+Number(next.expires_in||3600)*1000};db.credential=encrypt(renewed);save();if(db.worker.enabled)startWorker(renewed.accessToken);scheduleRefresh(renewed);}).catch(e=>{db.worker.state='auth-expired';save();console.error('Discord token refresh failed:',e.message);});else{if(db.worker.enabled)startWorker(t.accessToken);scheduleRefresh(t);}}catch(e){console.error('Stored Discord authorization could not be restored:',e.message);}}
server.listen(PORT,'0.0.0.0',()=>console.log(`Presence Cloud listening on ${PORT}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearTimeout(refreshTimer);db.worker.enabled=false;stopWorker();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});

