const $=id=>document.getElementById(id);
const ASSETS={
 BTCUSDT:{name:"Bitcoin",pair:"BTC / USDT",symbol:"BINANCE:BTCUSDT",icon:"₿",fallback:67000},
 ETHUSDT:{name:"Ethereum",pair:"ETH / USDT",symbol:"BINANCE:ETHUSDT",icon:"Ξ",fallback:3500},
 SOLUSDT:{name:"Solana",pair:"SOL / USDT",symbol:"BINANCE:SOLUSDT",icon:"◎",fallback:160},
 BNBUSDT:{name:"BNB",pair:"BNB / USDT",symbol:"BINANCE:BNBUSDT",icon:"◆",fallback:600}
};
let balance=10000, closedPnl=0, xp=0, level=1, positions=[], history=[], prices={}, currentAsset="BTCUSDT", toastTimer;
let progress={lessons:{},quizzes:{}};

const STORAGE_KEY="arvex_v3_state";
function saveState(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify({balance,closedPnl,xp,level,positions,history,currentAsset,progress,profile:{name:localStorage.getItem("arvex_name")||"",username:localStorage.getItem("arvex_username")||""}}))}catch(e){}
}
// XP: единая точка начисления. Возвращает true, если получен новый уровень.
function addXp(n){
 xp+=n;let up=false;
 if(xp>=100){level+=Math.floor(xp/100);xp%=100;up=true}
 return up;
}
// Начисление XP один раз за конкретный урок/тест.
function awardOnce(kind,id,amount){
 if(progress[kind][id])return {awarded:false,levelUp:false};
 progress[kind][id]=true;
 const levelUp=addXp(amount);
 saveState();
 return {awarded:true,levelUp};
}
function loadState(){
 try{
  const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
  if(!s)return;
  if(Number.isFinite(s.balance))balance=s.balance;
  if(Number.isFinite(s.closedPnl))closedPnl=s.closedPnl;
  if(Number.isFinite(s.xp))xp=s.xp;
  if(Number.isFinite(s.level))level=s.level;
  if(Array.isArray(s.positions))positions=s.positions;
  if(Array.isArray(s.history))history=s.history;
  if(s.currentAsset&&ASSETS[s.currentAsset])currentAsset=s.currentAsset;
  if(s.progress&&typeof s.progress==="object"){
   progress={lessons:{...(s.progress.lessons||{})},quizzes:{...(s.progress.quizzes||{})}};
  }
  // Отбрасываем повреждённые записи, чтобы они не ломали интерфейс.
  positions=positions.filter(p=>p&&ASSETS[p.asset]&&Number.isFinite(p.amount)&&Number.isFinite(p.entry));
  history=history.filter(p=>p&&ASSETS[p.asset]&&Number.isFinite(p.pnl));
  if(s.profile?.name)localStorage.setItem("arvex_name",s.profile.name);
  if(s.profile?.username)localStorage.setItem("arvex_username",s.profile.username);
 }catch(e){}
}
function openWelcome(){
 const hasProfile=localStorage.getItem("arvex_name")&&localStorage.getItem("arvex_username");
 if(!hasProfile){$("welcomeModal").classList.remove("hidden");$("welcomeName").focus()}
}
function createProfile(){
 const name=$("welcomeName").value.trim(), username=$("welcomeUsername").value.trim().replace(/^@/,"");
 if(name.length<2){showToast("Имя должно содержать минимум 2 символа.");return}
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)){showToast("Username: 3–20 символов, латиница, цифры или _");return}
 localStorage.setItem("arvex_name",name);localStorage.setItem("arvex_username",username);
 setName(name);$("profileBtn").innerHTML=`<span class="avatar small">${name[0].toUpperCase()}</span><span>@${username}</span>⌄`;
 $("welcomeModal").classList.add("hidden");saveState();showToast("Профиль ARVEX создан на этом устройстве.");
}

