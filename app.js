/* ARVEX — ядро: состояние, рынок, график, сделки, профиль, навигация.
   Учебный симулятор: все средства виртуальные. By Mrasulv */
const $=id=>document.getElementById(id);
const ASSETS={
 BTCUSDT:{sym:"BTC",name:"Bitcoin",pair:"BTC / USDT",fb:74900},
 ETHUSDT:{sym:"ETH",name:"Ethereum",pair:"ETH / USDT",fb:3200},
 SOLUSDT:{sym:"SOL",name:"Solana",pair:"SOL / USDT",fb:165},
 BNBUSDT:{sym:"BNB",name:"BNB",pair:"BNB / USDT",fb:620}
};
const DEMO_CHANGE={BTCUSDT:1.24,ETHUSDT:-0.62,SOLUSDT:2.8,BNBUSDT:0.35};
const TF={"1m":60000,"5m":300000,"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000};
const API="https://api.binance.com/api/v3";
const STORAGE_KEY="arvex_v3_state";
const LEVEL_TITLES=["Новичок","Ученик","Практик","Трейдер","Профи","Эксперт","Мастер","Легенда"];
const AVATARS=[["#7c5cff","#4a2fd1"],["#ff6a85","#c92a57"],["#27d493","#0e8a5e"],["#f5c451","#c27c0e"],["#4f8cff","#2349c9"],["#ff8a4c","#c24a14"],["#c05cff","#7a1fd1"],["#3fd0e6","#0e7a8f"]];
const MMR=0.005, FUNDING_RATE=0.0001, FUNDING_MS=8*3600*1000;

let balance=10000, closedPnl=0, xp=0, level=1, positions=[], history=[], currentAsset="BTCUSDT";
let progress={lessons:{},quizzes:{},exams:{}};
let profile=null, tradeXp={day:"",amount:0}, tourDone=false, tourStep=0;
let prices={}, changes={}, live=false, klLive=false, tf="15m", candles=[], chart=null, candleReq=0, toastTimer=null, pendingAvatar=0, pendingPhoto="", editingProfile=false, activeScreen="trade";

// Страховка: заставка не должна зависнуть даже при ошибке запуска.
setTimeout(()=>{const s=$("splash");if(s)s.classList.add("out")},4500);

/* ===== Утилиты ===== */
function money(n){if(Math.abs(n)<0.00001)n=0;const a=Math.abs(n);return (n<0?"-":"")+"$"+a.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:a>=1?2:5})}
function signed(n){return (n>0?"+":"")+money(n)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function appFeedback(){
 try{
  if(localStorage.getItem("arvex_notifications_enabled")==="false")return;
  if(localStorage.getItem("arvex_vibration_enabled")==="true"&&navigator.vibrate)navigator.vibrate(35);
  if(localStorage.getItem("arvex_sound_enabled")==="true"){
   const Audio=window.AudioContext||window.webkitAudioContext;
   if(Audio){const ctx=new Audio(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="sine";osc.frequency.value=740;gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.09);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.1);osc.onended=()=>ctx.close()}
  }
 }catch(e){}
}
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2800);appFeedback()}
function marketPrice(a=currentAsset){return prices[a]??ASSETS[a].fb}
function levelTitle(){return LEVEL_TITLES[Math.min(level-1,LEVEL_TITLES.length-1)]}

/* ===== Состояние ===== */
function saveState(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify({balance,closedPnl,xp,level,positions,history,currentAsset,progress,tradeXp,profile,tourDone,updatedAt:Date.now()}));if(typeof Cloud!=="undefined")Cloud.schedule()}catch(e){}
}
function loadState(){
 let s=null;
 try{s=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")}catch(e){}
 if(s&&typeof s==="object"){
  const n=(v,d)=>Number.isFinite(v)?v:d;
  balance=n(s.balance,10000);closedPnl=n(s.closedPnl,0);xp=n(s.xp,0);level=Math.max(1,n(s.level,1));
  positions=Array.isArray(s.positions)?s.positions:[];history=Array.isArray(s.history)?s.history:[];
  if(s.currentAsset&&ASSETS[s.currentAsset])currentAsset=s.currentAsset;
  if(s.progress&&typeof s.progress==="object")progress={lessons:{...(s.progress.lessons||{})},quizzes:{...(s.progress.quizzes||{})},exams:{...(s.progress.exams||{})}};
  tourDone=!!s.tourDone;
  if(s.tradeXp&&typeof s.tradeXp==="object")tradeXp={day:String(s.tradeXp.day||""),amount:n(s.tradeXp.amount,0)};
  if(s.profile&&s.profile.name)profile={name:String(s.profile.name),username:String(s.profile.username||""),avatar:Number(s.profile.avatar)||0,photo:/^data:image\/jpeg;base64,/.test(s.profile.photo||"")?s.profile.photo:""};
 }
 if(!profile){ // миграция со старых версий
  try{const nm=localStorage.getItem("arvex_name"),un=localStorage.getItem("arvex_username");if(nm&&un)profile={name:nm,username:un,avatar:0}}catch(e){}
 }
 positions=positions.filter(p=>p&&ASSETS[p.asset]&&Number.isFinite(p.amount)&&Number.isFinite(p.entry));
 history=history.filter(p=>p&&ASSETS[p.asset]&&Number.isFinite(p.pnl));
}
function addXp(n){xp+=n;let up=false;if(xp>=100){level+=Math.floor(xp/100);xp%=100;up=true}return up}
function awardOnce(kind,id,amount){
 if(progress[kind][id])return {awarded:false,levelUp:false};
 progress[kind][id]=true;const levelUp=addXp(amount);saveState();renderTop();return {awarded:true,levelUp};
}

/* ===== Рынок: цены и свечи ===== */
async function fetchJSON(url,ms=6000){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
 try{const r=await fetch(url,{signal:ctl.signal});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}
}
async function fetchPrices(){
 try{
  const syms=encodeURIComponent(JSON.stringify(Object.keys(ASSETS)));
  const arr=await fetchJSON(`${API}/ticker/24hr?symbols=${syms}`);
  let ok=0;
  for(const x of arr){const p=Number(x.lastPrice);if(ASSETS[x.symbol]&&Number.isFinite(p)&&p>0){prices[x.symbol]=p;changes[x.symbol]=Number(x.priceChangePercent)||0;ok++}}
  live=ok>0;if(!ok)throw new Error("empty");
 }catch(e){
  live=false;
  for(const a in ASSETS){prices[a]=(prices[a]??ASSETS[a].fb)*(1+(Math.random()-.5)*0.0008);if(changes[a]==null)changes[a]=DEMO_CHANGE[a]}
 }
 applyLive();checkTriggers();renderTicker();renderHead();renderPositions();updateOrderPreview();
}
function applyLive(){
 if(!candles.length||!chart)return;
 const p=marketPrice(),tfMs=TF[tf],last=candles[candles.length-1];
 if(Date.now()>=last.t+tfMs){candles.push({t:Math.floor(Date.now()/tfMs)*tfMs,o:p,h:p,l:p,c:p,v:0})}
 else{last.c=p;if(p>last.h)last.h=p;if(p<last.l)last.l=p}
 chart.setData(candles,tfMs);updateOhlc(chart.cross?candles[chart.cross.i]:null);
}
function seeded(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19}
 return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);h^=h>>>16;return(h>>>0)/4294967296}}
