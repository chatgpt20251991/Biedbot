import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
/** Pipes by default; Windows local fixtures use an ephemeral loopback WebSocket in a disposable profile. */
export function findBrowser(){
  const candidates=process.platform==='win32' ? [
    join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
    join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe'),
    join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe')
  ] : ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find(existsSync)||null;
}
export class CDPBrowser {
  constructor(){this.pending=new Map();this.sequence=0;this.buffer='';this.closed=false;}
  async launch({profileDir,browserPath=findBrowser(),fixtureTest=false}={}){
    if(!browserPath)throw new Error('Microsoft Edge of Google Chrome niet gevonden.');
    if(!profileDir)throw new Error('Eigen browserprofiel is verplicht.');
    profileDir=resolve(profileDir);
    mkdirSync(profileDir,{recursive:true,mode:0o700});
    const websocket=process.platform==='win32'&&fixtureTest;
    const args=[...(websocket?['--remote-debugging-address=127.0.0.1','--remote-debugging-port=0']:['--remote-debugging-pipe']),`--user-data-dir=${profileDir}`,'--no-first-run','--no-default-browser-check','--disable-sync'];
    if(fixtureTest){args.push('--headless=new','--disable-gpu');if(process.platform==='linux'&&process.getuid?.()===0)args.push('--no-sandbox');}
    args.push('about:blank');
    this.child=spawn(browserPath,args,{stdio:['ignore','ignore','pipe','pipe','pipe'],windowsHide:fixtureTest});
    let browserError='';this.child.stderr.on('data',data=>{browserError=(browserError+data.toString()).slice(-3000);});
    // Edge on Windows may hand off to a browser process and exit its launcher with code 0.
    // In fixture WebSocket mode the socket owns connection lifetime, not that launcher PID.
    this.child.on('error',e=>this.fail(e));this.child.on('exit',(code)=>{if(!websocket||code!==0)this.fail(new Error(`Browser afgesloten (${code}): ${browserError}`));});
    if(websocket){
      const deadline=Date.now()+10000;let endpoint;
      while(Date.now()<deadline&&!this.closed){
        try{const [port,path]=readFileSync(join(profileDir,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);if(/^\d+$/.test(port)&&Number(port)>0&&Number(port)<65536&&/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(path)){endpoint=`ws://127.0.0.1:${port}${path}`;break;}}catch{}
        await new Promise(r=>setTimeout(r,75));
      }
      if(!endpoint){await this.close();throw new Error('Edge fixture-debugger startte niet; controleer browserlog of beheerdersbeleid.');}
      this.socket=new WebSocket(endpoint);
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser WebSocket-timeout.')),5000);this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});this.socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Browser WebSocket kon niet verbinden.'));},{once:true});});
      this.socket.addEventListener('message',event=>this.receive(JSON.parse(event.data)));
      this.socket.addEventListener('close',()=>this.fail(new Error('Browserverbinding gesloten.')));
    }else {this.child.stdio[4].setEncoding('utf8');this.child.stdio[4].on('data',data=>{
      this.buffer+=data;if(this.buffer.length>16000000)return this.fail(new Error('Browserantwoord te groot.'));
      let index;while((index=this.buffer.indexOf('\0'))>=0){const frame=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);
        if(!frame)continue;let msg;try{msg=JSON.parse(frame);}catch{continue;}
        this.receive(msg);
      }
    });}
    await this.call('Browser.getVersion');
    const target=await this.call('Target.createTarget',{url:'about:blank'});
    const attached=await this.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    this.session=attached.sessionId;await this.call('Page.enable',{},this.session);return this;
  }
  receive(msg){const entry=this.pending.get(msg.id);if(entry){clearTimeout(entry.timer);this.pending.delete(msg.id);msg.error?entry.reject(new Error(msg.error.message)):entry.resolve(msg.result);}}
  fail(error){this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  call(method,params={},sessionId,timeout=10000){
    if(this.closed)return Promise.reject(new Error('Browserverbinding gesloten.'));
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Browser-timeout: ${method}`));},timeout);
      this.pending.set(id,{resolve,reject,timer});const message=JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})});if(this.socket)this.socket.send(message);else this.child.stdio[3].write(message+'\0');
    });
  }
  async evaluate(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},this.session);
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'Browserfout');return r.result?.value;
  }
  async navigate(url,{allowFragmentRemoval=false}={}){const r=await this.call('Page.navigate',{url},this.session);if(r.errorText)throw new Error(r.errorText);
    const target=new URL(url);target.hash='';
    await this.waitFor(`(location.href === ${JSON.stringify(url)} ${allowFragmentRemoval?`|| location.href === ${JSON.stringify(target.href)}`:''}) && document.readyState === 'complete'`,10000);
  }
  async waitFor(expression,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await this.evaluate(expression))return true;await new Promise(r=>setTimeout(r,75));}throw new Error('Pagina voldoet niet aan het geteste contract.');}
  async close(){if(!this.closed)try{await this.call('Browser.close',{},undefined,2000);}catch{}this.socket?.close();if(this.child&&this.child.exitCode===null){const exited=new Promise(r=>this.child.once('exit',r));this.child.kill();await Promise.race([exited,new Promise(r=>setTimeout(r,2000))]);}this.fail(new Error('Browser gesloten.'));}
}
