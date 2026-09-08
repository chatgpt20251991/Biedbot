import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {join} from 'node:path';
export function processAlive(pid){if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
export function acquireInstance(dataDir,{pid=process.pid,alive=processAlive}={}){
 const path=join(dataDir,'app.lock');
 if(existsSync(path)){
   const text=readFileSync(path,'utf8').trim(),other=Number(text);
   // Another process may have created the file but not written its PID yet.
   if(!text||!Number.isSafeInteger(other)||other<1)return {owned:false,pid:null,starting:true};
   if(alive(other))return {owned:false,pid:other,starting:false};
   try{unlinkSync(path);}catch{return{owned:false,pid:other,starting:true};}
 }
 try{writeFileSync(path,String(pid),{flag:'wx',mode:0o600});return{owned:true,pid};}catch(e){if(e.code==='EEXIST')return{owned:false,pid:null,starting:true};throw e;}
}
export function releaseInstance(dataDir,pid=process.pid){const p=join(dataDir,'app.lock');try{if(readFileSync(p,'utf8').trim()===String(pid))unlinkSync(p);}catch{}}
export function validLaunch(value,expectedPid){try{const u=new URL(value.url);return value.pid===expectedPid&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!!u.port&&/^#[0-9a-f]{64}$/.test(u.hash)&&!u.username&&!u.password;}catch{return false;}}
