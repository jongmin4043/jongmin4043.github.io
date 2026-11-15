/* Public presentation and authenticated commands only. The quant engine is never downloaded. */
(function(){'use strict';
const $=id=>document.getElementById(id),cfg=window.PIPELINE_CONFIG||{},symbols=['UPRO','SPXU','TQQQ','SQQQ'];
const labels={UPRO:'S&P 500 · +3×',SPXU:'S&P 500 · −3×',TQQQ:'Nasdaq-100 · +3×',SQQQ:'Nasdaq-100 · −3×'};
const charts=new Map();let interval='1m',fills=[],current=null,auth=null,admin=false,busy=false,runId=null,selectedModel=null,authEpoch=0;
const usd=v=>Number.isFinite(v)?'$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—';
const date=v=>v?new Date(typeof v==='number'?v*1000:v).toLocaleString('en-US',{timeZone:'America/New_York',hour12:false}):'—';
function el(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e}
async function request(path,body,token=auth?.access_token){
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw Error('Public Supabase connection settings are required.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const headers={'Content-Type':'application/json',apikey:cfg.supabasePublishableKey};if(token)headers.Authorization='Bearer '+token;
 try{const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body||{}),signal:controller.signal,cache:'no-store'});const data=await r.json();
 if(!r.ok)throw Error(r.status===404?'The live database schema must be installed.':r.status===401||r.status===403?'Check your sign-in and administrator permissions.':data.message||data.msg||'Server request failed');return data;
 }finally{clearTimeout(timer)}
}
const rpc=(name,payload)=>request('/rest/v1/rpc/'+name,payload);
function status(data){
 current=data;const stale=data.updated_at&&Date.now()-Date.parse(data.updated_at)>20000;
 $('lp-status').textContent=[data.status||'NOT_CONNECTED',stale?'ENGINE OFFLINE':data.feed_status||''].filter(Boolean).join(' / ');
 $('lp-updated').textContent=data.updated_at?'Last updated '+date(data.updated_at)+' NY':'The private engine has not connected yet.';
 $('lp-notice').textContent=stale?'Engine updates have stopped. These are the last recorded values, not current live performance.':!data.public_market_data&&!admin?'Public market-data display is awaiting authorization. The four charts update automatically once the engine is connected and publication is enabled.':'Internal paper trading · IBKR market data · No broker orders · Markers show completed virtual fills only.';
 const metrics=[['Portfolio NAV',usd(data.nav)],['Net return',pct(data.net_return)],['Cash balance',usd(data.cash)],['Max Drawdown',pct(data.max_drawdown)],['Fills / orders',`${data.fills_count??0} / ${data.orders_count??0}`],['Total trading costs',usd(data.fees)],['Realized P&L',usd(data.realized_pnl)],['Unrealized P&L',usd(data.unrealized_pnl)]];
 $('lp-stats').replaceChildren(...metrics.map(([label,value])=>{const d=el('article',null,'lp-stat');d.append(el('small',label),el('strong',value));return d}));
 $('lp-since').textContent=data.started_at?`${date(data.started_at)} NY · Initial virtual capital ${usd(data.initial_cash)} · Model version ${data.model_version||'—'} · Simulated executions only.`:'Waiting for an evaluated model and the private engine connection.';
 $('lp-positions').replaceChildren(...symbols.map(s=>{const d=el('div',null,'lp-allocation');d.append(el('span',s),el('span',`${data.positions?.[s]??0} shares · ${data.marks?.[s]!=null?usd((data.positions?.[s]||0)*data.marks[s]):'Price private / pending'}`));return d}));
 const review=data.daily_review;$('lp-review').textContent=review?`${review.day||''} / ${review.status||'WAITING'}${review.reason?' · '+review.reason:''}${review.paper_day?.net_return!=null?' · Daily paper return '+pct(review.paper_day.net_return)+' / Fills '+review.paper_day.fills_count:''}${review.candidate_net_return!=null?' · Candidate '+pct(review.candidate_net_return)+' / Incumbent '+pct(review.incumbent_net_return):''}`:'No daily comparison has completed yet.';
}
let performanceData=null,performanceAt=0,performanceRun=null,performanceEpoch=-1,performancePoints=[],performanceError=null,performanceView='all';
const historyStatus={PENDING:'Historical replay pending',RUNNING:'Replaying historical paper trades',COMPLETE:'Historical replay complete',FAILED:'Historical replay failed · Live account preserved',CANCELLED:'Historical replay cancelled · Select Start to retry'};
function renderPerformance(){
 const history=performanceData?.historical,meta=history?.meta||current?.daily_review?.historical_replay||{},canvas=$('lp-performance-canvas');
 $('lp-history-start').textContent=meta.simulation_start?date(meta.simulation_start)+' NY':'Waiting for available history';
 $('lp-actual-start').textContent=current?.started_at?date(current.started_at)+' NY':'Not started';
 if(performanceError)$('lp-history-status').textContent=performanceError;else if(meta.status)$('lp-history-status').textContent=(historyStatus[meta.status]||meta.status)+(meta.status==='RUNNING'?' · '+(meta.phase||''):meta.cloud_status==='MIGRATION_OR_CONNECTION_REQUIRED'?' · Check the historical chart database setup or connection':'');
 const historyRows=(history?.curve||[]).filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.nav)),initial=Number(history?.meta?.initial_cash),liveInitial=Number(performanceData?.initial_cash||current?.initial_cash);
 const historical=initial>0?historyRows.map(p=>({at:p.at,index:p.nav/initial*100,phase:'Historical replay · retrospective simulation'})):[];
 const base=historical.length?historical.at(-1).index:100;
 const live=(performanceData?.live||[]).filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.nav)).map(p=>({at:p.at,index:liveInitial>0?base*p.nav/liveInitial:100,phase:'Observed live paper trading'}));
 const update=Date.parse(current?.updated_at)/1000;
 if(live.length&&current?.feed_status==='LIVE'&&Date.now()/1000-update<20&&Number.isFinite(current.nav)&&update>live.at(-1).at)live.push({at:update,index:base*current.nav/liveInitial,phase:'Observed live paper trading'});
 const all=[...historical,...live],drawHistory=performanceView==='live'?[]:historical,drawLive=live,visible=[...drawHistory,...drawLive];performancePoints=[];
 const ratio=window.devicePixelRatio||1,w=canvas.clientWidth||900,h=canvas.clientHeight||310;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);const x=canvas.getContext('2d');x.setTransform(ratio,0,0,ratio,0,0);x.clearRect(0,0,w,h);
 const style=getComputedStyle(document.body),color=k=>style.getPropertyValue(k).trim();x.font='11px DM Mono,monospace';x.fillStyle=color('--lp-muted');
 if(!visible.length){x.fillText('Select Start to load replay and live history.',16,h/2);return}
 let low=Math.min(...visible.map(p=>p.index)),high=Math.max(...visible.map(p=>p.index));const pad=Math.max((high-low)*.1,1);low-=pad;high+=pad;
 const begin=visible[0].at,end=Math.max(begin+60,visible.at(-1).at),px=t=>50+(t-begin)/(end-begin)*(w-68),py=v=>20+(high-v)/(high-low)*(h-60);
 for(let i=0;i<=4;i++){const n=low+(high-low)*i/4,yy=py(n);x.strokeStyle=color('--lp-line');x.beginPath();x.moveTo(50,yy);x.lineTo(w-18,yy);x.stroke();x.fillStyle=color('--lp-muted');x.fillText(n.toFixed(1),3,yy+4)}
 function line(rows,stroke){x.strokeStyle=stroke;x.lineWidth=1.8;x.beginPath();rows.forEach((p,i)=>{const xx=px(p.at),yy=py(p.index);if(i)x.lineTo(xx,yy);else x.moveTo(xx,yy);performancePoints.push({...p,x:xx,y:yy})});x.stroke()}
 line(drawHistory,color('--lp-history'));line(drawLive,color('--lp-green'));
 if(drawHistory.length&&drawLive.length){const a=historical.at(-1),b=live[0];x.setLineDash([5,5]);x.strokeStyle=color('--lp-muted');x.beginPath();x.moveTo(px(a.at),py(a.index));x.lineTo(px(b.at),py(b.index));x.stroke();x.setLineDash([])}
 if(live.length){const xx=px(live[0].at);x.setLineDash([3,5]);x.strokeStyle=color('--lp-muted');x.lineWidth=1;x.beginPath();x.moveTo(xx,15);x.lineTo(xx,h-35);x.stroke();x.setLineDash([]);x.fillStyle=color('--lp-muted');x.fillText('Live start',Math.max(50,Math.min(w-82,xx-70)),14)}
 x.fillStyle=color('--lp-muted');x.fillText(new Date(begin*1000).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),50,h-8);x.textAlign='right';x.fillText(new Date(end*1000).toLocaleDateString('en-CA',{timeZone:'America/New_York'})+' NY',w-18,h-8);x.textAlign='left';
 $('lp-performance-summary').textContent=(historical.length?`Historical replay ${date(meta.simulation_start)} ~ ${date(meta.simulation_end)} NY · Return ${pct(meta.net_return)} · Fills ${meta.fills_count??0}${meta.risk_halted?' · Risk limit reached':''} · `:'Historical replay pending · ')+`Observed live return ${pct(current?.net_return)} · Linked index ${all.at(-1).index.toFixed(2)}${meta.data_gap_seconds>300?' · Includes a data gap between replay and live start':''}`;
}
async function loadPerformance(force=false){
 if(!runId)return;
 if(!force&&performanceRun===runId&&performanceEpoch===authEpoch&&Date.now()-performanceAt<15000){renderPerformance();return}
 const requestedRun=runId,epoch=authEpoch;performanceAt=Date.now();if(performanceRun!==runId||performanceEpoch!==epoch){performanceData=null;performancePoints=[];renderPerformance()}
 try{const value=await rpc('lp_public_performance',{p_run:requestedRun});if(epoch!==authEpoch||requestedRun!==runId)return;performanceError=null;performanceData=value;performanceRun=runId;performanceEpoch=epoch;renderPerformance()}
 catch(e){if(epoch!==authEpoch||requestedRun!==runId)return;performanceError='Performance chart setup required · Run Install-Live-History.cmd, then check again.';renderPerformance()}
}
for(const [id,view] of [['lp-performance-all','all'],['lp-performance-live','live']])$(id).addEventListener('click',()=>{performanceView=view;$('lp-performance-all').setAttribute('aria-pressed',String(view==='all'));$('lp-performance-live').setAttribute('aria-pressed',String(view==='live'));renderPerformance()});
$('lp-performance-canvas').addEventListener('pointermove',e=>{if(!performancePoints.length)return;const box=e.currentTarget?.getBoundingClientRect?.()||$('lp-performance-canvas').getBoundingClientRect(),xx=e.clientX-box.left,point=performancePoints.reduce((a,b)=>Math.abs(b.x-xx)<Math.abs(a.x-xx)?b:a),tip=$('lp-tooltip');tip.hidden=false;tip.textContent=`${point.phase}\n${date(point.at)} NY\nLinked performance index ${point.index.toFixed(2)} (starting at 100)`;tip.style.left=Math.min(e.clientX+14,window.innerWidth-290)+'px';tip.style.top=Math.max(10,Math.min(e.clientY+14,window.innerHeight-145))+'px'});
$('lp-performance-canvas').addEventListener('pointerleave',()=>{$('lp-tooltip').hidden=true});
function renderFills(){
 $('lp-fill-count').textContent=`${current?.fills_count??fills.length} fills`;
 $('lp-fills').replaceChildren(...fills.slice(-100).reverse().map(f=>{const tr=el('tr');for(const v of [date(f.at),f.symbol,f.side==='buy'?'Buy':'Sell',Number(f.quantity).toLocaleString('en-US'),usd(f.price),usd(f.fee)])tr.append(el('td',v));tr.className=f.side==='buy'?'lp-buy':'lp-sell';return tr}));
 for(const c of charts.values())c.draw();
}
class Chart{
 constructor(symbol){
  this.symbol=symbol;this.rows=new Map();this.offset=0;this.spacing=9;this.points=[];this.loading=false;this.exhausted=false;this.generation=0;
  const card=el('article',null,'lp-chart'),head=el('div',null,'lp-chart-head');head.append(el('strong',symbol),el('small',labels[symbol]));
  this.canvas=el('canvas');this.canvas.setAttribute('aria-label',symbol+' live candlestick chart and paper executions');this.canvas.tabIndex=0;this.note=el('p','Waiting for market data','lp-chart-status');card.append(head,this.canvas,this.note);$('lp-charts').append(card);
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
   if(value.status!=='OK'){this.rows.clear();this.points=[];this.note.textContent='Waiting for market-data publication and the engine connection.';this.draw();return}
   let added=0;for(const row of value.bars||[]){if(!this.rows.has(row.start))added++;this.rows.set(row.start,row)}
   if(older&&!(value.bars||[]).length)this.exhausted=true;
   if(!older&&this.offset>0)this.offset+=added;
   this.note.textContent=rows.length||this.rows.size?'Drag to pan · Scroll to zoom · Hover or select trade markers':'No market bars have been collected yet.';this.draw();
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
 tooltip(e){const box=this.canvas.getBoundingClientRect(),px=e.clientX-box.left,py=e.clientY-box.top,p=this.points.find(p=>Math.hypot(p.x-px,p.y-py)<12),tip=$('lp-tooltip');tip.hidden=!p;if(!p)return;const f=p.fill;tip.textContent=`${f.symbol} ${f.side==='buy'?'Buy':'Sell'} ${f.quantity} shares\n${date(f.at)} NY\nPrice ${usd(f.price)} · Fees ${usd(f.fee)}\nPaper order #${f.order_id}`;tip.style.left=Math.min(e.clientX+14,window.innerWidth-290)+'px';tip.style.top=Math.max(10,Math.min(e.clientY+14,window.innerHeight-145))+'px'}
}
for(const s of symbols)charts.set(s,new Chart(s));
document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',async()=>{interval=button.dataset.interval;document.querySelectorAll('[data-interval]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));for(const c of charts.values())c.reset();await Promise.all([...charts.values()].map(c=>c.load()))}));
async function poll(){if(busy)return;busy=true;const epoch=authEpoch;try{
 if(auth&&Date.now()>auth.refresh_at){const r=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:auth.refresh_token},null);auth={...r,refresh_at:Date.now()+(r.expires_in-60)*1000}}
 const value=await rpc('lp_public_state');if(epoch!==authEpoch)return;const previousHistory=current?.daily_review?.historical_replay?.status;status(value);runId=value.run_id;await loadPerformance(previousHistory!==value.daily_review?.historical_replay?.status);
 if(runId){const nextFills=await rpc('lp_public_fills',{p_run:runId});if(epoch!==authEpoch)return;fills=nextFills;renderFills()}
 await Promise.all([...charts.values()].map(c=>c.load()));
 if(admin){const own=await rpc('lp_admin_state');$('lp-admin-state').textContent=`${own.summary?.status||'WAITING'} · Model input interval ${own.state?.portfolio?.interval||'Check the seed dataset settings'} · ${own.state?.queued_model?'Model switch queued for a future trading day':'No model switch queued'}${own.state?.feed_fault?' · Latest data fault '+(own.state.feed_fault.code??'')+' '+own.state.feed_fault.reason:''}`;$('lp-commands').textContent=(own.commands||[]).slice(0,6).map(c=>`${c.kind}: ${c.status}${c.result?.message?' — '+c.result.message:''}`).join('\n')}
 }catch(e){$('lp-status').textContent='Waiting for connection / check settings';$('lp-updated').textContent=e.message}finally{busy=false}}