function synthCandles(asset,tfKey){
 const n=300,tfMs=TF[tfKey],rnd=seeded(asset+tfKey),vol=0.0035*Math.sqrt(tfMs/900000)**0.8;
 const end=Math.floor(Date.now()/tfMs)*tfMs,arr=[];let price=100,trend=0;
 for(let i=0;i<n;i++){
  trend=trend*0.93+(rnd()-.5)*0.0009;
  const o=price,c=o*(1+trend+(rnd()-.5)*vol*2),h=Math.max(o,c)*(1+rnd()*vol*.7),l=Math.min(o,c)*(1-rnd()*vol*.7);
  arr.push({t:end-(n-1-i)*tfMs,o,h,l,c,v:200+rnd()*800*(1+Math.abs(c-o)/o*200)});price=c;
 }
 const k=marketPrice(asset)/arr[n-1].c;
 return arr.map(x=>({...x,o:x.o*k,h:x.h*k,l:x.l*k,c:x.c*k}));
}
async function loadCandles(){
 if(!chart)return;
 const asset=currentAsset,myTf=tf,req=++candleReq;let arr;
 try{
  const raw=await fetchJSON(`${API}/klines?symbol=${asset}&interval=${myTf}&limit=300`);
  arr=raw.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}));
  if(!arr.length||arr.some(c=>!Number.isFinite(c.c)||!Number.isFinite(c.t)))throw new Error("bad data");
  klLive=true;
 }catch(e){klLive=false;arr=synthCandles(asset,myTf)}
 if(req!==candleReq)return;
 candles=arr;
 if(klLive&&!live)prices[asset]=arr[arr.length-1].c;
 chart.setData(candles,TF[myTf]);updateOhlc();setChartLines();renderHead();
}
function updateOhlc(c){
 const k=c||candles[candles.length-1];if(!k){$("ohlcLine").innerHTML="";return}
 const d=(k.c-k.o)/k.o*100,f=v=>v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:v>=100?2:4});
 $("ohlcLine").innerHTML=`<span>O <b>${f(k.o)}</b></span><span>H <b>${f(k.h)}</b></span><span>L <b>${f(k.l)}</b></span><span>C <b>${f(k.c)}</b></span><span class="${d>=0?"pos":"neg"}"><b>${d>=0?"+":""}${d.toFixed(2)}%</b></span>`;
}
function setChartLines(){
 if(!chart)return;const L=[];
 positions.filter(p=>p.asset===currentAsset).forEach(p=>{const v=posView(p);
  L.push({price:p.entry,color:"#a58bff",label:`${p.direction} ${v.lev}x`});
  if(v.liq)L.push({price:v.liq,color:"#ff5470",label:"LIQ"});
  if(p.tp)L.push({price:p.tp,color:"#2ee59d",label:"TP"});
  if(p.sl)L.push({price:p.sl,color:"#ff9f43",label:"SL"});});
 chart.setLines(L);
}

