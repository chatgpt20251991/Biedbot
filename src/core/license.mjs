import {sign,verify} from 'node:crypto';
const LIMIT=16384;
function validate(p){
  if(!p||p.version!==1||typeof p.dealerId!=='string'||!p.dealerId||typeof p.installId!=='string'||!p.installId)throw new Error('Ongeldige licentie-identiteit.');
  if(!['trial','active'].includes(p.status)||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=p.issuedAt)throw new Error('Ongeldige licentieperiode.');
  if(!Number.isInteger(p.newContactCap)||p.newContactCap<1||p.newContactCap>20)throw new Error('Licentie overschrijdt productcap.');
  return p;
}
/** Publisher-only. A commercial license is NOT Marktplaats permission or a browser release. */
export function issueLicense(payload,privateKey){validate(payload);const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return body+'.'+sign(null,Buffer.from(body),privateKey).toString('base64url');}
export function verifyLicense(token,publicKey,{dealerId,installId,now=Date.now(),lastTrustedTime=0}={}){
  if(typeof token!=='string'||token.length>LIMIT)throw new Error('Ongeldige licentie.');
  const parts=token.split('.');if(parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))throw new Error('Ongeldig licentieformaat.');
  if(!verify(null,Buffer.from(parts[0]),publicKey,Buffer.from(parts[1],'base64url')))throw new Error('Licentiehandtekening ongeldig.');
  const p=validate(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));
  if(p.dealerId!==dealerId||p.installId!==installId)throw new Error('Licentie hoort bij een andere installatie.');
  if(now+300000<lastTrustedTime||now<p.issuedAt-300000||now>=p.expiresAt)throw new Error('Licentie verlopen of klokcontrole vereist.');
  return {...p,platformAuthorized:false};
}
