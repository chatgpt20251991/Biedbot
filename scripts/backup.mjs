import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {Store} from '../src/core/store.mjs';
import {createBackup,restoreBackup,MAX_BACKUP_BYTES} from '../src/core/operations.mjs';
const [action,input,output]=process.argv.slice(2),password=process.env.BIEDBOT_BACKUP_PASSWORD;
if(!['create','restore'].includes(action)||!input||!output||!password){
  console.error('Gebruik BIEDBOT_BACKUP_PASSWORD in de eigen procesomgeving. node scripts/backup.mjs create database.sqlite backup.json OF restore backup.json nieuwe-lege-datamap');process.exitCode=1;
}else{
  try{
    if(action==='create'){
      if(!statSync(input).isFile())throw new Error('Brondatabase ontbreekt.');
      const store=new Store(input);try{writeFileSync(output,JSON.stringify(createBackup(store,password)),{flag:'wx',mode:0o600});}finally{store.close();}
      console.log('Volledige versleutelde databasebackup opgeslagen. Profielen, cookies en providersleutels uitgesloten.');
    }else{
      if(statSync(input).size>Math.ceil(MAX_BACKUP_BYTES/3)*4+2000)throw new Error('Backupbestand te groot.');
      restoreBackup(JSON.parse(readFileSync(input,'utf8')),password,output);console.log('Backup hersteld in een leeg dataprofiel. Autopilot staat uit; onzekere verzendingen vereisen controle.');
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