/* ===== Фьючерсный симулятор ===== */
function liqPrice(entry,lev,direction){const px=direction==="LONG"?entry*(1-1/lev+MMR):entry*(1+1/lev-MMR);return px>0?px:null}
function posView(p,now=marketPrice(p.asset)){
 const lev=p.leverage||1,margin=p.margin??p.amount,size=p.size??p.amount,dir=p.direction==="LONG"?1:-1;
 const pnl=(now-p.entry)/p.entry*size*dir;
 const funding=size*FUNDING_RATE*((Date.now()-p.time)/FUNDING_MS)*dir;
 const net=pnl-funding,equity=margin+net;
 return {lev,margin,size,pnl,funding,net,equity,liq:liqPrice(p.entry,lev,p.direction),isLiq:equity<=size*MMR};
}
function updateOrderPreview(){
 const margin=Number($("amount").value)||0,lev=Number($("leverage").value)||1,entry=marketPrice();
 $("posSize").textContent=money(margin*lev);$("available").textContent=money(balance);
 const l=liqPrice(entry,lev,"LONG"),s=liqPrice(entry,lev,"SHORT");
 $("liqLong").textContent=l?money(l):"—";$("liqShort").textContent=s?money(s):"—";
}
function readTpSl(direction,entry){
 const parse=id=>{const raw=String($(id).value||"").trim().replace(",",".");if(!raw)return {v:null};const n=Number(raw);return Number.isFinite(n)&&n>0?{v:n}:{err:true}};
 const t=parse("tpPct"),l=parse("slPct");
 if(t.err||l.err)return {err:"Тейк-профит и стоп-лосс — положительные проценты (или оставь пустыми)."};
 if(l.v!=null&&l.v>=100)return {err:"Стоп-лосс должен быть меньше 100%."};
 const d=direction==="LONG"?1:-1;
 return {tp:t.v!=null?entry*(1+d*t.v/100):null,sl:l.v!=null?entry*(1-d*l.v/100):null};
}
function openTrade(direction){
 const margin=Number($("amount").value),lev=Number($("leverage").value)||1;
 if(!Number.isFinite(margin)||margin<=0){showToast("Укажи сумму больше нуля.");return false}
 if(margin<1){showToast("Минимальная сумма — $1.");return false}
 if(margin>balance){showToast("Недостаточно демо-средств для маржи.");return false}
 const entry=marketPrice(),ts=readTpSl(direction,entry);
 if(ts.err){showToast(ts.err);return false}
 const p={id:Date.now()+Math.floor(Math.random()*1000),asset:currentAsset,direction,amount:margin,margin,leverage:lev,size:margin*lev,entry,time:Date.now(),tp:ts.tp,sl:ts.sl};
 balance-=margin;positions.unshift(p);saveState();renderTop();renderPositions();updateOrderPreview();
 const lq=liqPrice(entry,lev,direction);
 const slBeyond=ts.sl&&lq&&((direction==="LONG"&&ts.sl<=lq)||(direction==="SHORT"&&ts.sl>=lq));
 showToast(`${direction} ${lev}x открыт. Ликвидация: ${lq?money(lq):"—"}${slBeyond?" ⚠ стоп дальше ликвидации":""}`);return true;
}
function tradeXpFor(p){
 if(Date.now()-p.time<30000)return 0; // защита от накрутки XP быстрыми сделками
 const day=new Date().toISOString().slice(0,10);if(tradeXp.day!==day)tradeXp={day,amount:0};
 const give=Math.min(10,50-tradeXp.amount);if(give<=0)return 0;tradeXp.amount+=give;return give;
}
// reason: "liq" | "sl" | "tp" | undefined (вручную). exitPrice — цена срабатывания стопа/тейка.
function closePosition(id,reason,exitPrice){
 const i=positions.findIndex(p=>p.id===id);if(i<0)return;
 const p=positions.splice(i,1)[0],now=exitPrice??marketPrice(p.asset),v=posView(p,now),liquidated=reason==="liq";
 const net=Math.max(liquidated?-v.margin:v.net,-v.margin);
 balance+=v.margin+net;closedPnl+=net;
 const got=liquidated?0:tradeXpFor(p),up=got?addXp(got):false;
 history.unshift({...p,exit:now,pnl:net,funding:v.funding,liquidated,reason:reason||"manual",closed:Date.now()});
 if(history.length>300)history.length=300;
 saveState();renderTop();renderPositions();renderPortfolio();updateOrderPreview();
 const res=`${net>=0?"+":""}${money(net)}${got?` · +${got} XP`:""}`;
 showToast(liquidated?`Ликвидация ${ASSETS[p.asset].pair}: потеряна маржа ${money(v.margin)}`
  :reason==="sl"?`Сработал стоп-лосс ${ASSETS[p.asset].sym}: ${res}`
  :reason==="tp"?`Сработал тейк-профит ${ASSETS[p.asset].sym}: ${res}`
  :up?`Новый уровень ARVEX: ${level}!`:`Сделка закрыта: ${res}`);
}
// Ликвидация проверяется первой: если стоп дальше неё, сработает ликвидация.
function checkTriggers(){
 positions.slice().forEach(p=>{
  if(posView(p).isLiq){closePosition(p.id,"liq");return}
  const now=marketPrice(p.asset),long=p.direction==="LONG";
  if(p.sl&&(long?now<=p.sl:now>=p.sl))closePosition(p.id,"sl",p.sl);
  else if(p.tp&&(long?now>=p.tp:now<=p.tp))closePosition(p.id,"tp",p.tp);
 });
}
function tradeStats(){
 const n=history.length,w=history.filter(h=>h.pnl>0),l=history.filter(h=>h.pnl<=0);
 const sum=a=>a.reduce((s,x)=>s+x.pnl,0);
 return {n,wins:w.length,winrate:n?w.length/n*100:0,totalPnl:closedPnl,
  best:n?Math.max(...history.map(h=>h.pnl)):0,worst:n?Math.min(...history.map(h=>h.pnl)):0,
  avgWin:w.length?sum(w)/w.length:0,avgLoss:l.length?sum(l)/l.length:0,
  liq:history.filter(h=>h.liquidated).length,avgLev:n?history.reduce((s,h)=>s+(h.leverage||1),0)/n:0};
}

/* ===== Отрисовка торговли ===== */
function renderTicker(){
 $("tickerRow").innerHTML=Object.keys(ASSETS).map(a=>{const c=changes[a]??DEMO_CHANGE[a];
  return `<button class="tick ${a===currentAsset?"on":""}" data-asset="${a}"><b>${ASSETS[a].sym}</b><span>${money(marketPrice(a))}</span><small class="${c>=0?"pos":"neg"}">${c>=0?"+":""}${c.toFixed(2)}%</small></button>`}).join("");
}
function renderHead(){
 const a=ASSETS[currentAsset],c=changes[currentAsset]??DEMO_CHANGE[currentAsset];
 $("pairName").textContent=`${a.name} · ${a.pair}`;$("bigPrice").textContent=money(marketPrice());
 const b=$("chgBadge");b.textContent=`${c>=0?"+":""}${c.toFixed(2)}% · 24ч`;b.classList.toggle("dn",c<0);
 const lv=$("liveStatus");lv.textContent=live?"● LIVE · Binance":"ДЕМО-ДАННЫЕ";lv.classList.toggle("on",live);
 $("chartSrc").textContent=klLive?"Данные: Binance":"Иллюстративные данные (нет связи с Binance)";
}
function positionRows(){
 if(!positions.length)return `<div class="empty">Нет открытых позиций.<br>Выбери направление и открой первую демо-сделку.</div>`;
 return positions.map(p=>{const v=posView(p);
  return `<div class="pos-row"><div class="l"><span class="tag ${p.direction==="LONG"?"long":"short"}">${p.direction} ${v.lev}x</span><b>${ASSETS[p.asset].sym}</b><small>Вход ${money(p.entry)} · Размер ${money(v.size)}</small></div>
  <div class="m"><b class="${v.net>=0?"pos":"neg"}">${v.net>=0?"+":""}${money(v.net)}</b><small>Маржа ${money(v.margin)} · Ликв. ${v.liq?money(v.liq):"—"}</small>${p.tp||p.sl?`<small>TP ${p.tp?money(p.tp):"—"} · SL ${p.sl?money(p.sl):"—"}</small>`:""}</div><button class="close-position" data-close="${p.id}">Закрыть</button></div>`}).join("");
}
function renderPositions(){
 const html=positionRows();$("positionsList").innerHTML=html;$("posBadge").textContent=positions.length;
 const pp=$("portfolioPositions");if(pp)pp.innerHTML=html;
 setChartLines();renderPortfolioStats();
}
function historyRows(){
 if(!history.length)return `<div class="empty">История пуста. Закрытые сделки появятся здесь.</div>`;
 const rtag=h=>h.liquidated?'<span class="tag liq">ЛИКВИДАЦИЯ</span>':h.reason==="sl"?'<span class="tag liq">СТОП</span>':h.reason==="tp"?'<span class="tag long">ТЕЙК</span>':"";
 return history.slice(0,60).map(h=>`<div class="pos-row"><div class="l"><span class="tag ${h.direction==="LONG"?"long":"short"}">${h.direction} ${h.leverage||1}x</span><b>${ASSETS[h.asset].sym}</b>${rtag(h)}<small>${new Date(h.closed||h.time).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</small></div>
  <div class="m"><b class="${h.pnl>=0?"pos":"neg"}">${h.pnl>=0?"+":""}${money(h.pnl)}</b><small>Маржа ${money(h.margin??h.amount)}</small></div><span></span></div>`).join("");
}
function renderPortfolioStats(){
 const box=$("portfolioStats");if(!box)return;
 const st=tradeStats(),open=positions.reduce((s,p)=>s+posView(p).net,0),eq=balance+positions.reduce((s,p)=>s+posView(p).equity,0);
 box.innerHTML=`<div class="stat-grid">
  <div class="stat"><small>Капитал</small><b>${money(eq)}</b></div>
  <div class="stat"><small>Свободно</small><b>${money(balance)}</b></div>
  <div class="stat"><small>Закрытый результат</small><b class="${st.totalPnl>=0?"pos":"neg"}">${st.totalPnl>=0?"+":""}${money(st.totalPnl)}</b></div>
  <div class="stat"><small>Открытый результат</small><b class="${open>=0?"pos":"neg"}">${open>=0?"+":""}${money(open)}</b></div>
  <div class="stat"><small>Сделок</small><b>${st.n}</b></div>
  <div class="stat"><small>Винрейт</small><b>${st.n?st.winrate.toFixed(0)+"%":"—"}</b></div></div>`;
}
function renderPortfolio(){renderPortfolioStats();$("portfolioPositions").innerHTML=positionRows();$("historyContent").innerHTML=historyRows()}

