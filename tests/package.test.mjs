import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';

// Read actual ZIP entries, not the packager's own in-memory selection.
function entries(bytes){
  const result=new Map(),end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  let offset=bytes.readUInt32LE(end+16);
  while(bytes.readUInt32LE(offset)===0x02014b50){
    const method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20);
    const nameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32);
    const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
    const local=bytes.readUInt32LE(offset+42);
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),compressed=bytes.subarray(start,start+size);
    assert.equal(result.has(name),false,`duplicate ZIP entry ${name}`);
    result.set(name,method===8?inflateRawSync(compressed):compressed);offset+=46+nameLength+extraLength+commentLength;
  }
  return result;
}
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'biedbot-package-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const put=(path,value)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,value);};
  put('package.json','{"version":"0.1.0-test"}');
  put('src/main.mjs','export const demo = true;');put('docs/sub/map.txt','intended nested structure');
  put('assets/voertuig-é.png','innocent unicode asset');put('README.md','Demo');
  for(const path of ['.env','src/.env.local','docs/issuer.pem','src/state.sqlite','src/state.sqlite-wal',
    'docs/KEY.PEM','assets/private.pfx','src/session.db','src/.secrets/token.txt','node_modules/ignored.txt',
    'release/old.zip','unexpected-private-directory/account.txt'])put(path,'INNOCENT_SECRET_CANARY');
  return root;
}
function pack(root){
  const result=spawnSync(process.execPath,[resolve('scripts/package.mjs')],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  return readFileSync(join(root,'release/BiedBot_Edge_Pilot.zip'));
}
test('distribution ZIP contains exactly the public manifest list and preserves nested paths',t=>{
  const root=fixture(t),zip=entries(pack(root));
  for(const [name,body] of zip){assert(!body.includes('INNOCENT_SECRET_CANARY'),`excluded canary leaked: ${name}`);}
  assert(zip.has('BiedBot_Edge/MANIFEST.sha256.json'),'all platforms use the BiedBot_Edge root');
  const manifest=JSON.parse(zip.get('BiedBot_Edge/MANIFEST.sha256.json'));
  assert(zip.has('BiedBot_Edge/docs/sub/map.txt'));
  assert(zip.has('BiedBot_Edge/assets/voertuig-é.png'));
  assert.deepEqual([...zip.keys()].sort(),[...manifest.files.map(f=>'BiedBot_Edge/'+f.path),'BiedBot_Edge/MANIFEST.sha256.json'].sort());
  for(const [name,body] of zip){assert(!body.includes('INNOCENT_SECRET_CANARY'),`excluded canary leaked: ${name}`);}
  for(const file of manifest.files)assert.equal(createHash('sha256').update(zip.get('BiedBot_Edge/'+file.path)).digest('hex'),file.sha256);
});
test('packaging identical input twice produces a byte-identical distribution',t=>{
  const root=fixture(t);assert.deepEqual(pack(root),pack(root));
});
test('Windows installer writes the path-bearing launcher in Unicode',()=>{
  const script=readFileSync(new URL('../scripts/Install.ps1',import.meta.url),'utf8');
  assert.match(script,/Set-Content[^\n]*\$launcherPath[^\n]*-Encoding Unicode/);
});
