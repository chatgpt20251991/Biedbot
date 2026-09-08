import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

// Explicit acceptance command, excluded from generic unit runs. Every install,
// shortcut, runtime, browser profile and data path lives in this workspace.
if(process.platform!=='win32')throw new Error('Windows acceptance requires a real Windows host.');
const repository=resolve('.'),report=join(repository,'reports/revision-2026-09-08/windows');
mkdirSync(report,{recursive:true});
const testBase=join(repository,'.windows-acceptance');mkdirSync(testBase,{recursive:true});
const scratch=mkdtempSync(join(testBase,'run-'));
const unicodeRoot=join(scratch,'Gebruiker Zoë 李 & Co'),source=join(unicodeRoot,'pakket bron');
const app=join(unicodeRoot,'Lokale App'),data=join(unicodeRoot,'Lokale Gegevens'),desktop=join(unicodeRoot,'Eigen Bureaublad');
mkdirSync(source,{recursive:true});
for(const name of ['src','scripts','assets','package.json','README.md'])cpSync(join(repository,name),join(source,name),{recursive:true});
const results=[];
function run(file,args,{expected=0,env=process.env,label='command',input}={}){
  const result=spawnSync(file,args,{cwd:source,encoding:'utf8',windowsHide:true,timeout:90000,env,input});
  writeFileSync(join(report,label+'.txt'),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));
  if(expected===0)assert.equal(result.status,0,`${label}: ${result.stdout}\n${result.stderr}\n${result.error||''}`);
  else assert.notEqual(result.status,0,`${label} should stop safely`);
  return result;
}
function ps(script,args,options){return run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args],options);}
async function waitFor(predicate,label){for(let i=0;i<160;i++){if(predicate())return;await delay(125);}throw new Error(`Timed out waiting for ${label}`);}
function copyLogs(label,root){if(existsSync(root))cpSync(root,join(report,label),{recursive:true});}
let session;
try {
  run(process.execPath,[join(source,'scripts/package.mjs')],{label:'acceptance-package'});
  const extractScript=join(scratch,'extract.ps1'),unpacked=join(unicodeRoot,'uitgepakt pakket');
  writeFileSync(extractScript,'param([string]$Archive,[string]$Destination)\n$ErrorActionPreference="Stop"\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination\n');
  ps(extractScript,['-Archive',join(source,'release/BiedBot_Edge_Pilot.zip'),'-Destination',unpacked],{label:'acceptance-extract'});
  const packageRoot=join(unpacked,'BiedBot_Edge'),installer=join(packageRoot,'scripts/Install.ps1');
  const uninstaller=join(packageRoot,'scripts/Uninstall.ps1');
  const args=['-AppRoot',app,'-DataRoot',data,'-DesktopDirectory',desktop];
  const offline=ps(installer,[...args,'-Offline'],{label:'acceptance-offline',expected:1});
  assert.match(offline.stdout+offline.stderr,/OFFLINE_RUNTIME_ONTBREEKT/);
  assert(!existsSync(join(app,'current-version.txt')));results.push({check:'offline without runtime stops before activation',status:'passed'});
  const fake=join(scratch,'unsigned.exe');writeFileSync(fake,'INNOCENT_UNSIGNED_RUNTIME_CANARY');
  const unsigned=ps(installer,[...args,'-RuntimePath',fake,'-Offline'],{label:'acceptance-unsigned-runtime',expected:1});
  assert.match(unsigned.stdout+unsigned.stderr,/handtekening/);
  assert(!existsSync(join(app,'runtime/node.exe')));results.push({check:'unsigned runtime refused before execution',status:'passed'});
  ps(installer,[...args,'-RuntimePath',process.execPath,'-Offline'],{label:'acceptance-install'});
  assert(existsSync(join(desktop,'BiedBot Edge.lnk')));
  const launcher=join(app,'BiedBot-Open.vbs'),launcherBytes=readFileSync(launcher);
  assert.equal(launcherBytes.readUInt16LE(0),0xfeff);assert(launcherBytes.toString('utf16le').includes('Zoë 李 & Co'));
  const recordBefore=readFileSync(join(app,'installation.json'));
  const badDesktop=join(unicodeRoot,'desktop-is-a-file');writeFileSync(badDesktop,'INNOCENT_FAILURE_FIXTURE');
  const updatedPackage=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));updatedPackage.version='0.1.0-acceptance.rollback';
  writeFileSync(join(source,'package.json'),JSON.stringify(updatedPackage));
  run(process.execPath,[join(source,'scripts/package.mjs')],{label:'acceptance-failed-update-package'});
  ps(join(source,'scripts/Install.ps1'),['-AppRoot',app,'-DataRoot',data,'-DesktopDirectory',badDesktop,'-Offline'],{label:'acceptance-activation-rollback',expected:1});
  assert.deepEqual(readFileSync(launcher),launcherBytes);assert.deepEqual(readFileSync(join(app,'installation.json')),recordBefore);
  assert(!existsSync(join(app,'versions/0.1.0-acceptance.rollback')));
  assert(!readdirSync(join(app,'versions')).some(name=>name.includes('.staging-')));
  results.push({check:'failed local activation restores previous installation and removes staged version',status:'passed'});
  const missingBrowserEnv={...process.env,BIEDBOT_DATA_DIR:data,ProgramFiles:join(scratch,'no-browser'), 'ProgramFiles(x86)':join(scratch,'no-browser-x86')};
  // Remove case-equivalent inherited keys before constructing Windows env.
  for(const key of Object.keys(missingBrowserEnv))if(['programfiles','programfiles(x86)'].includes(key.toLowerCase())&&!['ProgramFiles','ProgramFiles(x86)'].includes(key))delete missingBrowserEnv[key];
  const missingBrowser=ps(join(packageRoot,'scripts/Start-App.ps1'),['-NodePath',join(app,'runtime/node.exe'),'-NoErrorDialog'],{label:'acceptance-missing-browser',expected:1,env:missingBrowserEnv});
  assert.match(missingBrowser.stdout+missingBrowser.stderr,/BROWSER_ONTBREEKT/);
  assert(!existsSync(join(data,'launch.json')));assert(readdirSync(join(data,'logs')).some(name=>name.endsWith('-failure.txt')));
  results.push({check:'missing browser stops before launch with a persisted diagnostic',status:'passed'});
  run('cscript.exe',['//nologo',launcher,'/headless'],{label:'acceptance-unicode-launcher'});
  await waitFor(()=>existsSync(join(data,'launch.json')),'launched server');
  const launch=JSON.parse(readFileSync(join(data,'launch.json'),'utf8')),url=new URL(launch.url);
  const response=await fetch(url.origin+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:url.hash.slice(1)})});
  assert.equal(response.status,200);
  const state=await response.json();session={origin:url.origin,cookie:response.headers.get('set-cookie').split(';')[0],csrf:state.csrf};
  const dashboard=await fetch(session.origin+'/api/state',{headers:{cookie:session.cookie}});
  assert.equal(dashboard.status,200);assert.equal((await dashboard.json()).settings.autopilot,false);
  results.push({check:'UTF-16 VBS starts real HTTP agent and worker in Unicode/space/ampersand path',status:'passed',pid:launch.pid});
  const running=ps(uninstaller,['-AppRoot',app,'-ConfirmAppRemoval','VERWIJDER APP'],{label:'acceptance-uninstall-running',expected:1});
  assert.match(running.stdout+running.stderr,/Sluit BiedBot eerst/);assert(existsSync(app));
  results.push({check:'uninstall refuses a running agent',status:'passed'});
  const shutdown=await fetch(session.origin+'/api/shutdown',{method:'POST',headers:{cookie:session.cookie,'x-biedbot-csrf':session.csrf}});
  assert.equal(shutdown.status,200);session=null;
  await waitFor(()=>!existsSync(join(data,'app.lock')),'clean shutdown');
  await delay(300);
  copyLogs('installation-logs',join(app,'logs'));copyLogs('start-logs',join(data,'logs'));
  writeFileSync(join(data,'preserve-me.txt'),'user-data-canary');
  ps(uninstaller,['-AppRoot',app,'-ConfirmAppRemoval','VERWIJDER APP'],{label:'acceptance-uninstall-preserve-data'});
  assert(!existsSync(app));assert(!existsSync(join(desktop,'BiedBot Edge.lnk')));
  assert.equal(readFileSync(join(data,'preserve-me.txt'),'utf8'),'user-data-canary');
  results.push({check:'uninstall removes isolated app/shortcut and preserves data by default',status:'passed'});
  ps(installer,[...args,'-RuntimePath',process.execPath,'-Offline'],{label:'acceptance-reinstall'});
  ps(uninstaller,['-AppRoot',app,'-ConfirmAppRemoval','VERWIJDER APP','-RemoveLocalData','-ConfirmDataRemoval','OOK MIJN GEGEVENS'],{label:'acceptance-uninstall-explicit-data'});
  assert(!existsSync(data));results.push({check:'explicit second confirmation removes isolated data',status:'passed'});
  writeFileSync(join(report,'acceptance-summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),platform:process.platform,node:process.version,
    scope:'One real Windows host, PowerShell 5.1, existing officially signed Node; extracted ZIP; isolated paths. Headless launcher switch starts real agent without opening a browser window.',
    unproven:['clean Windows 11 without Node','second independent machine','real runtime network download','SmartScreen and antivirus acceptance','publisher signing','production update channel and integrated update/rollback acceptance'],results},null,2));
  console.log(JSON.stringify(results,null,2));
} finally {
  if(session)try{await fetch(session.origin+'/api/shutdown',{method:'POST',headers:{cookie:session.cookie,'x-biedbot-csrf':session.csrf}});await delay(1000);}catch{}
  // Keep failed installations for diagnosis. Successful runs remove only the
  // exact workspace child created by mkdtemp; no user's default paths are used.
  if(results.length===8){assert(scratch.startsWith(testBase+'\\'));rmSync(scratch,{recursive:true,force:true});}
}