/* ===== Верхняя панель и профиль ===== */
function applyAvatar(el,idx,name,photo){
 if(photo){el.style.background=`center/cover no-repeat url(${photo})`;el.textContent="";return}
 const [a,b]=AVATARS[(idx||0)%AVATARS.length];el.style.background=`linear-gradient(135deg,${a},${b})`;
 el.textContent=((name||"A").trim().charAt(0)||"A").toUpperCase();
}
function renderTop(){
 $("topBalance").textContent=Math.abs(balance)>=1e6?(balance<0?"-":"")+"$"+(Math.abs(balance)/1e6).toFixed(2)+"M":money(balance);$("topLvl").textContent=level;
 applyAvatar($("topAvatar"),profile?.avatar,profile?.name,profile?.photo);
 if(activeScreen==="profile")renderProfile();
}
const ACHIEVEMENTS=[
 {i:"🚀",t:"Первый шаг",d:"Создать профиль",ok:()=>!!profile},
 {i:"📈",t:"Первая сделка",d:"Открыть позицию",ok:()=>history.length+positions.length>=1},
 {i:"💰",t:"В плюсе",d:"Закрыть сделку с прибылью",ok:()=>history.some(h=>h.pnl>0)},
 {i:"🔟",t:"Десять сделок",d:"Закрыть 10 сделок",ok:()=>history.length>=10},
 {i:"💥",t:"Урок усвоен",d:"Пережить ликвидацию",ok:()=>history.some(h=>h.liquidated)},
 {i:"📘",t:"Первый урок",d:"Пройти урок",ok:()=>Object.keys(progress.lessons).length>=1},
 {i:"🎓",t:"Выпускник",d:"Пройти все уроки",ok:()=>typeof LESSONS!=="undefined"&&LESSONS.every(l=>progress.lessons[l.id])},
 {i:"✅",t:"Отличник",d:"Сдать все тесты",ok:()=>typeof LESSONS!=="undefined"&&LESSONS.every(l=>progress.quizzes[l.id])},
 {i:"🏅",t:"Экзамен новичка",d:"Сдать экзамен",ok:()=>!!progress.exams.novice?.passed},
 {i:"🏆",t:"Экзамен трейдера",d:"Сдать экзамен",ok:()=>!!progress.exams.advanced?.passed},
 {i:"👑",t:"Экзамен эксперта",d:"Сдать экспертный экзамен",ok:()=>!!progress.exams.expert?.passed},
 {i:"🎯",t:"Автозакрытие",d:"Сработал стоп или тейк",ok:()=>history.some(h=>h.reason==="sl"||h.reason==="tp")},
 {i:"⭐",t:"Уровень 5",d:"Достичь 5 уровня",ok:()=>level>=5}
];
function renderProfile(){
 const box=$("profileBody");if(!box)return;
 const p=profile||{name:"Гость",username:"guest",avatar:0},st=tradeStats(),ach=ACHIEVEMENTS.filter(a=>a.ok()).length;
 const lessonsDone=Object.keys(progress.lessons).length,total=typeof LESSONS!=="undefined"?LESSONS.length:0;
 const exams=Object.values(progress.exams).filter(e=>e.passed).length;
 box.innerHTML=`<div class="card"><div class="profile-hero"><div class="avatar" id="profAvatar"></div><div><h2>${esc(p.name)}</h2><div class="un">@${esc(p.username)}</div><span class="lvl-title">Уровень ${level} · ${levelTitle()}</span></div></div>
  <div class="xpwrap"><div class="row"><span>Опыт</span><b>${xp} / 100 XP</b></div><div class="xpbar"><i style="width:${xp}%"></i></div></div>
  <div class="btn-row"><button class="ghost" id="editProfile">✎ Редактировать</button><button class="ghost" id="showTour">? Обучающий тур</button><button class="danger" id="resetAccount">Сбросить демо-счёт</button></div></div>
  <div class="stat-grid"><div class="stat"><small>Сделок</small><b>${st.n}</b></div><div class="stat"><small>Винрейт</small><b>${st.n?st.winrate.toFixed(0)+"%":"—"}</b></div>
  <div class="stat"><small>Результат</small><b class="${closedPnl>=0?"pos":"neg"}">${closedPnl>=0?"+":""}${money(closedPnl)}</b></div><div class="stat"><small>Лучшая сделка</small><b class="${st.best>0?"pos":""}">${st.n?signed(st.best):"—"}</b></div>
  <div class="stat"><small>Уроков</small><b>${lessonsDone}/${total}</b></div><div class="stat"><small>Экзаменов сдано</small><b>${exams}/${typeof EXAMS!=="undefined"?Object.keys(EXAMS).length:2}</b></div></div>
  <div class="card"><div class="card-title">Достижения <span class="badge">${ach}/${ACHIEVEMENTS.length}</span></div><div class="ach-grid">${ACHIEVEMENTS.map(a=>`<div class="ach ${a.ok()?"on":""}"><i>${a.i}</i><b>${a.t}</b><small>${a.d}</small></div>`).join("")}</div></div>
  <div class="card"><div class="card-title">Настройки</div>
   <label class="lbl" for="arvexLanguage">Язык приложения</label>
   <select class="field" id="arvexLanguage"><option value="ru">Русский</option><option value="en">English</option></select>
   <div class="btn-row" style="margin-top:10px"><button class="ghost" id="arvexChangePassword">Изменить пароль</button><button class="ghost" id="arvexNotificationsPermission">Разрешить уведомления</button></div>
   <label class="setting-toggle"><input type="checkbox" id="arvexNotificationsToggle" checked><span>Уведомления приложения</span></label>
   <label class="setting-toggle"><input type="checkbox" id="arvexSoundToggle"><span>Звуки</span></label>
   <label class="setting-toggle"><input type="checkbox" id="arvexVibrationToggle"><span>Вибрация</span></label>
   <p class="muted" id="arvexSettingsMsg">Выбери язык и настрой уведомления приложения.</p>
  </div>
  <div class="card"><div class="card-title">Аккаунт</div>${typeof Cloud!=="undefined"?Cloud.accountHTML():""}</div>${typeof Access!=="undefined"?Access.cardHTML():""}${typeof Cloud!=="undefined"?Cloud.userToolsHTML():""}`;
 applyAvatar($("profAvatar"),p.avatar,p.name,p.photo);
 const langSelect=$("arvexLanguage");if(langSelect)langSelect.value=localStorage.getItem("arvex_language")||"ru";
 const notif=$("arvexNotificationsToggle"),sound=$("arvexSoundToggle"),vibration=$("arvexVibrationToggle");
 if(notif)notif.checked=localStorage.getItem("arvex_notifications_enabled")!=="false";
 if(sound)sound.checked=localStorage.getItem("arvex_sound_enabled")==="true";
 if(vibration)vibration.checked=localStorage.getItem("arvex_vibration_enabled")==="true";
 if(typeof Cloud!=="undefined"&&Cloud.loadProfileData)Cloud.loadProfileData();
 applyLanguage(localStorage.getItem("arvex_language")||"ru");
}
function openProfileModal(edit){
 editingProfile=!!edit;pendingAvatar=profile?.avatar||0;pendingPhoto=profile?.photo||"";
 $("welcomeTitle").textContent=edit?"Редактирование профиля":"Добро пожаловать в ARVEX";
 $("welcomeText").textContent=edit?"Измени имя, username или аватар.":"Создай профиль: сохраним демо-баланс, сделки, XP и прогресс школы на этом устройстве.";
 $("createProfile").textContent=edit?"Сохранить":"Создать профиль";$("cancelProfile").classList.toggle("hidden",!edit);
 $("welcomeName").value=edit&&profile?profile.name:"";$("welcomeUsername").value=edit&&profile?profile.username:"";
 renderAvatarPicker();$("welcomeModal").classList.remove("hidden");
}
function renderAvatarPicker(){
 const name=$("welcomeName").value||"A";
 $("welcomeAvatars").innerHTML=AVATARS.map((g,i)=>`<button type="button" class="av ${i===pendingAvatar&&!pendingPhoto?"on":""}" data-av="${i}" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${esc((name.trim().charAt(0)||"A").toUpperCase())}</button>`).join("")+
  `<label class="av photo ${pendingPhoto?"on":""}" style="${pendingPhoto?`background:center/cover url(${pendingPhoto})`:""}">${pendingPhoto?"":"📷"}<input type="file" id="avPhoto" accept="image/*" hidden></label>`+(pendingPhoto?`<button type="button" class="ghost" id="avPhotoDel" style="grid-column:1/-1">Убрать фото</button>`:"");
}
function pickPhoto(file){
 if(!file||!/^image\//.test(file.type)){showToast("Выбери картинку.");return}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{
  const c=document.createElement("canvas"),S=160;c.width=c.height=S;
  const m=Math.min(img.width,img.height),sx=(img.width-m)/2,sy=(img.height-m)/2;
  c.getContext("2d").drawImage(img,sx,sy,m,m,0,0,S,S);
  pendingPhoto=c.toDataURL("image/jpeg",0.85);URL.revokeObjectURL(url);renderAvatarPicker();
 };
 img.onerror=()=>{URL.revokeObjectURL(url);showToast("Не удалось открыть фото.")};
 img.src=url;
}
function submitProfile(){
 const name=$("welcomeName").value.trim(),un=$("welcomeUsername").value.trim();
 if(!name){showToast("Введи имя.");return}
 if(!/^[A-Za-z0-9_]{3,20}$/.test(un)){showToast("Username: 3–20 символов, латиница, цифры, _");return}
 profile={name,username:un,avatar:pendingAvatar,photo:pendingPhoto};saveState();
 $("welcomeModal").classList.add("hidden");renderTop();
 showToast(editingProfile?"Профиль обновлён.":`Добро пожаловать, ${name}!`);
 if(!editingProfile&&!tourDone)setTimeout(()=>openTour(0),700);
}

