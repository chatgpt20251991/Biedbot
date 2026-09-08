import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after} from 'node:test';
// Test processes must never inherit a dealer's live AI opt-in.
process.env.BIEDBOT_AI_PROVIDER='offline';
import {Store} from '../src/core/store.mjs';
export const NOW=Date.parse('2026-09-07T10:00:00Z');
// Suite cleanup follows every test's resource close hook. Windows cannot remove an open SQLite DB.
const tempDirs=[];
after(()=>{for(const p of tempDirs)rmSync(p,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
export function temp(t){const p=mkdtempSync(join(tmpdir(),'biedbot-test-'));if(t)tempDirs.push(p);return p;}
export function candidate(i=1,extra={}){return {id:`a-${i}`,sellerId:`s-${i}`,title:'Volkswagen Golf 2019',brand:'Volkswagen',model:'Golf',ask:10000,year:2019,mileage:80000,distanceKm:15,sellerType:'private',fit:.8,...extra};}
export function seeded(t,count=30,file=':memory:') {const s=new Store(file);s.updateSettings({budget:1000000});s.addCandidates(Array.from({length:count},(_,i)=>candidate(i+1)),NOW);t?.after(()=>s.close());return s;}
export function firstSent(s,now=NOW){s.reserveOpen('a-1','demo',now);const o=s.claimSend(now);s.sent(o.id,'receipt-first',now);return o;}
