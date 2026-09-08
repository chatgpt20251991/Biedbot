import {createHash,createPublicKey,verify,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function decode(value){if(typeof value!=='string'||!value||value.length>1400000||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('invalid_base64url');const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw new Error('noncanonical_base64url');return bytes;}
function safePath(path){
  if(typeof path!=='string'||path.length>220||path!==path.normalize('NFC')||path.includes('\\')||path.startsWith('/')||path.includes(':'))throw new Error('unsafe_release_path');
  if(path==='release-envelope.json'||path.split('/').some(part=>!part||part==='.'||part==='..'||/[\x00-\x1f<>"|?*]|[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw new Error('unsafe_release_path');
  return path;
}
function noLinks(path){
  let current=resolve(path);
  while(true){if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('symlink_not_allowed');const parent=dirname(current);if(parent===current)break;current=parent;}
}
/** Signature authenticates the exact payload bytes; the public key is pinned by
 * the embedding application, never accepted from the release itself. */
export function verifyRelease(envelope,{publicKey,now=Date.now(),minimumSequence=0,allowExpired=false}={}){
  const key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
  if(key.asymmetricKeyType!=='ed25519')throw new Error('ed25519_key_required');
  const payload=decode(envelope?.payload),signature=decode(envelope?.signature);
  if(payload.length>1024*1024||signature.length!==64||!verify(null,payload,key,signature))throw new Error('invalid_release_signature');
  const manifest=JSON.parse(payload.toString('utf8'));
  const issued=Date.parse(manifest.issuedAt),expires=Date.parse(manifest.expiresAt);
  if(manifest.format!=='biedbot-update-v1'||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)||!Number.isSafeInteger(manifest.sequence)||manifest.sequence<1||manifest.sequence<=minimumSequence)throw new Error('invalid_version_or_sequence');
  if(!Number.isFinite(now)||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now||expires<=issued||(!allowExpired&&expires<=now))throw new Error('release_expired_or_not_yet_valid');
  if(!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>10000)throw new Error('invalid_file_contract');
  const seen=new Set();let total=0;
  for(const file of manifest.files){
    safePath(file.path);const lower=file.path.toLowerCase();
    if(seen.has(lower)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<0||file.size>64*1024*1024)throw new Error('invalid_file_contract');
    seen.add(lower);total+=file.size;
  }
  if(total>256*1024*1024)throw new Error('release_too_large');
  for(const path of seen)for(const parent of path.split('/').slice(0,-1).map((_,index)=>path.split('/').slice(0,index+1).join('/')))if(seen.has(parent))throw new Error('file_directory_conflict');
  const id=`${manifest.sequence}-${digest(payload).slice(0,24)}`;
  return {manifest,id};
}
function verifiedBytes(directory,manifest){
  noLinks(directory);
  return manifest.files.map(file=>{
    const path=join(directory,file.path);noLinks(path);
    const stat=lstatSync(path);
    if(!stat.isFile()||stat.size!==file.size)throw new Error('release_file_size_mismatch');
    const bytes=readFileSync(path);if(bytes.length!==file.size||digest(bytes)!==file.sha256)throw new Error('release_file_hash_mismatch');
    return {path:file.path,bytes};
  });
}
function exactInstalledFiles(directory,manifest){
  const expected=new Set([...manifest.files.map(file=>file.path),'release-envelope.json']);
  function walk(relative=''){
    for(const entry of readdirSync(join(directory,relative),{withFileTypes:true})){
      const path=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())throw new Error('symlink_not_allowed');
      if(entry.isDirectory())walk(path);
      else if(!entry.isFile()||!expected.delete(path))throw new Error('unlisted_installed_file');
    }
  }
  walk();if(expected.size)throw new Error('missing_installed_file');
}
function validateState(state){
  const valid=id=>id===null||typeof id==='string'&&/^[1-9][0-9]*-[a-f0-9]{24}$/.test(id);
  if(state.format!=='biedbot-update-state-v1'||!valid(state.current)||!valid(state.previous)||!Number.isSafeInteger(state.highestSequence)||state.highestSequence<0)throw new Error('invalid_update_state');
  return state;
}

/** Offline integration primitive. No download, scheduler, process execution,
 * signing service or production launcher is enabled by this module. */
export class UpdateManager {
  constructor({root,publicKey,now=()=>Date.now()}){
    this.root=resolve(root);this.publicKey=publicKey;this.now=now;
    noLinks(this.root);mkdirSync(this.root,{recursive:true});noLinks(this.root);
    this.versions=join(this.root,'versions');noLinks(this.versions);mkdirSync(this.versions,{recursive:true});
  }
  state(){const path=join(this.root,'current.json');noLinks(path);return existsSync(path)?validateState(JSON.parse(readFileSync(path,'utf8'))):{format:'biedbot-update-state-v1',current:null,previous:null,highestSequence:0};}
  writeState(state){
    validateState(state);noLinks(this.root);noLinks(join(this.root,'current.json'));
    const temporary=join(this.root,`.pointer-${randomUUID()}.json`);
    writeFileSync(temporary,JSON.stringify(state)+'\n',{flag:'wx',mode:0o600});
    renameSync(temporary,join(this.root,'current.json'));
  }
  checkInstalled(id,{allowExpired=false}={}){
    if(!/^[1-9][0-9]*-[a-f0-9]{24}$/.test(id))throw new Error('invalid_installed_release');
    const directory=join(this.versions,id);noLinks(directory);noLinks(join(directory,'release-envelope.json'));
    const envelope=JSON.parse(readFileSync(join(directory,'release-envelope.json'),'utf8'));
    const verified=verifyRelease(envelope,{publicKey:this.publicKey,now:this.now(),allowExpired});
    if(verified.id!==id)throw new Error('installed_identity_mismatch');
    verifiedBytes(directory,verified.manifest);exactInstalledFiles(directory,verified.manifest);return directory;
  }
  async apply({envelope,sourceDirectory,healthCheck}){
    if(typeof healthCheck!=='function')throw new Error('health_check_required');
    noLinks(this.root);noLinks(this.versions);
    const lockPath=join(this.root,'update.lock');let lock;
    try{lock=openSync(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw new Error('update_in_progress_or_recovery_required');throw error;}
    let staging;
    try{
      const previous=this.state();
      if(previous.pending)throw new Error('interrupted_activation_requires_manual_recovery');
      const {manifest,id}=verifyRelease(envelope,{publicKey:this.publicKey,now:this.now(),minimumSequence:previous.highestSequence});
      const files=verifiedBytes(resolve(sourceDirectory),manifest),destination=join(this.versions,id);
      noLinks(destination);if(existsSync(destination))throw new Error('immutable_release_already_exists');
      staging=join(this.versions,`.staging-${randomUUID()}`);mkdirSync(staging);
      for(const file of files){const target=join(staging,file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.bytes,{flag:'wx',mode:0o600});}
      writeFileSync(join(staging,'release-envelope.json'),JSON.stringify(envelope),{flag:'wx',mode:0o600});
      // Hash the staged bytes as well before publishing the immutable directory.
      verifiedBytes(staging,manifest);renameSync(staging,destination);staging=null;
      const candidate={format:'biedbot-update-state-v1',current:id,previous:previous.current,highestSequence:manifest.sequence,pending:true};
      this.writeState(candidate);
      let healthy=false;
      try{healthy=await healthCheck({directory:destination,version:manifest.version,sequence:manifest.sequence})===true;}catch{}
      if(healthy){
        try{this.checkInstalled(id);}catch{healthy=false;}
      }
      if(healthy){this.writeState({...candidate,pending:false});return {status:'activated',id,previous:previous.current};}
      let rollback=null;
      if(previous.current){try{this.checkInstalled(previous.current,{allowExpired:true});rollback=previous.current;}catch{}}
      this.writeState({...previous,current:rollback,highestSequence:manifest.sequence,pending:false});
      return {status:rollback?'rolled_back':'stopped',rejected:id,current:rollback};
    } finally {
      if(staging){noLinks(staging);if(dirname(staging)!==this.versions||!staging.startsWith(join(this.versions,'.staging-')))throw new Error('unsafe_staging_cleanup');rmSync(staging,{recursive:true,force:true});}
      closeSync(lock);unlinkSync(lockPath);
    }
  }
}