/* ===== Нижняя панель (sheet) ===== */
function openSheet(html){$("sheetBody").innerHTML=html;$("sheet").classList.remove("hidden");applyLanguage(localStorage.getItem("arvex_language")||"ru")}
function closeSheet(){$("sheet").classList.add("hidden")}
function confirmTrade(direction){
 const margin=Number($("amount").value),lev=Number($("leverage").value)||1;
 if(!Number.isFinite(margin)||margin<=0){showToast("Укажи сумму больше нуля.");return}
 if(margin>balance){showToast("Недостаточно демо-средств для маржи.");return}
 const entry=marketPrice(),lq=liqPrice(entry,lev,direction),ts=readTpSl(direction,entry);
 if(ts.err){showToast(ts.err);return}
 openSheet(`<h3>${direction} ${ASSETS[currentAsset].sym} · ${lev}x</h3><div class="kvs"><div><span>Цена входа</span><b>${money(entry)}</b></div><div><span>Маржа</span><b>${money(margin)}</b></div><div><span>Размер позиции</span><b>${money(margin*lev)}</b></div><div><span>Ликвидация</span><b class="neg">${lq?money(lq):"—"}</b></div>${ts.tp?`<div><span>Тейк-профит</span><b class="pos">${money(ts.tp)}</b></div>`:""}${ts.sl?`<div><span>Стоп-лосс</span><b class="neg">${money(ts.sl)}</b></div>`:""}</div>
  <div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="${direction==="LONG"?"buy":"sell"}" id="sheetConfirm" data-dir="${direction}"><b>Открыть ${direction}</b></button></div><p class="note">Демо-сделка на виртуальные средства.</p>`);
}
function resetAccount(){
 openSheet(`<h3>Сбросить демо-счёт?</h3><p class="muted">Баланс вернётся к $10,000, позиции и история сделок будут удалены. Уровень, XP и прогресс школы сохранятся.</p><div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="sell" id="resetConfirm"><b>Сбросить</b></button></div>`);
}

