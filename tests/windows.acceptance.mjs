import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

// Explicit acceptance command, excluded from generic unit runs. Every install,
// shortcut, runtime, browser profile and data path lives in this workspace.
if(process.platform!=='win32')throw new Error('Windows acceptance requires a real Windows host.');
const repository=resolve('.'),report=join(process.env.BIEDBOT_REPORT_DIR||join(repository,'reports/revision-2026-09-08'),'windows');
mkdirSync(report,{recursive:true});
const results=[],startedAt=new Date().toISOString();
let outcome='running',failure=null,activeCommand=null;
function writeSummary(){
  writeFileSync(join(report,'acceptance-summary.json'),JSON.stringify({startedAt,generatedAt:new Date().toISOString(),status:outcome,
    allPassed:outcome==='passed',platform:process.platform,node:process.version,activeCommand,error:failure,
    scope:'One real Windows host, PowerShell 5.1, existing officially signed Node; extracted ZIP; isolated paths. Headless launcher switch starts real agent without opening a browser window.',
    unproven:['clean Windows 11 without Node','second independent machine','real runtime network download','SmartScreen and antivirus acceptance','publisher signing','production update channel and integrated update/rollback acceptance'],results},null,2));
}
// Replace any checked-in success before work starts; interruption must not expose an old green result.
writeSummary();
const testBase=join(repository,'.windows-acceptance');mkdirSync(testBase,{recursive:true});
const scratch=mkdtempSync(join(testBase,'run-'));
const unicodeRoot=join(scratch,'Gebruiker Zoë 李 & Co'),source=join(unicodeRoot,'pakket bron');
const app=join(unicodeRoot,'Lokale App'),data=join(unicodeRoot,'Lokale Gegevens'),desktop=join(unicodeRoot,'Eigen Bureaublad');
function run(file,args,{expected=0,env=process.env,label='command',input}={}){
  activeCommand=label;writeSummary();
  const result=spawnSync(file,args,{cwd:source,encoding:'utf8',windowsHide:true,timeout:90000,env,input});
  writeFileSync(join(report,label+'.txt'),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));
  // A timeout or spawn failure is never evidence that a negative acceptance case stopped safely.
  assert.ifError(result.error);assert.equal(typeof result.status,'number',`${label}: process did not exit normally`);
  if(expected===0)assert.equal(result.status,0,`${label}: ${result.stdout}\n${result.stderr}\n${result.error||''}`);
  else assert.notEqual(result.status,0,`${label} should stop safely`);
  return result;
}
function ps(script,args,options){return run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args],options);}
async function waitFor(predicate,label){for(let i=0;i<160;i++){if(predicate())return;await delay(125);}throw new Error(`Timed out waiting for ${label}`);}
function copyLogs(label,root){if(existsSync(root))cpSync(root,join(report,label),{recursive:true});}
let session;
try {
  mkdirSync(source,{recursive:true});
  for(const name of ['src','scripts','assets','package.json','README.md'])cpSync(join(repository,name),join(source,name),{recursive:true});
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
  // Windows PowerShell resets ProgramFiles from ProgramW6432 during process startup.
  // Set the fixture paths afterwards, then invoke the real starter in that same process.
  const missingBrowserScript=join(scratch,'missing-browser.ps1'),missingBrowserRoot=join(scratch,'no-browser');
  writeFileSync(missingBrowserScript,`param([string]$Starter,[string]$Runtime,[string]$Data,[string]$MissingBrowserRoot)
$ErrorActionPreference='Stop'
$env:BIEDBOT_DATA_DIR=$Data
$env:ProgramFiles=Join-Path $MissingBrowserRoot 'x64'
Set-Item -LiteralPath 'Env:ProgramFiles(x86)' -Value (Join-Path $MissingBrowserRoot 'x86')
if (Test-Path -LiteralPath $MissingBrowserRoot) { throw 'Missing-browser fixture must refer to absent directories.' }
& $Starter -NodePath $Runtime -NoErrorDialog
`);
  const missingBrowser=ps(missingBrowserScript,['-Starter',join(packageRoot,'scripts/Start-App.ps1'),'-Runtime',join(app,'runtime/node.exe'),'-Data',data,'-MissingBrowserRoot',missingBrowserRoot],{label:'acceptance-missing-browser',expected:1});
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
  outcome='passed';activeCommand=null;
  console.log(JSON.stringify(results,null,2));
} catch(error) {
  outcome='failed';failure={name:error.name,message:error.message,code:error.code};throw error;
} finally {
  try {
  if(session)try{await fetch(session.origin+'/api/shutdown',{method:'POST',headers:{cookie:session.cookie,'x-biedbot-csrf':session.csrf}});await delay(1000);}catch{}
  // Keep failed installations for diagnosis. Successful runs remove only the
  // exact workspace child created by mkdtemp; no user's default paths are used.
  if(outcome==='passed'){assert(scratch.startsWith(testBase+'\\'));rmSync(scratch,{recursive:true,force:true});}
  } catch(error) {
    outcome='failed';failure={name:error.name,message:error.message,code:error.code};throw error;
  } finally {writeSummary();}
}
