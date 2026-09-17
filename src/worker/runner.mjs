import {isMainThread,workerData,parentPort} from 'node:worker_threads';
import {Store} from '../core/store.mjs';
import {Engine} from './engine.mjs';
import {DemoAdapter} from '../adapters/demo.mjs';
import {createWorkerClassifier} from './classifier.mjs';
import {createWorkerWriter} from './writer.mjs';
import {join} from 'node:path';
const path=workerData?.dbPath||process.env.BIEDBOT_DB||join(process.cwd(),'.data','biedbot-demo.sqlite');
const store=new Store(path);store.recover();
// This release is isolated demo. A production adapter cannot be selected via settings.
const adapter=new DemoAdapter(store);let classifier,writer;
try{classifier=createWorkerClassifier({store});writer=createWorkerWriter({store});}
catch(error){store.updateSettings({autopilot:false});store.setMeta('stopReason',error.message);store.close();throw error;}
store.setMeta('aiRuntime',{provider:classifier?'anthropic':'offline',model:classifier?.model||null,writer:writer?'anthropic':'offline',writerModel:writer?.model||null});
const engine=new Engine(store,adapter,{classifier,writer});
let stop=false;const interval=setInterval(()=>{if(!stop)engine.tick();},900);
const shutdown=async()=>{stop=true;clearInterval(interval);while(engine.busy)await new Promise(r=>setTimeout(r,30));store.close();parentPort?.postMessage({type:'stopped'});process.exit(0);};
parentPort?.on('message',m=>{if(m==='stop')shutdown();});
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
if(isMainThread)console.log('BiedBot worker gestart in geïsoleerde DEMO, geen echte verkopers.');