/* ===== Обучающий тур ===== */
const TOUR=[
 {i:"🚀",t:"Это ARVEX",d:"Учебная платформа по трейдингу. Торгуй на виртуальные $10 000, учись и расти в уровнях. Реальные деньги не используются."},
 {i:"📈",t:"Торговля",d:"Выбери актив, плечо и направление. Задай тейк-профит и стоп-лосс — позиция закроется сама. Кнопка ⛶ над графиком открывает его на весь экран."},
 {i:"🎓",t:"Школа",d:"9 уроков, тесты, словарь и экзамены со случайными вопросами. За обучение начисляется XP."},
 {i:"🧮",t:"Инструменты",d:"Калькулятор позиции и риска, а также помощник: объяснит термины и разберёт твои сделки."},
 {i:"🏅",t:"Профиль",d:"Уровень, достижения и статистика. Данные хранятся на этом устройстве, прогресс сохраняется автоматически."}
];
function openTour(step){
 tourDone=true;saveState();$("toast").classList.remove("show");tourStep=Math.max(0,Math.min(step,TOUR.length-1));
 const s=TOUR[tourStep],last=tourStep===TOUR.length-1;
 openSheet(`<div style="text-align:center"><div style="font-size:44px">${s.i}</div><h3 style="margin:8px 0">${s.t}</h3><p class="muted">${s.d}</p>
  <div class="tour-dots">${TOUR.map((_,i)=>`<i class="${i===tourStep?"on":""}"></i>`).join("")}</div></div>
  <div class="dir-btns" style="margin-top:14px"><button class="ghost" id="tourSkip">${last?"Закрыть":"Пропустить"}</button><button class="primary" style="margin:0" id="tourNext">${last?"Начать!":"Далее →"}</button></div>`);
}

/* ===== Навигация ===== */
function go(screen){
 if(screen!=="trade")setFullscreen(false);
 activeScreen=screen;
 document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id==="screen-"+screen));
 document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===screen));
 window.scrollTo(0,0);
 if(screen==="trade"&&chart)setTimeout(()=>chart.resize(),30);
 if(screen==="portfolio")renderPortfolio();
 if(screen==="school"&&typeof renderSchool==="function")renderSchool();
 if(screen==="tools"&&typeof renderTools==="function")renderTools();
 if(screen==="profile")renderProfile();
 applyLanguage(localStorage.getItem("arvex_language")||"ru");
}
function setFullscreen(on){
 const card=$("chartCard");if(!card||card.classList.contains("fs")===on)return;
 card.classList.toggle("fs",on);document.body.classList.toggle("noscroll",on);
 requestAnimationFrame(()=>{chart&&chart.resize();requestAnimationFrame(()=>chart&&chart.resize())});
}

/* ===== Заставка ===== */
function runSplash(done){
 const s=$("splash"),sub=$("splashSub"),msgs=["Добро пожаловать","Загружаем рынок…","Готово к торговле"];
 let i=0;const iv=setInterval(()=>{i=Math.min(i+1,msgs.length-1);if(sub)sub.textContent=msgs[i]},650);
 setTimeout(()=>{clearInterval(iv);s.classList.add("out");setTimeout(done,350)},2000);
}