function money(n){return n.toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2})}
function showToast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600)}
function marketPrice(asset=currentAsset){return prices[asset]||ASSETS[asset].fallback}
async function fetchPrices(){
 for(const key of Object.keys(ASSETS)){
  try{const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${key}`);if(!r.ok)throw Error();const d=await r.json();prices[key]=Number(d.price)}
  catch(e){if(!prices[key])prices[key]=ASSETS[key].fallback}
 }
 checkLiquidations();renderMarket();updateHeaderPrice();renderPositions();updateOrderPreview();
}
function updateHeaderPrice(){
 const a=ASSETS[currentAsset];$("assetName").innerHTML=`${a.name} <span>${a.pair}</span>`;$("selectedAsset").innerHTML=`${a.pair}<span>${a.name}</span>`;$("marketPrice").textContent=money(marketPrice());
 $("priceStatus").textContent=prices[currentAsset]?"Live price · Binance":"Demo reference price";$("priceStatus").className=prices[currentAsset]?"live-status live":"live-status";
 const icon=document.querySelector(".coin-icon");icon.textContent=a.icon;
}
function initChart(){
 if(!window.TradingView){$("tv_chart").innerHTML='<div class="table-empty">Для загрузки графика требуется интернет.</div>';return}
 new TradingView.widget({autosize:true,symbol:ASSETS[currentAsset].symbol,interval:"15",timezone:"Etc/UTC",theme:"dark",style:"1",locale:"ru",toolbar_bg:"#0c0c12",enable_publishing:false,hide_top_toolbar:false,hide_legend:false,save_image:false,container_id:"tv_chart",backgroundColor:"#0c0c12",gridColor:"#1b1b25"});
}
function updateChart(){ $("tv_chart").innerHTML="";initChart(); }
function renderMarket(){
 $("marketList").innerHTML=Object.keys(ASSETS).map(k=>`<div class="market-row"><span><b>${ASSETS[k].icon} ${ASSETS[k].name}</b><br><small class="muted">${ASSETS[k].pair}</small></span><b>${money(marketPrice(k))}</b><span class="muted">${prices[k]?"LIVE":"DEMO"}</span></div>`).join("");
}
function renderPositions(){
 $("openCount").textContent=positions.length;$("positionsBadge").textContent=positions.length;
 if(!positions.length){$("positionsList").className="empty-state";$("positionsList").textContent="Пока нет открытых позиций. Открой первую демо-сделку.";return}
 $("positionsList").className="";
 $("positionsList").innerHTML=positions.map(p=>{const v=posView(p);return `<div class="position-row"><span><b class="asset-symbol">${ASSETS[p.asset].pair}</b><br><small class="muted">${p.direction} ${v.lev}x · ${new Date(p.time).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small></span><span>${money(v.margin)}<br><small class="muted">Размер ${money(v.size)} · Вход ${money(p.entry)}</small></span><span class="${v.net>=0?"positive":"negative"}">${v.net>=0?"+":""}${money(v.net)}<br><small class="muted">Ликв. ${v.liq?money(v.liq):"—"} · Fund. ${v.funding>=0?"-":"+"}${money(Math.abs(v.funding))}</small></span><button class="close-position" data-close="${p.id}">Закрыть</button></div>`}).join("");
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closePosition(Number(b.dataset.close)));
}
function renderStats(){
 $("balance").textContent=money(balance);$("available").textContent=money(balance);$("totalPnl").textContent=(closedPnl>=0?"+":"")+money(closedPnl);$("totalPnl").className=closedPnl>=0?"positive":"negative";
 $("xpNum").textContent=xp;$("levelNum").textContent=level;$("sideLevel").textContent=level;$("xpBar").style.width=(xp%100)+"%";
}
/* ===== Фьючерсный симулятор (учебный): плечо, маржа, ликвидация, Funding ===== */
const MMR=0.005;                 // поддерживающая маржа 0,5% от размера позиции
const FUNDING_RATE=0.0001;       // 0,01% за 8 часов (учебное значение)
const FUNDING_MS=8*3600*1000;
function liqPrice(entry,lev,direction){
 const px=direction==="LONG"?entry*(1-1/lev+MMR):entry*(1+1/lev-MMR);
 return px>0?px:null;
}
// Расчёт позиции. Старые позиции без плеча считаются как 1x.
function posView(p,now=marketPrice(p.asset)){
 const lev=p.leverage||1, margin=p.margin??p.amount, size=p.size??p.amount, dir=p.direction==="LONG"?1:-1;
 const pnl=(now-p.entry)/p.entry*size*dir;
 const funding=size*FUNDING_RATE*((Date.now()-p.time)/FUNDING_MS)*dir; // >0: платим, <0: получаем
 const net=pnl-funding, equity=margin+net;
 return {lev,margin,size,pnl,funding,net,equity,liq:liqPrice(p.entry,lev,p.direction),isLiq:equity<=size*MMR};
}
function updateOrderPreview(){
 const margin=Number($("amount").value)||0, lev=Number($("leverage").value)||1, entry=marketPrice();
 $("posSize").textContent=money(margin*lev);
 const l=liqPrice(entry,lev,"LONG"), s=liqPrice(entry,lev,"SHORT");
 $("liqLong").textContent=l?money(l):"—";$("liqShort").textContent=s?money(s):"—";
}
function openTrade(direction){
 const margin=Number($("amount").value), lev=Number($("leverage").value)||1;
 if(!Number.isFinite(margin)||margin<=0){showToast("Укажи сумму больше нуля.");return}
 if(margin>balance){showToast("Недостаточно демо-средств для маржи.");return}
 const p={id:Date.now()+Math.floor(Math.random()*1000),asset:currentAsset,direction,amount:margin,margin,leverage:lev,size:margin*lev,entry:marketPrice(),time:Date.now()};
 balance-=margin;positions.unshift(p);saveState();renderStats();renderPositions();
 showToast(`${direction==="LONG"?"LONG":"SHORT"} ${lev}x открыт в демо-режиме. Ликвидация: ${liqPrice(p.entry,lev,direction)?money(liqPrice(p.entry,lev,direction)):"—"}`);
}
function closePosition(id,reason){
 const i=positions.findIndex(p=>p.id===id);if(i<0)return;
 const p=positions.splice(i,1)[0], now=marketPrice(p.asset), v=posView(p,now);
 const liquidated=reason==="liq";
 const net=Math.max(liquidated?-v.margin:v.net,-v.margin); // убыток не больше маржи
 balance+=v.margin+net;closedPnl+=net;
 const up=liquidated?false:addXp(10);
 history.unshift({...p,exit:now,pnl:net,funding:v.funding,liquidated,closed:Date.now()});
 saveState();renderStats();renderPositions();renderHistory();
 if(!$("portfolioScreen").classList.contains("hidden"))renderPortfolio();
 showToast(liquidated?`Ликвидация ${ASSETS[p.asset].pair}: потеряна маржа ${money(v.margin)}`:up?`Новый уровень ARVEX: ${level}!`:`Сделка закрыта. Результат: ${net>=0?"+":""}${money(net)}`);
}
function checkLiquidations(){
 positions.filter(p=>posView(p).isLiq).map(p=>p.id).forEach(id=>closePosition(id,"liq"));
}
function renderHistory(){
 if(!history.length){$("historyContent").innerHTML='<div class="table-empty">Закрытых сделок пока нет.</div>';return}
 $("historyContent").innerHTML=history.map(p=>`<div class="history-row"><span><b>${ASSETS[p.asset].pair}</b><br><small class="muted">${p.direction} ${p.leverage||1}x${p.liquidated?" · ЛИКВИДАЦИЯ":""}</small></span><span>${money(p.margin??p.amount)}</span><span class="${p.pnl>=0?"positive":"negative"}">${p.pnl>=0?"+":""}${money(p.pnl)}</span><span class="muted">${new Date(p.closed).toLocaleString("ru-RU")}</span></div>`).join("");
}
function renderPortfolio(){
 $("portfolioContent").innerHTML=`<div class="stats-grid" style="margin-top:20px"><article class="stat-card"><span class="stat-label">ДЕМО-БАЛАНС</span><strong>${money(balance)}</strong></article><article class="stat-card"><span class="stat-label">ОТКРЫТЫЕ ПОЗИЦИИ</span><strong>${positions.length}</strong></article><article class="stat-card"><span class="stat-label">ЗАКРЫТЫЙ P/L</span><strong class="${closedPnl>=0?"positive":"negative"}">${money(closedPnl)}</strong></article></div>${positions.length?positions.map(p=>`<div class="position-row"><span>${ASSETS[p.asset].pair} · ${p.direction} ${p.leverage||1}x</span><span>${money(p.margin??p.amount)}</span><span>Вход: ${money(p.entry)}</span><button class="close-position" data-close="${p.id}">Закрыть</button></div>`).join(""):'<div class="table-empty">Открытых позиций нет.</div>'}`;
 document.querySelectorAll("#portfolioContent [data-close]").forEach(b=>b.onclick=()=>closePosition(Number(b.dataset.close)));
}
function showScreen(screen){
 const names={trade:"Торговая панель",portfolio:"Портфель",history:"История сделок",academy:"Академия ARVEX"};$("pageTitle").textContent=names[screen]||names.trade;
 ["trade","portfolio","history","academy"].forEach(s=>{const el=$(s+"Screen")||$(s+"Bottom");if(el)el.classList.toggle("hidden",s!==screen)});
 $("tradeBottom").classList.toggle("hidden",screen!=="trade");
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.screen===screen));
 if(screen==="portfolio")renderPortfolio();if(screen==="history")renderHistory();if(screen==="academy")renderAcademy();
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
$("assetSelect").addEventListener("change",e=>{currentAsset=e.target.value;saveState();updateHeaderPrice();updateOrderPreview();updateChart()});
$("buyBtn").onclick=()=>openTrade("LONG");$("sellBtn").onclick=()=>openTrade("SHORT");
document.querySelectorAll("[data-amount]").forEach(b=>b.onclick=()=>{$("amount").value=b.dataset.amount;updateOrderPreview()});
$("maxBtn").onclick=()=>{$("amount").value=Math.floor(balance);updateOrderPreview()};
$("amount").addEventListener("input",updateOrderPreview);$("leverage").addEventListener("change",updateOrderPreview);
$("profileBtn").onclick=()=>{const name=prompt("Имя профиля",localStorage.getItem("arvex_name")||"");if(name&&name.trim()){localStorage.setItem("arvex_name",name.trim());setName(name.trim());saveState()}};
function setName(name){$("userName").textContent=name.toUpperCase();$("sideName").textContent=name.toUpperCase();document.querySelectorAll(".avatar").forEach(a=>a.textContent=name.trim()[0].toUpperCase());}
const savedName=localStorage.getItem("arvex_name");if(savedName)setName(savedName);
const savedUsername=localStorage.getItem("arvex_username");if(savedUsername)$("profileBtn").innerHTML=`<span class="avatar small">${(savedName||"A")[0].toUpperCase()}</span><span>@${savedUsername}</span>⌄`;
$("createProfile").onclick=createProfile;
/* ===== Академия: уроки и тесты, XP один раз за урок и один раз за тест ===== */
let academyView={screen:"list",lessonId:null,result:null};
function lessonById(id){return LESSONS.find(l=>l.id===id)}
function renderAcademy(){
 const box=$("academyContent");if(!box)return;
 const doneL=LESSONS.filter(l=>progress.lessons[l.id]).length, doneQ=LESSONS.filter(l=>progress.quizzes[l.id]).length;
 const v=academyView, lesson=v.lessonId?lessonById(v.lessonId):null;
 if(v.screen==="list"||!lesson){
  box.innerHTML=`<div class="academy-progress">Уроков пройдено: <b>${doneL}/${LESSONS.length}</b> · Тестов сдано: <b>${doneQ}/${LESSONS.length}</b></div><div class="lesson-grid">${LESSONS.map(l=>`<article class="lesson"><span>${l.tag}</span><h3>${l.title}</h3><p>${l.summary}</p><div class="lesson-status"><i class="${progress.lessons[l.id]?"ok":""}">${progress.lessons[l.id]?"✓ Урок":"Урок · +"+LESSON_XP+" XP"}</i><i class="${progress.quizzes[l.id]?"ok":""}">${progress.quizzes[l.id]?"✓ Тест":"Тест · +"+QUIZ_XP+" XP"}</i></div><button class="lesson-btn" data-act="open" data-lesson="${l.id}">${progress.lessons[l.id]?"Открыть снова":"Изучить урок"}</button></article>`).join("")}</div>`;
  return;
 }
 if(v.screen==="lesson"){
  const done=!!progress.lessons[lesson.id];
  box.innerHTML=`<button class="back-btn" data-act="list">← Все уроки</button><article class="lesson-view"><span class="lesson-tag">${lesson.tag}</span><h3>${lesson.title}</h3>${lesson.body.map(t=>`<p>${t}</p>`).join("")}<div class="key-points"><b>Главное</b><ul>${lesson.points.map(t=>`<li>${t}</li>`).join("")}</ul></div><div class="lesson-actions">${done?`<button class="lesson-btn" data-act="quiz" data-lesson="${lesson.id}">Перейти к тесту</button><small class="muted">Урок уже засчитан · XP за него начисляется один раз</small>`:`<button class="lesson-btn" data-act="finish" data-lesson="${lesson.id}">Завершить урок · +${LESSON_XP} XP</button>`}</div></article>`;
  return;
 }
 if(v.screen==="quiz"){
  const r=v.result, done=!!progress.quizzes[lesson.id];
  box.innerHTML=`<button class="back-btn" data-act="lesson" data-lesson="${lesson.id}">← К уроку</button><article class="lesson-view"><span class="lesson-tag">ТЕСТ · ${lesson.title}</span><h3>Проверь себя</h3><p class="muted">Нужно ${QUIZ_PASS_SCORE} правильных ответа из ${lesson.quiz.length}. ${done?"Тест уже сдан, XP за него начисляется один раз.":"За успешную сдачу: +"+QUIZ_XP+" XP."}</p>${lesson.quiz.map((q,qi)=>{
   const given=r?r.answers[qi]:null;
   return `<fieldset class="quiz-q"><legend>${qi+1}. ${q.q}</legend>${q.options.map((o,oi)=>{
    let cls="";if(r){if(oi===q.answer)cls="right";else if(oi===given)cls="wrong"}
    return `<label class="quiz-opt ${cls}"><input type="radio" name="q${qi}" value="${oi}" ${given===oi?"checked":""} ${r?"disabled":""}> <span>${o}</span></label>`}).join("")}${r?`<small class="muted">${q.explain}</small>`:""}</fieldset>`}).join("")}${r?`<div class="quiz-result ${r.passed?"pass":"fail"}">Результат: ${r.score} из ${lesson.quiz.length}. ${r.passed?"Тест сдан!":"Пока не зачтено — перечитай урок и попробуй ещё раз."}${r.xpText?" "+r.xpText:""}</div><div class="lesson-actions"><button class="lesson-btn" data-act="retry" data-lesson="${lesson.id}">Пройти заново</button><button class="back-btn" data-act="list">К списку уроков</button></div>`:`<div class="lesson-actions"><button class="lesson-btn" data-act="check" data-lesson="${lesson.id}">Проверить ответы</button></div>`}</article>`;
 }
}
function academyAction(act,id){
 const lesson=lessonById(id);
 if(act==="list"){academyView={screen:"list",lessonId:null,result:null}}
 else if(act==="open"||act==="lesson"){academyView={screen:"lesson",lessonId:id,result:null}}
 else if(act==="finish"&&lesson){
  const r=awardOnce("lessons",id,LESSON_XP);renderStats();
  showToast(r.awarded?(r.levelUp?`Урок пройден! +${LESSON_XP} XP · Новый уровень ${level}!`:`Урок пройден! +${LESSON_XP} XP`):"Этот урок уже засчитан.");
  academyView={screen:"quiz",lessonId:id,result:null};
 }
 else if(act==="quiz"||act==="retry"){academyView={screen:"quiz",lessonId:id,result:null}}
 else if(act==="check"&&lesson){
  const answers=lesson.quiz.map((_,qi)=>{const c=document.querySelector(`input[name="q${qi}"]:checked`);return c?Number(c.value):null});
  if(answers.some(a=>a===null)){showToast("Ответь на все вопросы теста.");return}
  const score=answers.filter((a,qi)=>a===lesson.quiz[qi].answer).length, passed=score>=QUIZ_PASS_SCORE;
  let xpText="";
  if(passed){
   const r=awardOnce("quizzes",id,QUIZ_XP);renderStats();
   xpText=r.awarded?`+${QUIZ_XP} XP получено${r.levelUp?` · Новый уровень ${level}!`:""}.`:"XP за этот тест уже был получен.";
   showToast(r.awarded?`Тест сдан! +${QUIZ_XP} XP`:"Тест сдан. XP уже был начислен ранее.");
  }
  academyView={screen:"quiz",lessonId:id,result:{answers,score,passed,xpText}};
 }
 renderAcademy();
 const sc=$("academyScreen");if(sc&&sc.scrollIntoView)sc.scrollIntoView({block:"start"});
}
if($("academyContent"))$("academyContent").addEventListener("click",e=>{
 const b=e.target.closest("[data-act]");if(!b)return;
 academyAction(b.dataset.act,Number(b.dataset.lesson)||null);
});
// Страховка: сохраняем состояние при сворачивании/закрытии вкладки.
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveState()});
window.addEventListener("pagehide",saveState);
loadState();
$("assetSelect").value=currentAsset;
renderStats();updateHeaderPrice();renderMarket();renderPositions();updateOrderPreview();initChart();fetchPrices();setInterval(fetchPrices,15000);openWelcome();
