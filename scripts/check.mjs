import {readdirSync,readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(p,x.name)):[join(p,x.name)]);}
const files=['src','scripts','tests'].flatMap(walk).filter(x=>/\.(mjs|js)$/.test(x));
for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(1);}}
const pkg=JSON.parse(readFileSync('package.json'));if(Object.keys(pkg.dependencies||{}).length)throw new Error('Onverwachte externe runtime dependencies.');
for(const path of ['src/server.mjs','src/ui/index.html','scripts/Install.ps1','docs/RELEASE_STATUS.md'])if(!existsSync(path))throw new Error('Bestand ontbreekt: '+path);
console.log(`${files.length} JavaScriptbestanden syntactisch gecontroleerd; geen externe npm-runtimeafhankelijkheden.`);
