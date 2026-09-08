import {createServer} from 'node:http';
export async function fixtureServer(){
  const flags={blocked:false,wrongAccount:false,wrongSeller:false,duplicateSend:false};
  const server=createServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    const base=`<!doctype html><html><head><meta charset="utf-8"><title>Lokale contracttest, geen Marktplaats</title></head><body><div id="account">${flags.wrongAccount?'other-account':'fixture-dealer'}</div>${flags.blocked?'<div class="platform-warning">Aanvullende controle vereist</div>':''}`;
    if(req.url==='/search')return res.end(base+`<article class="listing" data-id="fixture-1" data-seller-id="seller-1" data-seller-type="private" data-price="10000" data-year="2019" data-mileage="90000" data-distance="15" data-model="Golf" data-brand="Volkswagen"><h2>Volkswagen Golf 2019</h2><a class="ad-link" href="/ad/fixture-1">Open</a></article></body></html>`);
    res.end(base+`<div id="seller" data-seller-id="${flags.wrongSeller?'other-seller':'seller-1'}"></div><button id="open-chat">Bericht</button><div id="messages"></div><div id="chat" hidden><textarea id="input"></textarea><button id="send">Verstuur</button>${flags.duplicateSend?'<button id="send">Dubbele knop</button>':''}</div><script>
      const key='fixture-messages';let data=JSON.parse(localStorage.getItem(key)||'[]');
      function render(){const box=document.querySelector('#messages');box.replaceChildren();for(const m of data){let el=document.createElement('p');el.className='message';el.dataset.id=m.id;el.dataset.direction=m.role;el.textContent=m.text;box.append(el);}localStorage.setItem(key,JSON.stringify(data));}
      render();if(location.hash==='#chat')document.querySelector('#chat').hidden=false;
      document.querySelector('#open-chat').onclick=()=>{document.querySelector('#chat').hidden=false;location.hash='chat';};
      document.querySelector('#send').onclick=()=>{const text=document.querySelector('#input').value;if(!text)return;data.push({id:'out-'+Date.now(),role:'assistant',text});data.push({id:'in-'+Date.now(),role:'seller',text:'Onderhoud is gedaan, ik verkoop voor een nieuwe auto.'});document.querySelector('#input').value='';render();};
    </script></body></html>`);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const contract={origin,searchUrl:origin+'/search',account:'#account',expectedAccount:'fixture-dealer',blocked:'.platform-warning',seller:'#seller',sellerIdAttribute:'data-seller-id',listing:'.listing',title:'h2',link:'.ad-link',openChat:'#open-chat',input:'#input',send:'#send',message:'.message',messageIdAttribute:'data-id',directionAttribute:'data-direction'};
  return {origin,contract,flags,close:()=>new Promise(r=>server.close(r))};
}