/* ===== Язык интерфейса RU / EN ===== */
const UI_EN={
"Торговля":"Trading","Портфель":"Portfolio","Школа":"Academy","Инструменты":"Tools","Профиль":"Profile",
"Новая сделка":"New trade","Только виртуальные средства":"Virtual funds only","Маржа (своя сумма)":"Margin (your amount)",
"Плечо":"Leverage","Тейк-профит, %":"Take profit, %","Стоп-лосс, %":"Stop loss, %","Доступно":"Available",
"Размер позиции":"Position size","Ликвидация LONG":"LONG liquidation","Ликвидация SHORT":"SHORT liquidation",
"Открытые позиции":"Open positions","Нет открытых позиций.":"No open positions.",
"История сделок":"Trade history","Достижения":"Achievements","Аккаунт":"Account","Настройки":"Settings",
"Язык приложения":"App language","Русский":"Russian","Изменить пароль":"Change password","Уведомления":"Notifications","Разрешить уведомления":"Allow notifications","Уведомления приложения":"App notifications","Звуки":"Sounds","Вибрация":"Vibration","Удалить аккаунт":"Delete account","Удалить аккаунт ARVEX?":"Delete ARVEX account?","Причина блокировки":"Ban reason","Активные блокировки":"Active bans","Управление аккаунтами":"Account management","Найти пользователя":"Find user","Заблокировать":"Ban user","Снять блокировку":"Unban user","Обращения пользователей":"User requests","Управление промокодами":"Manage promo codes",
"Выбери язык и настрой уведомления приложения.":"Choose the app language and configure notifications.",
"Редактировать":"Edit profile","Обучающий тур":"Guided tour","Сбросить демо-счёт":"Reset demo account",
"Сделок":"Trades","Винрейт":"Win rate","Результат":"Result","Лучшая сделка":"Best trade",
"Уроков":"Lessons","Экзаменов сдано":"Exams passed","Опыт":"Experience",
"Войти":"Sign in","Регистрация":"Sign up","Email":"Email","Пароль (от 8 символов)":"Password (at least 8 characters)",
"Письмо отправлено. Подтверди почту и нажми «Войти».":"Confirmation email sent. Verify your email, then tap “Sign in”.",
"Синхронизировать":"Sync","Выйти":"Sign out","Сервисы аккаунта":"Account services",
"Промокод":"Promo code","Активировать":"Redeem","История платежей":"Payment history",
"Поддержка ARVEX":"ARVEX Support","Отправить обращение":"Send request","Управление промокодами":"Manage promo codes",
"Обращения пользователей":"User requests","Проверить уведомления":"Check notifications",
"Уроки":"Lessons","Экзамен":"Exam","Словарь":"Glossary","Калькулятор":"Calculator","Помощник":"Assistant",
"Создать профиль":"Create profile","Сохранить":"Save","Отмена":"Cancel","Закрыть":"Close",
"Добро пожаловать в ARVEX":"Welcome to ARVEX","Имя":"Name","Аватар":"Avatar",
"Счёт":"Balance","Funding Rate":"Funding Rate","Демо-счёт сброшен.":"Demo account reset.",
"Управление аккаунтами":"Account management","Активные блокировки":"Active bans","Найти пользователя":"Find user","Заблокировать":"Ban user","Снять блокировку":"Remove ban","Причина блокировки":"Reason for the ban","Обжаловать блокировку":"Appeal the ban","Выйти из приложения":"Exit the app","G Продолжить с Google":"Continue with Google",
"Этот email уже зарегистрирован. Нажми «Войти» или «Забыли пароль?»." :"This email is already registered. Sign in or reset your password.",
"Сначала подтверди email по ссылке из письма, затем войди.":"Verify your email using the link we sent, then sign in.",
"Неверный email или пароль. Если входил через Google, нажми кнопку Google.":"Incorrect email or password. If you used Google, choose Continue with Google.",
"Уведомления включены.":"Notifications enabled.","Уведомления выключены.":"Notifications disabled.",
"Звуки включены.":"Sounds enabled.","Звуки выключены.":"Sounds disabled.",
"Вибрация включена.":"Vibration enabled.","Вибрация выключена.":"Vibration disabled.",
"Системные уведомления разрешены.":"System notifications are allowed.","Разрешение на уведомления не получено.":"Notification permission was not granted.",
"Этот браузер не поддерживает системные уведомления.":"This browser does not support system notifications.","Уведомления включены.":"Notifications enabled.","Уведомления выключены.":"Notifications disabled.",
"Заблокировать аккаунт":"Ban account","Подробно укажи причину (минимум 5 символов)":"Enter a detailed reason (at least 5 characters)","Подтвердить блокировку":"Confirm ban","Снять блокировку?":"Remove the ban?","Пользователь снова сможет войти в ARVEX.":"The user will be able to sign in to ARVEX again.","Удалить аккаунт ARVEX?":"Delete ARVEX account?","Это действие необратимо. Удалятся облачный аккаунт и связанные с ним данные. Если Premium продлевается автоматически, автопродление сначала будет отключено. Для подтверждения введи DELETE.":"This action cannot be undone. Your cloud account and related data will be deleted. If Premium renews automatically, renewal will be cancelled first. Enter DELETE to confirm.","Введи DELETE для подтверждения.":"Enter DELETE to confirm.","Удаляем аккаунт…":"Deleting account…","Применяю блокировку…":"Applying ban…","Аккаунт заблокирован.":"Account blocked.","Блокировка снята.":"Ban removed.","Укажи причину минимум из 5 символов.":"Enter a reason of at least 5 characters."
};
function applyLanguage(lang){
 const en=lang==="en";document.documentElement.lang=en?"en":"ru";
 const walk=root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){
  const raw=n.nodeValue,trim=raw.trim();if(!trim)continue;
  if(en&&UI_EN[trim])n.nodeValue=raw.replace(trim,UI_EN[trim]);
  else if(!en){const back=Object.entries(UI_EN).find(([ru,eng])=>eng===trim);if(back)n.nodeValue=raw.replace(trim,back[0])}
 }};
 walk(document.body);
 document.querySelectorAll("input[placeholder],textarea[placeholder],button[aria-label]").forEach(el=>{
  const key=el.getAttribute("placeholder")||el.getAttribute("aria-label");if(en&&UI_EN[key]){if(el.hasAttribute("placeholder"))el.setAttribute("placeholder",UI_EN[key]);else el.setAttribute("aria-label",UI_EN[key])}
  else if(!en){const back=Object.entries(UI_EN).find(([ru,eng])=>eng===key);if(back){if(el.hasAttribute("placeholder"))el.setAttribute("placeholder",back[0]);else el.setAttribute("aria-label",back[0])}}
 });
}

