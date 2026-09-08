import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join,relative,resolve} from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=resolve('.'),skip=new Set(['.git','.data','.runtime','node_modules','release']);
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(x=>skip.has(x.name)?[]:x.isDirectory()?walk(join(p,x.name)):[join(p,x.name)]);}
const files=walk(root).filter(f=>!f.endsWith('MANIFEST.sha256.json')&&!/\.sqlite(?:-wal|-shm)?$|\.pem$|(^|[/\\])\.env/.test(f)).map(f=>({path:relative(root,f).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(f)).digest('hex')}));
writeFileSync('MANIFEST.sha256.json',JSON.stringify({version:1,generatedAt:new Date().toISOString(),note:'Integrity manifest, not a publisher digital signature.',files},null,2));
mkdirSync('release',{recursive:true});
if(process.platform==='win32'){
 const r=spawnSync('powershell.exe',['-NoProfile','-Command',"$paths=(Get-ChildItem -Force | Where-Object {$_.Name -notin @('release','.git','.data','.runtime','node_modules')}).FullName;Compress-Archive -Path $paths -DestinationPath 'release/BiedBot_Edge_Pilot.zip' -Force"],{stdio:'inherit'});process.exit(r.status??1);
}else{
 const r=spawnSync('python',['-c',"import zipfile,json;from pathlib import Path\nr=Path('.'); files=[f['path'] for f in json.loads((r/'MANIFEST.sha256.json').read_text())['files']]+['MANIFEST.sha256.json']\nwith zipfile.ZipFile('release/BiedBot_Edge_Pilot.zip','w',zipfile.ZIP_DEFLATED) as z:\n for f in files: z.write(f,'BiedBot_Edge/'+f)"],{stdio:'inherit'});process.exit(r.status??1);
}
