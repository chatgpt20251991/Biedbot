import {readFileSync,writeFileSync} from 'node:fs';import {scryptSync,createDecipheriv} from 'node:crypto';
const [input,output]=process.argv.slice(2),password=process.env.BIEDBOT_EXPORT_PASSWORD;
if(!input||!output||!password){console.error('Gebruik: BIEDBOT_EXPORT_PASSWORD in eigen procesomgeving, node scripts/decrypt-export.mjs export.json ontsleuteld.json');process.exit(1);}
const e=JSON.parse(readFileSync(input,'utf8'));if(e.format!=='biedbot-export-aes256gcm-v1'||e.kdf!=='scrypt')throw new Error('Onbekend exportformaat.');
const decode=k=>Buffer.from(e[k],'base64');const salt=decode('salt'),iv=decode('iv'),tag=decode('tag');if(salt.length!==16||iv.length!==12||tag.length!==16)throw new Error('Ongeldige exportparameters.');
const key=scryptSync(password,salt,32),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);const plain=Buffer.concat([decipher.update(decode('data')),decipher.final()]);key.fill(0);JSON.parse(plain.toString('utf8'));writeFileSync(output,plain,{mode:0o600,flag:'wx'});console.log('Export ontsleuteld; dit herstelt niet automatisch browsercookies of de installatie.');