function message(text){$('lp-admin-message').textContent=text}
$('lp-login').addEventListener('submit',async e=>{e.preventDefault();try{const a=await request('/auth/v1/token?grant_type=password',{email:$('lp-email').value,password:$('lp-password').value},null);auth={...a,refresh_at:Date.now()+(a.expires_in-60)*1000};if(!await rpc('lp_is_admin')){auth=null;throw Error('This account is not an authorized administrator.')}admin=true;authEpoch++;$('lp-password').value='';$('lp-login').hidden=true;$('lp-admin-controls').hidden=false;for(const c of charts.values())c.reset();message('Administrator signed in');await poll()}catch(e){auth=null;message(e.message)}});
$('lp-logout').addEventListener('click',async()=>{if(auth)try{await request('/auth/v1/logout',{},auth.access_token)}catch{}authEpoch++;auth=null;admin=false;selectedModel=null;performanceData=null;performanceRun=null;performanceEpoch=-1;performancePoints=[];performanceError=null;status({status:'NOT_CONNECTED'});renderPerformance();$('lp-model').value='';$('lp-admin-controls').hidden=true;$('lp-login').hidden=false;for(const c of charts.values())c.reset();fills=[];renderFills();await poll();message('Signed out.')});
$('lp-model').addEventListener('change',async()=>{try{const f=$('lp-model').files[0];if(!f){selectedModel=null;return}if(f.size>8000000)throw Error('Model JSON must be no larger than 8 MB.');selectedModel=JSON.parse(await f.text());message('Model loaded locally. It is uploaded only when you start or stage it.')}catch(e){selectedModel=null;message(e.message)}});
async function command(kind,payload){if(!admin)throw Error('Administrator sign-in is required.');const id=await rpc('lp_submit_command',{p_kind:kind,p_payload:payload,p_key:crypto.randomUUID()});message('Command received: '+id+' · The engine will mark it DONE or REJECTED after processing.');await poll()}
$('lp-start').addEventListener('click',async()=>{try{if(!selectedModel&&!current?.started_at)throw Error('Select an evaluated model JSON first.');const initial=Number($('lp-capital').value);if(!Number.isFinite(initial)||initial<100||initial>1e9)throw Error('Check the initial capital.');await command('START',{model:selectedModel,qualification_confirmed:$('lp-qualified').checked,execution_profile_confirmed:$('lp-costs').checked,extended_qualified:$('lp-extended').checked,session_policy:$('lp-session').value,profile:{initial_cash:initial,commission_per_share:.0035,minimum_commission:.35,sell_fee_rate:.0000206,spread_bps:2,slippage_bps:2,participation:.01,max_position:.25,label:'Owner-confirmed paper assumptions; not a broker fee quote'}})}catch(e){message(e.message)}});
$('lp-stop').addEventListener('click',async()=>{try{await command('STOP',{})}catch(e){message(e.message)}});
$('lp-stage').addEventListener('click',async()=>{try{if(!selectedModel)throw Error('Select a candidate model JSON.');await command('STAGE_MODEL',{model:selectedModel,qualification_confirmed:$('lp-qualified').checked})}catch(e){message(e.message)}});
$('lp-public-enable').addEventListener('click',async()=>{try{await command('SET_PUBLICATION',{enabled:$('lp-public-rights').checked,rights_confirmed:$('lp-public-rights').checked})}catch(e){message(e.message)}});
window.addEventListener('resize',()=>{for(const c of charts.values())c.draw();renderPerformance()});window.addEventListener('site-theme-change',()=>{for(const c of charts.values())c.draw();renderPerformance()});
setInterval(poll,5000);status({status:'NOT_CONNECTED'});renderPerformance();poll();
})();
