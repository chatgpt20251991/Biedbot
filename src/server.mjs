import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual,randomUUID,scryptSync,createCipheriv} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {Store} from './core/store.mjs';
import {VERSION} from './core/policy.mjs';
import {demoCandidates} from './adapters/demo.mjs';
import {findBrowser} from './adapters/cdp.mjs';
import {acquireInstance,releaseInstance,validLaunch} from './core/instance.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))), UI=join(ROOT,'src','ui');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const DATA=process.env.BIEDBOT_DATA_DIR||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'BiedBotEdge');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function noSecrets(e){return String(e?.message||'Onbekende fout').replace(/sk-[\w-]+/g,'[REDACTED]').slice(0,300);}
async function body(req){
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>500000)throw new Error('Verzoek te groot.');chunks.push(c);}
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new Error('JSON vereist.');
  return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
export async function startServer({dataDir=DATA,port=0,worker=true}={}){
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const dbPath=join(dataDir,'biedbot-demo.sqlite'),store=new Store(dbPath);
  store.setMeta('mode','demo');
  if(!store.getMeta('demoSeeded')){store.addCandidates(demoCandidates());store.setMeta('demoSeeded',true);}
  // Restart always requires one explicit activation. No surprise contacts after a crash/update.
  store.updateSettings({autopilot:false});store.setMeta('stopReason',null);
  const bootToken=randomBytes(32).toString('hex'),sessionToken=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  let origin='',workerThread=null,closing=false,restarting=false;
  const startWorker=()=>{
    if(!worker||closing)return;
    workerThread=new Worker(new URL('./worker/runner.mjs',import.meta.url),{workerData:{dbPath}});
    workerThread.on('error',e=>{store.updateSettings({autopilot:false});store.setMeta('stopReason','Workerfout: opnieuw starten en diagnose uitvoeren.');store.audit('WORKER_CRASH',noSecrets(e));});
    workerThread.on('exit',code=>{if(code&&!closing&&!restarting)store.setMeta('worker',{status:'failed',heartbeat:Date.now(),code});});
  };
  const stopWorker=async()=>{
    if(!workerThread)return;const w=workerThread;workerThread=null;
    await new Promise(resolve=>{const timer=setTimeout(()=>{w.terminate().then(resolve);},5000);w.once('exit',()=>{clearTimeout(timer);resolve();});w.postMessage('stop');});
  };
  const server=createServer(async(req,res)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
    const send=(status,value,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(typeof value==='string'?value:JSON.stringify(value));};
    try{
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'Ongeldige host.'});
      if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Ongeldige oorsprong.'});
      const url=new URL(req.url,origin);
      if(url.pathname==='/api/session'&&req.method==='POST'){
        const b=await body(req);if(!eq(b.token,bootToken))return send(401,{error:'Sessiecode ongeldig. Open de app via de snelkoppeling.'});
        return send(200,{csrf,version:VERSION},{'Set-Cookie':`bb_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`});
      }
      if(url.pathname.startsWith('/api/')){
        const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('bb_session='))?.slice(11);
        if(!eq(cookie,sessionToken))return send(401,{error:'Open de app via de snelkoppeling.'});
        if(req.method!=='GET'&&!eq(req.headers['x-biedbot-csrf'],csrf))return send(403,{error:'Beveiligingscode ontbreekt.'});
        if(restarting)return send(409,{error:'Demo wordt herstart. Probeer zo opnieuw.'});
        if(url.pathname==='/api/state'&&req.method==='GET')return send(200,{...store.dashboard(),version:VERSION,csrf});
        if(url.pathname==='/api/settings'&&req.method==='POST'){
          const input=await body(req);if(['autopilot','aiProvider','aiModel','pricingSetup','pricingMonthly','trialDays'].some(k=>Object.hasOwn(input,k)))throw new Error('Gebruik de daarvoor bestemde beheerfunctie; deze instellingen zijn niet vrijgegeven.');const s=store.updateSettings(input);store.rescore();return send(200,{settings:s});
        }
        if(url.pathname==='/api/autopilot'&&req.method==='POST'){
          const b=await body(req);if(typeof b.enabled!=='boolean')throw new Error('Ongeldige schakelaar.');
          if(b.enabled&&!store.settings().onboardingDone)throw new Error('Rond eerst de bedrijfsinstellingen af.');
          if(b.enabled&&store.db.prepare("SELECT id FROM outbox WHERE status='uncertain'").get())throw new Error('Onzekere verzending: eerst controleren of demo herstarten.');
          store.updateSettings({autopilot:b.enabled});store.audit(b.enabled?'AUTOPILOT_STARTED':'EMERGENCY_STOP');return send(200,{ok:true});
        }
        if(url.pathname==='/api/demo/reset'&&req.method==='POST'){
          const b=await body(req);if(b.confirm!=='DEMO HERSTARTEN')throw new Error('Bevestiging ontbreekt.');
          restarting=true;await stopWorker();store.resetDemo();store.addCandidates(demoCandidates());store.setMeta('demoSeeded',true);restarting=false;startWorker();return send(200,{ok:true});
        }
        if(url.pathname==='/api/demo/reply'&&req.method==='POST'){
          const b=await body(req);if(!store.getConversation(b.id))throw new Error('Gesprek niet gevonden.');
          store.ingest(`manual-demo-${randomUUID()}`,b.id,b.text);return send(200,{ok:true});
        }
        if(url.pathname==='/api/deal/status'&&req.method==='POST'){
          const b=await body(req);store.takeover(b.id,b.phase);return send(200,{ok:true});
        }
        if(url.pathname==='/api/export'&&req.method==='GET')return send(200,store.exportData(),{'Content-Disposition':'attachment; filename="BiedBot-demo-export.json"'});
        if(url.pathname==='/api/support'&&req.method==='GET')return send(200,{version:VERSION,platform:process.platform,node:process.version,...store.diagnostics()},{'Content-Disposition':'attachment; filename="BiedBot-support-zonder-gespreksteksten.json"'});
        if(url.pathname==='/api/backup'&&req.method==='POST'){
          const b=await body(req);if(typeof b.password!=='string'||b.password.length<12||b.password.length>200)throw new Error('Gebruik een wachtwoord van minimaal 12 tekens.');
          const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(b.password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
          const encrypted=Buffer.concat([cipher.update(JSON.stringify(store.exportData()),'utf8'),cipher.final()]);key.fill(0);
          return send(200,{format:'biedbot-export-aes256gcm-v1',kdf:'scrypt',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
        }
        if(url.pathname==='/api/open-marktplaats'&&req.method==='POST'){
          const b=findBrowser();if(!b)throw new Error('Edge of Chrome niet gevonden.');
          const child=spawn(b,[`--user-data-dir=${join(dataDir,'marktplaats-profile')}`,'--no-first-run','https://www.marktplaats.nl/'],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
          store.audit('BROWSER_OPENED','Handmatig inloggen; geen automatische acties, verbinding niet geverifieerd.');
          return send(200,{ok:true,note:'Browser geopend. Dit is geen bevestigde live-koppeling.'});
        }
        if(url.pathname==='/api/shutdown'&&req.method==='POST') {send(200,{ok:true});setTimeout(()=>close(),100);return;}
        return send(404,{error:'Onbekende API-route.'});
      }
      const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg'};
      const file=assets[url.pathname];if(!file||req.method!=='GET')return send(404,{error:'Niet gevonden.'});
      const bytes=await readFile(join(UI,file));const type=file.endsWith('.html')?TYPES['.html']:file.endsWith('.css')?TYPES['.css']:file.endsWith('.svg')?'image/svg+xml':TYPES['.js'];
      res.writeHead(200,{...headers,'Content-Type':type});res.end(bytes);
    }catch(e){send(400,{error:noSecrets(e)});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  const appUrl=`${origin}/#${bootToken}`;await writeFile(join(dataDir,'launch.json'),JSON.stringify({pid:process.pid,url:appUrl}),{mode:0o600});
  startWorker();
  async function close(){if(closing)return;closing=true;await stopWorker();await new Promise(resolve=>server.close(resolve));store.close();try{await unlink(join(dataDir,'launch.json'));}catch{}releaseInstance(dataDir);}
  return {origin,appUrl,bootToken,csrf,store,close,server};
}
async function openApp(url,dataDir){const b=findBrowser();if(b){const child=spawn(b,[`--app=${url}`,`--user-data-dir=${join(dataDir,'ui-profile')}`,'--no-first-run'],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await mkdir(DATA,{recursive:true,mode:0o700});
  const lease=acquireInstance(DATA);
  if(!lease.owned){
    // Double-clicking while startup is in progress may not erase the first process's lock.
    for(let attempt=0;attempt<20;attempt++){
      try{const prior=JSON.parse(await readFile(join(DATA,'launch.json'),'utf8'));
        if(validLaunch(prior,lease.pid)){if(process.argv.includes('--open'))await openApp(prior.url,DATA);console.log('BiedBot draait al.');process.exit(0);}
      }catch{}
      await new Promise(r=>setTimeout(r,150));
    }
    console.log('Een andere BiedBot-start of installatie is bezig. Probeer de snelkoppeling zo opnieuw.');process.exit(0);
  }
  let running;
  try{running=await startServer();}catch(e){releaseInstance(DATA);console.error('BiedBot kon niet starten:',noSecrets(e));process.exit(1);}
  console.log(`BiedBot Edge ${VERSION} · DEMO · ${running.origin}`);
  if(process.argv.includes('--open'))await openApp(running.appUrl,DATA);
  const stop=async()=>{await running.close();releaseInstance(DATA);process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
