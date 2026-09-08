import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UpdateManager,verifyRelease} from '../src/core/updates.mjs';

const now=Date.parse('2026-09-08T12:00:00Z');
// Private fixture keys exist only in process memory. No publisher key is shipped.
const keys=generateKeyPairSync('ed25519');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function envelope(manifest,key=keys.privateKey){const payload=Buffer.from(JSON.stringify(manifest));return {payload:payload.toString('base64url'),signature:sign(null,payload,key).toString('base64url')};}
function release(sequence=1,changes={}){return {format:'biedbot-update-v1',version:`0.1.${sequence}-test`,sequence,issuedAt:'2026-09-08T11:00:00Z',expiresAt:'2026-09-09T12:00:00Z',files:[{path:'app/main.mjs',size:4,sha256:hash('DEMO')}],...changes};}
function setup(t){
  const root=mkdtempSync(join(tmpdir(),'biedbot-update-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=join(root,'source');mkdirSync(join(source,'app'),{recursive:true});writeFileSync(join(source,'app/main.mjs'),'DEMO');
  const manager=new UpdateManager({root:join(root,'installation'),publicKey:keys.publicKey,now:()=>now});
  return {root,source,manager};
}
const verified=e=>verifyRelease(e,{publicKey:keys.publicKey,now});
test('update manifest requires pinned Ed25519 key and authentic exact payload',()=>{
  assert.equal(verified(envelope(release())).manifest.version,'0.1.1-test');
  const forged=envelope(release());forged.payload=Buffer.from(JSON.stringify(release(99))).toString('base64url');
  assert.throws(()=>verified(forged),/invalid_release_signature/);
  assert.throws(()=>verified(envelope(release(),generateKeyPairSync('ed25519').privateKey)),/invalid_release_signature/);
  assert.throws(()=>verified({...envelope(release()),signature:'AA'}),/invalid_release_signature/);
});
test('signed expired/future/replayed releases are rejected',()=>{
  assert.throws(()=>verified(envelope(release(1,{expiresAt:'2026-09-08T11:30:00Z'}))),/expired/);
  assert.throws(()=>verified(envelope(release(1,{issuedAt:'2026-09-08T13:00:00Z'}))),/not_yet_valid/);
  assert.throws(()=>verifyRelease(envelope(release()),{publicKey:keys.publicKey,now,minimumSequence:1}),/sequence/);
});
test('signed paths reject traversal, Windows aliases and case collisions',()=>{
  for(const path of ['../outside','/absolute','C:outside','app\\outside','app/../outside','app/NUL.txt','app/trailing.','app/bad :file','release-envelope.json']){
    assert.throws(()=>verified(envelope(release(1,{files:[{...release().files[0],path}]}))),/unsafe_release_path/,path);
  }
  assert.throws(()=>verified(envelope(release(1,{files:[release().files[0],{...release().files[0],path:'APP/MAIN.MJS'}]}))),/file_contract/);
  assert.throws(()=>verified(envelope(release(1,{files:[{...release().files[0],path:'app'},release().files[0]]}))),/file_directory_conflict/);
});
test('tampered source never stages or changes the current pointer',async t=>{
  const {source,manager}=setup(t);writeFileSync(join(source,'app/main.mjs'),'EVIL');
  await assert.rejects(manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:()=>true}),/hash_mismatch/);
  assert.equal(manager.state().current,null);assert.deepEqual(readdirSync(manager.versions),[]);
});
test('source symlink/junction is refused before staging',async t=>{
  const {root,source,manager}=setup(t);const junction=join(root,'junction');symlinkSync(source,junction,process.platform==='win32'?'junction':'dir');
  await assert.rejects(manager.apply({envelope:envelope(release()),sourceDirectory:junction,healthCheck:()=>true}),/symlink_not_allowed/);
  // Windows recursive delete treats junction as a link; remove only the link now.
  rmSync(junction,{recursive:true});
});
test('valid release copies only signed files and atomically activates after health acceptance',async t=>{
  const {source,manager}=setup(t);writeFileSync(join(source,'unlisted-secret.txt'),'INNOCENT_CANARY');
  const result=await manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:({directory})=>readFileSync(join(directory,'app/main.mjs'),'utf8')==='DEMO'});
  assert.equal(result.status,'activated');assert.equal(manager.state().pending,false);
  assert(!existsSync(join(manager.versions,result.id,'unlisted-secret.txt')));
  assert.equal(manager.checkInstalled(result.id),join(manager.versions,result.id));
});
test('failed health rolls back only to the prior verified release and remembers rejected sequence',async t=>{
  const {source,manager}=setup(t);
  const first=await manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:()=>true});
  const second=await manager.apply({envelope:envelope(release(2)),sourceDirectory:source,healthCheck:()=>{throw new Error('fixture startup failed');}});
  assert.equal(second.status,'rolled_back');assert.equal(manager.state().current,first.id);assert.equal(manager.state().highestSequence,2);
  await assert.rejects(manager.apply({envelope:envelope(release(2)),sourceDirectory:source,healthCheck:()=>true}),/sequence/);
});
test('corrupted previous release cannot become rollback target',async t=>{
  const {source,manager}=setup(t);
  const first=await manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:()=>true});
  writeFileSync(join(manager.versions,first.id,'app/main.mjs'),'EVIL');
  const second=await manager.apply({envelope:envelope(release(2)),sourceDirectory:source,healthCheck:()=>false});
  assert.equal(second.status,'stopped');assert.equal(manager.state().current,null);
});
test('health callback cannot make an unlisted or modified candidate trusted',async t=>{
  const {source,manager}=setup(t);
  const result=await manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:({directory})=>{writeFileSync(join(directory,'injected.mjs'),'EVIL');return true;}});
  assert.equal(result.status,'stopped');assert.equal(manager.state().current,null);
});
test('concurrent activation is locked and a interrupted pending pointer is never silently accepted',async t=>{
  const {source,manager}=setup(t);let releaseHealth,entered;
  const inHealth=new Promise(r=>entered=r),continueHealth=new Promise(r=>releaseHealth=r);
  const first=manager.apply({envelope:envelope(release()),sourceDirectory:source,healthCheck:async()=>{entered();await continueHealth;return true;}});
  await inHealth;
  await assert.rejects(manager.apply({envelope:envelope(release(2)),sourceDirectory:source,healthCheck:()=>true}),/update_in_progress/);
  releaseHealth();await first;
  manager.writeState({...manager.state(),pending:true});
  await assert.rejects(manager.apply({envelope:envelope(release(2)),sourceDirectory:source,healthCheck:()=>true}),/manual_recovery/);
});
