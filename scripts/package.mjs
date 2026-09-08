import {readdirSync,readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

// One explicit public-file contract feeds the manifest and ZIP on every OS.
const root=resolve('.');
const directories=new Set(['src','assets','docs','scripts','tests','marketing','reports','audit-overdracht']);
const topFiles=new Set(['package.json','README.md','AGENTS.md','CODEX_START_HIER.md','START_HIER.html',
  'START_BiedBot.cmd','INSTALLER_BiedBot.cmd','DESINSTALLER_BiedBot.cmd']);
const deniedDirectory=/^(?:\..*|node_modules|release|work|runtime|secrets|credentials|private|browser-profile|ui-profile|marktplaats-profile)$/i;
const deniedFile=/(?:^\.|\.(?:pem|key|p12|pfx|keystore|sqlite\d?(?:-(?:wal|shm|journal))?|db(?:-(?:wal|shm|journal))?|bak|dmp|log)$|(?:^|[-_.])(?:secret|credentials|private[-_]?key)(?:[-_.]|$))/i;
function walk(relative=''){
  return readdirSync(join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(entry=>{
    const path=relative?`${relative}/${entry.name}`:entry.name;
    if(!relative&&!directories.has(entry.name)&&!topFiles.has(entry.name))return [];
    if(entry.isSymbolicLink())throw new Error(`Symlink is not allowed in a distribution: ${path}`);
    if(entry.isDirectory())return deniedDirectory.test(entry.name)?[]:walk(path);
    if(!entry.isFile()||deniedFile.test(entry.name)||entry.name==='MANIFEST.sha256.json')return [];
    return [path];
  });
}
const contents=walk().sort().map(path=>({path,bytes:readFileSync(join(root,path))}));
const epoch=process.env.SOURCE_DATE_EPOCH===undefined?315532800:Number(process.env.SOURCE_DATE_EPOCH);
if(!Number.isInteger(epoch)||epoch<315532800||epoch>4354819199)throw new Error('SOURCE_DATE_EPOCH must be an integer in the ZIP date range 1980-2107.');
const date=new Date(epoch*1000);
const manifest={version:1,generatedAt:date.toISOString(),note:'Integrity manifest, not a publisher digital signature.',
  files:contents.map(({path,bytes})=>({path,sha256:createHash('sha256').update(bytes).digest('hex')}))};
const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(root,'MANIFEST.sha256.json'),manifestBytes);
contents.push({path:'MANIFEST.sha256.json',bytes:manifestBytes});

// Standard ZIP/deflate, UTF-8 paths and stable timestamps/permissions.
// No shell globs or platform-specific archive selection.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const dosDate=((date.getUTCFullYear()-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate();
const dosTime=(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>1);
const local=[],central=[];let offset=0;
if(contents.length>65535)throw new Error('ZIP64 is not supported; distribution contains too many files.');
for(const {path,bytes} of contents){
  const name=Buffer.from(`BiedBot_Edge/${path}`),packed=deflateRawSync(bytes,{level:9}),crc=crc32(bytes);
  if(name.length>65535||bytes.length>0xffffffff||offset+30+name.length+packed.length>0xffffffff)throw new Error('ZIP64 is not supported; distribution exceeds the size limit.');
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);
  header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(dosTime,10);header.writeUInt16LE(dosDate,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  local.push(header,name,packed);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x0314,4);header.copy(entry,6,4,30);
  entry.writeUInt32LE(0x81a40000,38);entry.writeUInt32LE(offset,42);central.push(entry,name);
  offset+=header.length+name.length+packed.length;
}
const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(contents.length,8);end.writeUInt16LE(contents.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
const release=join(root,'release');mkdirSync(release,{recursive:true});
if(lstatSync(release).isSymbolicLink())throw new Error('Release directory may not be a symlink.');
const destination=join(release,'BiedBot_Edge_Pilot.zip');
writeFileSync(destination,Buffer.concat([...local,centralBytes,end]));
console.log(`Packaged ${contents.length} explicit files: ${destination}`);
