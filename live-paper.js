/* Public presentation and authenticated commands only. The quant engine is never downloaded. */
(function(){'use strict';
const $=id=>document.getElementById(id),cfg=window.PIPELINE_CONFIG||{},symbols=['UPRO','SPXU','TQQQ','SQQQ'];
const labels={UPRO:'S&P 500 · +3×',SPXU:'S&P 500 · −3×',TQQQ:'Nasdaq-100 · +3×',SQQQ:'Nasdaq-100 · −3×'};
const charts=new Map();let interval='1m',fills=[],current=null,auth=null,admin=false,busy=false,runId=null,selectedModel=null,authEpoch=0;
const usd=v=>Number.isFinite(v)?'$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—';
const date=v=>v?new Date(typeof v==='number'?v*1000:v).toLocaleString('ko-KR',{timeZone:'America/New_York',hour12:false}):'—';
function el(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e}
async function request(path,body,token=auth?.access_token){
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw Error('Supabase 공개 연결 설정이 필요합니다.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const headers={'Content-Type':'application/json',apikey:cfg.supabasePublishableKey};if(token)headers.Authorization='Bearer '+token;
 try{const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body||{}),signal:controller.signal,cache:'no-store'});const data=await r.json();
 if(!r.ok)throw Error(r.status===404?'운영 DB 초기 설정이 필요합니다.':r.status===401||r.status===403?'로그인 또는 관리자 권한을 확인하세요.':data.message||data.msg||'서버 요청 실패');return data;
 }finally{clearTimeout(timer)}
}
const rpc=(name,payload)=>request('/rest/v1/rpc/'+name,payload);
function status(data){
 current=data;const stale=data.updated_at&&Date.now()-Date.parse(data.updated_at)>20000;
 $('lp-status').textContent=[data.status||'NOT_CONNECTED',stale?'ENGINE OFFLINE':data.feed_status||''].filter(Boolean).join(' / ');
 $('lp-updated').textContent=data.updated_at?'최근 갱신 '+date(data.updated_at)+' NY':'아직 운영 프로세스가 연결되지 않았습니다.';
 $('lp-notice').textContent=stale?'운영 프로세스의 갱신이 중단됐습니다. 마지막 기록을 표시하며 실시간 성과로 표시하지 않습니다.':!data.public_market_data&&!admin?'시세 공개 권한 확인 전입니다. 운영 연결 후 공개 승인이 완료되면 네 차트가 자동 갱신됩니다.':'실제 주문 없는 내부 Paper Trading · IBKR 시세 · 거래 점은 완료된 가상 체결만 표시합니다.';
 const metrics=[['Portfolio NAV',usd(data.nav)],['Net return',pct(data.net_return)],['보유 현금',usd(data.cash)],['Max Drawdown',pct(data.max_drawdown)],['체결 / 주문',`${data.fills_count??0} / ${data.orders_count??0}`],['누적 거래비용',usd(data.fees)],['실현 손익',usd(data.realized_pnl)],['미실현 손익',usd(data.unrealized_pnl)]];
 $('lp-stats').replaceChildren(...metrics.map(([label,value])=>{const d=el('article',null,'lp-stat');d.append(el('small',label),el('strong',value));return d}));
 $('lp-since').textContent=data.started_at?`${date(data.started_at)} NY부터 · 가상 초기자본 ${usd(data.initial_cash)} · 모델 버전 ${data.model_version||'—'} · 결과는 가상 체결입니다.`:'검증된 모델 입력 및 운영 연결을 기다리고 있습니다.';
 $('lp-positions').replaceChildren(...symbols.map(s=>{const d=el('div',null,'lp-allocation');d.append(el('span',s),el('span',`${data.positions?.[s]??0}주 · ${data.marks?.[s]!=null?usd((data.positions?.[s]||0)*data.marks[s]):'가격 비공개/대기'}`));return d}));
 const review=data.daily_review;$('lp-review').textContent=review?`${review.day||''} / ${review.status||'WAITING'}${review.reason?' · '+review.reason:''}${review.paper_day?.net_return!=null?' · 당일 Paper '+pct(review.paper_day.net_return)+' / 체결 '+review.paper_day.fills_count+'회':''}${review.candidate_net_return!=null?' · 후보 '+pct(review.candidate_net_return)+' / 기존 '+pct(review.incumbent_net_return):''}`:'아직 완료된 일일 비교가 없습니다.';
}
function renderFills(){
 $('lp-fill-count').textContent=`${current?.fills_count??fills.length} fills`;
 $('lp-fills').replaceChildren(...fills.slice(-100).reverse().map(f=>{const tr=el('tr');for(const v of [date(f.at),f.symbol,f.side==='buy'?'매수':'매도',Number(f.quantity).toLocaleString(),usd(f.price),usd(f.fee)])tr.append(el('td',v));tr.className=f.side==='buy'?'lp-buy':'lp-sell';return tr}));
 for(const c of charts.values())c.draw();
}
class Chart{
 constructor(symbol){
  this.symbol=symbol;this.rows=new Map();this.offset=0;this.spacing=9;this.points=[];this.loading=false;this.exhausted=false;this.generation=0;
  const card=el('article',null,'lp-chart'),head=el('div',null,'lp-chart-head');head.append(el('strong',symbol),el('small',labels[symbol]));
  this.canvas=el('canvas');this.canvas.setAttribute('aria-label',symbol+' 실시간 봉 차트와 가상 거래');this.canvas.tabIndex=0;this.note=el('p','시세 연결 대기','lp-chart-status');card.append(head,this.canvas,this.note);$('lp-charts').append(card);
  let drag=null;
  this.canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,offset:this.offset,moved:false};this.canvas.setPointerCapture?.(e.pointerId)});
  this.canvas.addEventListener('pointermove',e=>{if(drag&&Math.abs(e.clientX-drag.x)>5){drag.moved=true;this.offset=Math.max(0,drag.offset+Math.round((e.clientX-drag.x)/this.spacing));this.draw();if(this.offset+100>this.rows.size)this.load(true);$('lp-tooltip').hidden=true}else this.tooltip(e)});
  this.canvas.addEventListener('pointerup',e=>{if(!drag?.moved)this.tooltip(e);drag=null});this.canvas.addEventListener('pointercancel',()=>{drag=null});
  this.canvas.addEventListener('pointerleave',()=>{$('lp-tooltip').hidden=true});
  this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.spacing=Math.max(4,Math.min(22,this.spacing+(e.deltaY<0?1:-1)));this.draw()},{passive:false});
 }
 reset(){this.generation++;this.rows.clear();this.offset=0;this.exhausted=false;this.loading=false;this.points=[];this.draw()}
 async load(older=false){
  if(this.loading||older&&this.exhausted)return;this.loading=true;const generation=this.generation,frame=interval;
  try{const rows=[...this.rows.values()].sort((a,b)=>a.start-b.start),args={p_symbol:this.symbol,p_interval:frame,p_before:older&&rows.length?rows[0].start:null,p_after:!older&&rows.length?rows[Math.max(0,rows.length-3)].start:null};
   const value=await rpc('lp_public_bars',args);if(generation!==this.generation)return;
   if(value.status!=='OK'){this.rows.clear();this.points=[];this.note.textContent='시세 공개/운영 연결을 기다리고 있습니다.';this.draw();return}
   let added=0;for(const row of value.bars||[]){if(!this.rows.has(row.start))added++;this.rows.set(row.start,row)}
   if(older&&!(value.bars||[]).length)this.exhausted=true;
   if(!older&&this.offset>0)this.offset+=added;
   this.note.textContent=rows.length||this.rows.size?'드래그 이동 · 휠 확대/축소 · 거래 점 Hover / Click':'아직 수집된 봉이 없습니다.';this.draw();
  }catch(e){this.note.textContent=e.message}finally{if(generation===this.generation)this.loading=false}
 }
 draw(){
  const canvas=this.canvas,ratio=window.devicePixelRatio||1,w=canvas.clientWidth||600,h=canvas.clientHeight||280;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);const x=canvas.getContext('2d');x.setTransform(ratio,0,0,ratio,0,0);x.clearRect(0,0,w,h);this.points=[];
  const style=getComputedStyle(document.body),color=k=>style.getPropertyValue(k).trim(),all=[...this.rows.values()].sort((a,b)=>a.start-b.start),count=Math.max(6,Math.floor((w-62)/this.spacing));this.offset=Math.min(this.offset,Math.max(0,all.length-6));
  const end=all.length-this.offset,rows=all.slice(Math.max(0,end-count),end);if(!rows.length){x.fillStyle=color('--lp-muted');x.font='12px DM Mono,monospace';x.fillText('Waiting for real market data',16,h/2);return}
  const visibleFillPrices=fills.filter(f=>f.symbol===this.symbol&&Number.isFinite(f.price)&&f.at>=rows[0].start&&f.at<rows.at(-1).end).map(f=>f.price);let low=Math.min(...rows.map(b=>b.low),...visibleFillPrices),high=Math.max(...rows.map(b=>b.high),...visibleFillPrices);const pad=Math.max((high-low)*.1,high*.001);low-=pad;high+=pad;const y=p=>18+(high-p)/(high-low)*(h-55),left=12,step=(w-72)/rows.length;
  x.font='10px DM Mono,monospace';for(let i=0;i<=4;i++){const p=low+(high-low)*i/4,yy=y(p);x.strokeStyle=color('--lp-line');x.beginPath();x.moveTo(left,yy);x.lineTo(w-53,yy);x.stroke();x.fillStyle=color('--lp-muted');x.fillText(p.toFixed(2),w-49,yy+3)}
  const by=new Map();rows.forEach((b,i)=>{const xx=left+(i+.5)*step;by.set(b.start,xx);x.strokeStyle=x.fillStyle=color(b.close>=b.open?'--lp-green':'--lp-red');x.beginPath();x.moveTo(xx,y(b.high));x.lineTo(xx,y(b.low));x.stroke();x.fillRect(xx-Math.max(1,step*.32),Math.min(y(b.open),y(b.close)),Math.max(2,step*.64),Math.max(1,Math.abs(y(b.open)-y(b.close))))});
  const seconds=interval==='1m'?60:300;
  for(const f of fills){if(f.symbol!==this.symbol||f.price==null)continue;const xx=by.get(Math.floor(f.at/seconds)*seconds);if(xx==null)continue;const yy=Math.max(12,Math.min(h-35,y(f.price)));x.fillStyle=color(f.side==='buy'?'--lp-green':'--lp-red');x.beginPath();x.arc(xx,yy,4.5,0,Math.PI*2);x.fill();this.points.push({x:xx,y:yy,fill:f})}
  x.fillStyle=color('--lp-muted');x.fillText(new Date(rows[0].start*1000).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}),left,h-8);
  x.textAlign='right';x.fillText(new Date(rows.at(-1).start*1000).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false})+' NY',w-56,h-8);x.textAlign='left';
 }
 tooltip(e){const box=this.canvas.getBoundingClientRect(),px=e.clientX-box.left,py=e.clientY-box.top,p=this.points.find(p=>Math.hypot(p.x-px,p.y-py)<12),tip=$('lp-tooltip');tip.hidden=!p;if(!p)return;const f=p.fill;tip.textContent=`${f.symbol} ${f.side==='buy'?'매수':'매도'} ${f.quantity}주\n${date(f.at)} NY\n가격 ${usd(f.price)} · 비용 ${usd(f.fee)}\n가상 주문 #${f.order_id}`;tip.style.left=Math.min(e.clientX+14,window.innerWidth-290)+'px';tip.style.top=Math.max(10,Math.min(e.clientY+14,window.innerHeight-145))+'px'}
}
for(const s of symbols)charts.set(s,new Chart(s));
document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',async()=>{interval=button.dataset.interval;document.querySelectorAll('[data-interval]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));for(const c of charts.values())c.reset();await Promise.all([...charts.values()].map(c=>c.load()))}));
async function poll(){if(busy)return;busy=true;const epoch=authEpoch;try{
 if(auth&&Date.now()>auth.refresh_at){const r=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:auth.refresh_token},null);auth={...r,refresh_at:Date.now()+(r.expires_in-60)*1000}}
 const value=await rpc('lp_public_state');if(epoch!==authEpoch)return;status(value);runId=value.run_id;
 if(runId){const nextFills=await rpc('lp_public_fills',{p_run:runId});if(epoch!==authEpoch)return;fills=nextFills;renderFills()}
 await Promise.all([...charts.values()].map(c=>c.load()));
 if(admin){const own=await rpc('lp_admin_state');$('lp-admin-state').textContent=`${own.summary?.status||'WAITING'} · 모델 입력 주기 ${own.state?.portfolio?.interval||'초기 Dataset 설정 확인'} · ${own.state?.queued_model?'다음 거래일 모델 교체 대기':'교체 대기 없음'}${own.state?.feed_fault?' · 최근 데이터 장애 '+(own.state.feed_fault.code??'')+' '+own.state.feed_fault.reason:''}`;$('lp-commands').textContent=(own.commands||[]).slice(0,6).map(c=>`${c.kind}: ${c.status}${c.result?.message?' — '+c.result.message:''}`).join('\n')}
 }catch(e){$('lp-status').textContent='연결 대기 / 설정 확인';$('lp-updated').textContent=e.message}finally{busy=false}}
