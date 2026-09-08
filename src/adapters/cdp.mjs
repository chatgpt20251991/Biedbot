import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
/** Chromium DevTools over inherited OS pipes, not an exposed debugging TCP port. No stealth/proxy flags. */
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
    mkdirSync(profileDir,{recursive:true,mode:0o700});
    const args=['--remote-debugging-pipe',`--user-data-dir=${profileDir}`,'--no-first-run','--no-default-browser-check','--disable-sync'];
    if(fixtureTest){args.push('--headless=new','--disable-gpu');if(process.platform==='linux'&&process.getuid?.()===0)args.push('--no-sandbox');}
    args.push('about:blank');
    this.child=spawn(browserPath,args,{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:fixtureTest});
    this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>this.fail(new Error('Browser afgesloten.')));
    this.child.stdio[4].setEncoding('utf8');this.child.stdio[4].on('data',data=>{
      this.buffer+=data;if(this.buffer.length>16000000)return this.fail(new Error('Browserantwoord te groot.'));
      let index;while((index=this.buffer.indexOf('\0'))>=0){const frame=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);
        if(!frame)continue;let msg;try{msg=JSON.parse(frame);}catch{continue;}
        const entry=this.pending.get(msg.id);if(entry){clearTimeout(entry.timer);this.pending.delete(msg.id);msg.error?entry.reject(new Error(msg.error.message)):entry.resolve(msg.result);}
      }
    });
    await this.call('Browser.getVersion');
    const target=await this.call('Target.createTarget',{url:'about:blank'});
    const attached=await this.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    this.session=attached.sessionId;await this.call('Page.enable',{},this.session);return this;
  }
  fail(error){this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  call(method,params={},sessionId,timeout=10000){
    if(this.closed)return Promise.reject(new Error('Browserverbinding gesloten.'));
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Browser-timeout: ${method}`));},timeout);
      this.pending.set(id,{resolve,reject,timer});this.child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
    });
  }
  async evaluate(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},this.session);
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'Browserfout');return r.result?.value;
  }
  async navigate(url){const r=await this.call('Page.navigate',{url},this.session);if(r.errorText)throw new Error(r.errorText);
    await this.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`,10000);
  }
  async waitFor(expression,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await this.evaluate(expression))return true;await new Promise(r=>setTimeout(r,75));}throw new Error('Pagina voldoet niet aan het geteste contract.');}
  async close(){if(this.closed)return;try{await this.call('Browser.close',{},undefined,2000);}catch{}this.child?.kill();this.fail(new Error('Browser gesloten.'));}
}
