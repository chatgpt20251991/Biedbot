/** Run on the publisher's secured system only; never generates/distributes a private key. */
import {readFileSync,writeFileSync} from 'node:fs';import {issueLicense} from '../src/core/license.mjs';
const [payloadFile,keyFile,outputFile]=process.argv.slice(2);
if(!payloadFile||!keyFile||!outputFile){console.error('Gebruik: node scripts/issue-license.mjs payload.json PUBLISHER_PRIVATE_KEY.pem license.txt');process.exit(1);}
const payload=JSON.parse(readFileSync(payloadFile,'utf8')),key=readFileSync(keyFile,'utf8');
const token=issueLicense(payload,key);writeFileSync(outputFile,token+'\n',{mode:0o600,flag:'wx'});
console.log('Licentiebestand geschreven. Dit activeert geen Marktplaats-productievrijgave.');