/* ===== Запуск ===== */
function bind(){
 document.addEventListener("change",e=>{
  if(e.target&&e.target.id==="avPhoto")pickPhoto(e.target.files&&e.target.files[0]);
  if(e.target&&e.target.id==="arvexLanguage"){localStorage.setItem("arvex_language",e.target.value);applyLanguage(e.target.value);const m=$("arvexSettingsMsg");if(m)m.textContent=e.target.value==="en"?"Language changed to English.":"Язык изменён на русский.";if(typeof Cloud!=="undefined"&&Cloud.loadProfileData)Cloud.loadProfileData(true)}
  if(e.target&&e.target.id==="arvexNotificationsToggle"){localStorage.setItem("arvex_notifications_enabled",String(e.target.checked));const m=$("arvexSettingsMsg"),en=localStorage.getItem("arvex_language")==="en";if(m)m.textContent=e.target.checked?(en?"Notifications enabled.":"Уведомления включены."):(en?"Notifications disabled.":"Уведомления выключены.")}
  if(e.target&&e.target.id==="arvexSoundToggle"){localStorage.setItem("arvex_sound_enabled",String(e.target.checked));const m=$("arvexSettingsMsg"),en=localStorage.getItem("arvex_language")==="en";if(m)m.textContent=e.target.checked?(en?"Sounds enabled.":"Звуки включены."):(en?"Sounds disabled.":"Звуки выключены.");if(e.target.checked)appFeedback()}
  if(e.target&&e.target.id==="arvexVibrationToggle"){localStorage.setItem("arvex_vibration_enabled",String(e.target.checked));const m=$("arvexSettingsMsg"),en=localStorage.getItem("arvex_language")==="en";if(m)m.textContent=e.target.checked?(en?"Vibration enabled.":"Вибрация включена."):(en?"Vibration disabled.":"Вибрация выключена.");if(e.target.checked)appFeedback()}
 });
 document.addEventListener("click",e=>{
  const t=e.target;
  if(typeof Cloud!=="undefined"&&Cloud.click(t))return;
  if(typeof Access!=="undefined"&&Access.click(t))return;
  if(t.closest("#avPhotoDel")){pendingPhoto="";renderAvatarPicker();return}
  const go_=t.closest("[data-go]");if(go_){go(go_.dataset.go);return}
  const cl=t.closest("[data-close]");if(cl){closePosition(Number(cl.dataset.close));return}
  const as=t.closest("[data-asset]");if(as){currentAsset=as.dataset.asset;saveState();renderTicker();renderHead();updateOrderPreview();candles=[];chart.setData([]);loadCandles();return}
  const tfb=t.closest("[data-tf]");if(tfb){tf=tfb.dataset.tf;document.querySelectorAll("#tfSeg button").forEach(b=>b.classList.toggle("on",b===tfb));loadCandles();return}
  const ind=t.closest("[data-ind]");if(ind){const k=ind.dataset.ind;chart[k]=!chart[k];ind.classList.toggle("on",chart[k]);chart.draw();return}
  const lv=t.closest("[data-lev]");if(lv){$("leverage").value=lv.dataset.lev;$("levLabel").textContent=lv.dataset.lev+"x";document.querySelectorAll("#levChips button").forEach(b=>b.classList.toggle("on",b===lv));updateOrderPreview();return}
  const pc=t.closest("[data-pct]");if(pc){$("amount").value=Math.floor(balance*Number(pc.dataset.pct))/100;updateOrderPreview();return}
  const op=t.closest("[data-open]");if(op){confirmTrade(op.dataset.open);return}
  const av=t.closest("[data-av]");if(av){pendingAvatar=Number(av.dataset.av);pendingPhoto="";renderAvatarPicker();return}
  if(t.closest("#tourNext")){if(tourStep>=TOUR.length-1)closeSheet();else openTour(tourStep+1);return}
  if(t.closest("#tourSkip")){closeSheet();return}
  if(t.closest("#showTour")){openTour(0);return}
  if(t.closest("#sheetCancel")){closeSheet();return}
  const sc=t.closest("#sheetConfirm");if(sc){closeSheet();openTrade(sc.dataset.dir);return}
  if(t.closest("#resetConfirm")){balance=10000;closedPnl=0;positions=[];history=[];saveState();closeSheet();renderTop();renderPositions();renderPortfolio();updateOrderPreview();showToast("Демо-счёт сброшен.");return}
  if(t.closest("#arvexChangePassword")){if(typeof Cloud!=="undefined"&&Cloud.isIn())Cloud.changePasswordPrompt();else showToast("Сначала войди в аккаунт ARVEX.");return}
  if(t.closest("#arvexNotificationsPermission")){
   const m=$("arvexSettingsMsg"),native=typeof window.ARVEX_CAP_IS_NATIVE==="function"?window.ARVEX_CAP_IS_NATIVE():!!(window.Capacitor&&window.Capacitor.isNativePlatform()),plugin=window.ARVEX_CAP_LOCAL_NOTIFICATIONS;
   if(native&&plugin){plugin.requestPermissions().then(v=>{if(m)m.textContent=v&&v.display==="granted"?(localStorage.getItem("arvex_language")==="en"?"System notifications are allowed.":"Системные уведомления разрешены."):(localStorage.getItem("arvex_language")==="en"?"Notification permission was not granted.":"Разрешение на уведомления не получено.")}).catch(e=>{if(m)m.textContent=(localStorage.getItem("arvex_language")==="en"?"Could not request permission: ":"Не удалось запросить разрешение: ")+e.message});return}
   if(!("Notification" in window)){if(m)m.textContent=localStorage.getItem("arvex_language")==="en"?"This browser does not support system notifications.":"Этот браузер не поддерживает системные уведомления.";return}
   Notification.requestPermission().then(v=>{if(m)m.textContent=v==="granted"?(localStorage.getItem("arvex_language")==="en"?"System notifications are allowed.":"Системные уведомления разрешены."):(localStorage.getItem("arvex_language")==="en"?"Notification permission was not granted.":"Разрешение на уведомления не получено.")});
   return;
  }
  if(t.closest("#editProfile")){openProfileModal(true);return}
  if(t.closest("#resetAccount")){resetAccount();return}
  if(t.id==="sheet"){closeSheet();return}
 });
 $("buyBtn").onclick=()=>openTrade("LONG");$("sellBtn").onclick=()=>openTrade("SHORT");
 $("amount").addEventListener("input",updateOrderPreview);
 $("fsBtn").onclick=()=>setFullscreen(true);$("fsClose").onclick=()=>setFullscreen(false);
 $("zoomIn").onclick=()=>chart.zoom(0.8);$("zoomOut").onclick=()=>chart.zoom(1.25);
 $("createProfile").onclick=submitProfile;$("cancelProfile").onclick=()=>$("welcomeModal").classList.add("hidden");
 $("welcomeName").addEventListener("input",renderAvatarPicker);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){setFullscreen(false);closeSheet()}});
 window.addEventListener("resize",()=>chart&&chart.resize());
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveState();else if(typeof Cloud!=="undefined"){if(Cloud.checkAccountStatus)Cloud.checkAccountStatus();if(Cloud.loadNotifications)Cloud.loadNotifications()}});
 window.addEventListener("pagehide",saveState);
}
function init(){
 try{loadState()}catch(e){}
 applyLanguage(localStorage.getItem("arvex_language")||"ru");
 chart=new CandleChart($("chartCanvas"),{onCross:c=>updateOhlc(c)});
 bind();
 renderTop();renderTicker();renderHead();renderPositions();renderPortfolio();updateOrderPreview();
 loadCandles();fetchPrices();
 if(typeof Cloud!=="undefined"){
  if(Cloud.acceptEmailConfirmation){
   Cloud.acceptEmailConfirmation().then(handled=>{if(!handled){Cloud.sync();if(typeof Access!=="undefined")Access.refresh()}}).catch(()=>{Cloud.sync();if(typeof Access!=="undefined")Access.refresh()});
  }else{Cloud.sync();if(typeof Access!=="undefined")Access.refresh()}
 }else if(typeof Access!=="undefined")Access.refresh();
 if("serviceWorker" in navigator&&!window.Capacitor&&/^https?:/.test(location.protocol))navigator.serviceWorker.register("sw.js").catch(()=>{});
 setInterval(fetchPrices,5000);setInterval(loadCandles,45000);
 runSplash(()=>{if(!profile)openProfileModal(false)});
}
window.addEventListener("DOMContentLoaded",init);
