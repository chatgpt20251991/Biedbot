import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {release} from 'node:os';

// Explicit release verification, never a background task or a live provider test.
const report=resolve('reports/revision-2026-09-08');mkdirSync(report,{recursive:true});
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!existsSync(npm))throw new Error('npm CLI niet gevonden naast Node; start via npm run verify.');
const commands=[['check','check'],['unit','test'],['evaluation','evaluate'],['dom','test:dom'],['browser','test:browser']];
if(process.platform==='win32')commands.push(['windows','test:windows']);
const results=[];
for(const [name,script] of commands){
  console.log(`Verifying ${name}...`);const started=Date.now();
  const result=spawnSync(process.execPath,[npm,...(script==='test'?['test']:['run',script])],{
    encoding:'utf8',env:{...process.env,BIEDBOT_AI_PROVIDER:'offline'},timeout:180000,maxBuffer:16*1024*1024,windowsHide:true
  });
  const output=(result.stdout||'')+(result.stderr||'')+(result.error?`\n${result.error.message}`:'');
  writeFileSync(join(report,`${name}-final.log`),output);
  const entry={name,command:script==='test'?'npm test':`npm run ${script}`,exitCode:result.status,durationMs:Date.now()-started,log:`${name}-final.log`};
  if(name==='unit')for(const field of ['tests','pass','fail','cancelled','skipped']){const match=output.match(new RegExp(`(?:ℹ|#) ${field} (\\d+)`));if(match)entry[field]=Number(match[1]);}
  results.push(entry);console.log(`${name}: ${result.status===0?'PASS':'FAIL'}`);
}
const original=JSON.parse(readFileSync('reports/original-evidence.sha256.json','utf8'));
const evidence=original.map(item=>({...item,unchanged:existsSync(item.path)&&createHash('sha256').update(readFileSync(item.path)).digest('hex')===item.sha256}));
const allPassed=results.every(r=>r.exitCode===0)&&evidence.every(r=>r.unchanged);
writeFileSync(join(report,'verification-summary.json'),JSON.stringify({executedAt:new Date().toISOString(),platform:process.platform,osRelease:release(),node:process.version,allPassed,commands:results,originalEvidence:evidence,scope:'Local tests and injected provider mocks; no live platform, AI or payment transaction.'},null,2)+'\n');
if(!allPassed)process.exitCode=1;
