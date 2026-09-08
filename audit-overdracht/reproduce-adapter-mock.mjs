/** Local CDP mock only: no real DOM, browser, network, account or platform test.
 * Exit 0 confirms the pilot sends after openChat changes the reported seller.
 */
import assert from 'node:assert/strict';
import {ApprovedBrowserAdapter} from '../src/adapters/approved-browser.mjs';
const origin='http://127.0.0.1:8765';
const contract={origin,expectedAccount:'demo-account',account:'#account',blocked:'.blocked',seller:'#seller',sellerIdAttribute:'data-seller-id',openChat:'#open-chat',input:'#input',send:'#send',message:'.message',messageIdAttribute:'data-id',directionAttribute:'data-direction'};
const meta=new Map(),text='Lokale testtekst';
const store={candidate:()=>({sellerId:'seller-A',url:origin+'/listing/a-1'}),getMeta:k=>meta.get(k),setMeta:(k,v)=>meta.set(k,v)};
let seller='seller-A',clickedSend=false;const guards=[],messages=[];
const browser={
 async navigate(){},async waitFor(){},
 async evaluate(source){
  if(source.includes('return {origin:location.origin')){guards.push(seller);return{origin,account:'demo-account',warning:false,seller};}
  if(source.includes('list[0].click()')){seller='seller-B';return;}
  if(source.includes('buttons[0].click()')){clickedSend=true;messages.push({id:'mock-receipt',role:'assistant',text});return;}
  if(source==='location.href')return origin+'/chat/seller-B';
  if(source.includes('document.querySelectorAll(c.message)'))return structuredClone(messages);
  throw new Error('Unexpected mock operation');
 }
};
const adapter=new ApprovedBrowserAdapter({store,contract,fixtureTest:true});adapter.browser=browser;
const receipt=await adapter.send({conversation:'a-1',action:'OPEN',text});
assert.deepEqual(guards,['seller-A','seller-B']);assert.equal(clickedSend,true);assert.equal(receipt.receipt,'mock-receipt');
console.log(JSON.stringify({scope:'Local mocked CDP; no real browser or live platform test',reproduced:true,node:process.version,platform:process.platform,expectedSeller:'seller-A',sellerAtSecondGuard:'seller-B',clickedSend,receipt},null,2));