function message(text){$('lp-admin-message').textContent=text}
$('lp-login').addEventListener('submit',async e=>{e.preventDefault();try{const a=await request('/auth/v1/token?grant_type=password',{email:$('lp-email').value,password:$('lp-password').value},null);auth={...a,refresh_at:Date.now()+(a.expires_in-60)*1000};if(!await rpc('lp_is_admin')){auth=null;throw Error('허가된 관리자 계정이 아닙니다.')}admin=true;authEpoch++;$('lp-password').value='';$('lp-login').hidden=true;$('lp-admin-controls').hidden=false;for(const c of charts.values())c.reset();message('관리자 로그인 완료');await poll()}catch(e){auth=null;message(e.message)}});
$('lp-logout').addEventListener('click',async()=>{if(auth)try{await request('/auth/v1/logout',{},auth.access_token)}catch{}authEpoch++;auth=null;admin=false;selectedModel=null;status({status:'NOT_CONNECTED'});$('lp-model').value='';$('lp-admin-controls').hidden=true;$('lp-login').hidden=false;for(const c of charts.values())c.reset();fills=[];renderFills();await poll();message('로그아웃했습니다.')});
$('lp-model').addEventListener('change',async()=>{try{const f=$('lp-model').files[0];if(!f){selectedModel=null;return}if(f.size>8000000)throw Error('모델 JSON은 8 MB 이하여야 합니다.');selectedModel=JSON.parse(await f.text());message('모델을 읽었습니다. 시작/후보 등록 전에는 서버에 전송하지 않습니다.')}catch(e){selectedModel=null;message(e.message)}});
async function command(kind,payload){if(!admin)throw Error('관리자 로그인이 필요합니다.');const id=await rpc('lp_submit_command',{p_kind:kind,p_payload:payload,p_key:crypto.randomUUID()});message('명령 접수 '+id+' · 운영 프로세스가 확인한 뒤 DONE 또는 REJECTED로 표시됩니다.');await poll()}
$('lp-start').addEventListener('click',async()=>{try{if(!selectedModel&&!current?.started_at)throw Error('먼저 검증된 모델 JSON을 선택하세요.');const initial=Number($('lp-capital').value);if(!Number.isFinite(initial)||initial<100||initial>1e9)throw Error('초기자본을 확인하세요.');await command('START',{model:selectedModel,qualification_confirmed:$('lp-qualified').checked,execution_profile_confirmed:$('lp-costs').checked,extended_qualified:$('lp-extended').checked,session_policy:$('lp-session').value,profile:{initial_cash:initial,commission_per_share:.0035,minimum_commission:.35,sell_fee_rate:.0000206,spread_bps:2,slippage_bps:2,participation:.01,max_position:.25,label:'Owner-confirmed paper assumptions; not a broker fee quote'}})}catch(e){message(e.message)}});
$('lp-stop').addEventListener('click',async()=>{try{await command('STOP',{})}catch(e){message(e.message)}});
$('lp-stage').addEventListener('click',async()=>{try{if(!selectedModel)throw Error('후보 모델 JSON을 선택하세요.');await command('STAGE_MODEL',{model:selectedModel,qualification_confirmed:$('lp-qualified').checked})}catch(e){message(e.message)}});
$('lp-public-enable').addEventListener('click',async()=>{try{await command('SET_PUBLICATION',{enabled:$('lp-public-rights').checked,rights_confirmed:$('lp-public-rights').checked})}catch(e){message(e.message)}});
window.addEventListener('resize',()=>{for(const c of charts.values())c.draw()});window.addEventListener('site-theme-change',()=>{for(const c of charts.values())c.draw()});
setInterval(poll,5000);status({status:'NOT_CONNECTED'});poll();
})();
