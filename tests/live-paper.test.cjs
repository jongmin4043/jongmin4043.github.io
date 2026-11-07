'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.style={};this.dataset={};this.textContent='';this.hidden=false;this.value='';this.checked=false;this.clientWidth=600;this.clientHeight=280;this.files=[];this.arcs=[]}
 append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}setAttribute(k,v){this[k]=v}addEventListener(k,f){this.listeners[k]=f}setPointerCapture(){}
 getBoundingClientRect(){return{left:0,top:0,width:600,height:280}}
 getContext(){return{setTransform(){},clearRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fill(){},arc:(...x)=>this.arcs.push(x)}}
}
async function main(){
 const ids=[...fs.readFileSync('testing-machine.html','utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]),dom=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const buttons=['1m','5m'].map(v=>{const x=new Element('button');x.dataset.interval=v;return x});dom['lp-capital'].value='100000';dom['lp-session'].value='regular';
 const requests=[],symbols=['UPRO','SPXU','TQQQ','SQQQ'],at=1800000000;let market=true;const rows=symbols.map((symbol,j)=>Array.from({length:15},(_,i)=>({symbol,start:at+i*60,end:at+(i+1)*60,open:100+j*20+i*.1,high:102+j*20+i*.1,low:99+j*20+i*.1,close:101+j*20+i*.1,volume:1000,complete:true})));
 const ctx=vm.createContext({console,Date,Map,Math,Number,JSON,Promise,Intl,AbortController,setTimeout,clearTimeout,setInterval(){},crypto:{randomUUID:()=> 'test-command'},getComputedStyle:()=>({getPropertyValue:()=> '#93e7c3'}),
 document:{getElementById:id=>{assert.ok(dom[id],id);return dom[id]},createElement:tag=>new Element(tag),querySelectorAll:()=>buttons,body:{}},
 window:{PIPELINE_CONFIG:{supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_TEST'},innerWidth:1200,innerHeight:800,devicePixelRatio:1,addEventListener(){}},
 fetch:async(url,opts)=>{const body=JSON.parse(opts.body);requests.push({url,body,headers:opts.headers});return{ok:true,json:async()=>{
  if(url.includes('/auth/v1/token'))return{access_token:'owner-token',refresh_token:'refresh',expires_in:3600};
  if(url.endsWith('/lp_is_admin'))return opts.headers.Authorization==='Bearer owner-token';
  if(url.endsWith('/lp_submit_command'))return'test-command';
  if(url.endsWith('/lp_admin_state'))return{summary:{status:'RUNNING'},state:{portfolio:{interval:'1m'},queued_model:null},commands:[]};
  if(url.endsWith('/lp_public_state'))return{status:'RUNNING',run_id:'run',started_at:new Date().toISOString(),updated_at:new Date().toISOString(),initial_cash:100000,cash:90000,nav:101000,net_return:.01,max_drawdown:.02,fills_count:1,orders_count:1,positions:{TQQQ:10},marks:{TQQQ:110},public_market_data:market,feed_status:'LIVE'};
  if(url.endsWith('/lp_public_bars'))return{status:market||opts.headers.Authorization?'OK':'MARKET_PUBLICATION_NOT_ENABLED',bars:market||opts.headers.Authorization?rows[symbols.indexOf(body.p_symbol)]:[]};
  if(url.endsWith('/lp_public_fills'))return[{id:1,symbol:'TQQQ',side:'buy',quantity:10,price:141,fee:.35,at:at+125,order_id:1}];
  throw Error('Unexpected URL '+url)
 }}}
 });
 vm.runInContext(fs.readFileSync('live-paper.js','utf8'),ctx);await new Promise(r=>setTimeout(r,30));
 assert.equal(dom['lp-charts'].children.length,4);assert.deepEqual(dom['lp-charts'].children.map(c=>c.children[0].children[0].textContent),symbols);
 assert.equal(dom['lp-stats'].children.length,8);assert.match(dom['lp-since'].textContent,/가상 초기자본/);assert.equal(dom['lp-fills'].children.length,1);
 const chart=dom['lp-charts'].children[2].children[1],point=chart.arcs.at(-1);assert.ok(point);
 chart.listeners.pointermove({clientX:point[0],clientY:point[1]});assert.equal(dom['lp-tooltip'].hidden,false);assert.match(dom['lp-tooltip'].textContent,/TQQQ 매수 10주/);assert.match(dom['lp-tooltip'].textContent,/141.00/);
 chart.listeners.pointerleave();assert.equal(dom['lp-tooltip'].hidden,true);
 await buttons[1].listeners.click();assert.ok(requests.filter(r=>r.url.endsWith('/lp_public_bars')).slice(-4).every(r=>r.body.p_interval==='5m'));
 await dom['lp-stop'].listeners.click();assert.match(dom['lp-admin-message'].textContent,/관리자 로그인/);assert.equal(requests.filter(r=>r.url.endsWith('/lp_submit_command')).length,0);
 dom['lp-email'].value='owner@example.test';dom['lp-password'].value='not-a-real-password';await dom['lp-login'].listeners.submit({preventDefault(){}});
 assert.equal(dom['lp-admin-controls'].hidden,false);assert.equal(dom['lp-password'].value,'');
 dom['lp-model'].files=[{size:100,text:async()=>JSON.stringify({schema:'quant-model/v2',private:'test-only'})}];await dom['lp-model'].listeners.change();dom['lp-qualified'].checked=true;dom['lp-costs'].checked=true;
 await dom['lp-start'].listeners.click();const start=requests.filter(r=>r.url.endsWith('/lp_submit_command')).at(-1);assert.equal(start.body.p_kind,'START');assert.equal(start.body.p_payload.model.private,'test-only');assert.equal(start.headers.Authorization,'Bearer owner-token');
 await dom['lp-stop'].listeners.click();assert.equal(requests.filter(r=>r.url.endsWith('/lp_submit_command')).at(-1).body.p_kind,'STOP');
 await dom['lp-logout'].listeners.click();assert.equal(dom['lp-admin-controls'].hidden,true);assert.equal(dom['lp-model'].value,'');
 assert.ok(requests.every(r=>!String(r.headers.Authorization||'').includes('sb_publishable')));
 assert.ok(!fs.readFileSync('live-paper.js','utf8').includes('Math.random'));
 console.log('LIVE_PAPER_UI_OK four-candles/distinct-symbols/fill-hover/interval-switch/stats/admin-auth/start-stop/private-upload/logout/no-synthetic-prices');
}
main().catch(e=>{console.error(e);process.exitCode=1});
