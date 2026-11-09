const $=id=>document.getElementById(id);
const ASSETS={
 BTCUSDT:{name:"Bitcoin",pair:"BTC / USDT",symbol:"BINANCE:BTCUSDT",icon:"₿",fallback:67000},
 ETHUSDT:{name:"Ethereum",pair:"ETH / USDT",symbol:"BINANCE:ETHUSDT",icon:"Ξ",fallback:3500},
 SOLUSDT:{name:"Solana",pair:"SOL / USDT",symbol:"BINANCE:SOLUSDT",icon:"◎",fallback:160},
 BNBUSDT:{name:"BNB",pair:"BNB / USDT",symbol:"BINANCE:BNBUSDT",icon:"◆",fallback:600}
};
let balance=10000, closedPnl=0, xp=0, level=1, positions=[], history=[], prices={}, currentAsset="BTCUSDT", toastTimer;

const STORAGE_KEY="arvex_v3_state";
function saveState(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify({balance,closedPnl,xp,level,positions,history,currentAsset,profile:{name:localStorage.getItem("arvex_name")||"",username:localStorage.getItem("arvex_username")||""}}))}catch(e){}
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
 renderMarket();updateHeaderPrice();renderPositions();
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
 $("positionsList").innerHTML=positions.map(p=>{const now=marketPrice(p.asset),raw=(now-p.entry)/p.entry*p.amount*(p.direction==="LONG"?1:-1);return `<div class="position-row"><span><b class="asset-symbol">${ASSETS[p.asset].pair}</b><br><small class="muted">${p.direction} · ${new Date(p.time).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small></span><span>${money(p.amount)}<br><small class="muted">Вход ${money(p.entry)}</small></span><span class="${raw>=0?"positive":"negative"}">${raw>=0?"+":""}${money(raw)}</span><button class="close-position" data-close="${p.id}">Закрыть</button></div>`}).join("");
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closePosition(Number(b.dataset.close)));
}
function renderStats(){
 $("balance").textContent=money(balance);$("available").textContent=money(balance);$("totalPnl").textContent=(closedPnl>=0?"+":"")+money(closedPnl);$("totalPnl").className=closedPnl>=0?"positive":"negative";
 $("xpNum").textContent=xp;$("levelNum").textContent=level;$("sideLevel").textContent=level;$("xpBar").style.width=(xp%100)+"%";
}
function openTrade(direction){
 const amount=Number($("amount").value);
 if(!Number.isFinite(amount)||amount<=0){showToast("Укажи сумму больше нуля.");return}
 if(amount>balance){showToast("Недостаточно демо-средств.");return}
 const p={id:Date.now()+Math.floor(Math.random()*1000),asset:currentAsset,direction,amount,entry:marketPrice(),time:Date.now()};
 balance-=amount;positions.unshift(p);renderStats();renderPositions();showToast(`${direction==="LONG"?"Покупка":"Продажа"} открыта в демо-режиме.`);
}
function closePosition(id){
 const i=positions.findIndex(p=>p.id===id);if(i<0)return;const p=positions.splice(i,1)[0],now=marketPrice(p.asset);
 const pnl=(now-p.entry)/p.entry*p.amount*(p.direction==="LONG"?1:-1);
 balance+=p.amount+pnl;closedPnl+=pnl;xp+=10;if(xp>=100){level+=Math.floor(xp/100);xp%=100;showToast(`Новый уровень ARVEX: ${level}!`)}
 history.unshift({...p,exit:now,pnl,closed:Date.now()});renderStats();renderPositions();renderHistory();showToast(`Сделка закрыта. Результат: ${pnl>=0?"+":""}${money(pnl)}`);
}
function renderHistory(){
 if(!history.length){$("historyContent").innerHTML='<div class="table-empty">Закрытых сделок пока нет.</div>';return}
 $("historyContent").innerHTML=history.map(p=>`<div class="history-row"><span><b>${ASSETS[p.asset].pair}</b><br><small class="muted">${p.direction}</small></span><span>${money(p.amount)}</span><span class="${p.pnl>=0?"positive":"negative"}">${p.pnl>=0?"+":""}${money(p.pnl)}</span><span class="muted">${new Date(p.closed).toLocaleString("ru-RU")}</span></div>`).join("");
}
function renderPortfolio(){
 $("portfolioContent").innerHTML=`<div class="stats-grid" style="margin-top:20px"><article class="stat-card"><span class="stat-label">ДЕМО-БАЛАНС</span><strong>${money(balance)}</strong></article><article class="stat-card"><span class="stat-label">ОТКРЫТЫЕ ПОЗИЦИИ</span><strong>${positions.length}</strong></article><article class="stat-card"><span class="stat-label">ЗАКРЫТЫЙ P/L</span><strong class="${closedPnl>=0?"positive":"negative"}">${money(closedPnl)}</strong></article></div>${positions.length?positions.map(p=>`<div class="position-row"><span>${ASSETS[p.asset].pair} · ${p.direction}</span><span>${money(p.amount)}</span><span>Вход: ${money(p.entry)}</span><button class="close-position" data-close="${p.id}">Закрыть</button></div>`).join(""):'<div class="table-empty">Открытых позиций нет.</div>'}`;
 document.querySelectorAll("#portfolioContent [data-close]").forEach(b=>b.onclick=()=>closePosition(Number(b.dataset.close)));
}
function showScreen(screen){
 const names={trade:"Торговая панель",portfolio:"Портфель",history:"История сделок",academy:"Академия ARVEX"};$("pageTitle").textContent=names[screen]||names.trade;
 ["trade","portfolio","history","academy"].forEach(s=>{const el=$(s+"Screen")||$(s+"Bottom");if(el)el.classList.toggle("hidden",s!==screen)});
 $("tradeBottom").classList.toggle("hidden",screen!=="trade");
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.screen===screen));
 if(screen==="portfolio")renderPortfolio();if(screen==="history")renderHistory();
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
$("assetSelect").addEventListener("change",e=>{currentAsset=e.target.value;saveState();updateHeaderPrice();updateChart()});
$("buyBtn").onclick=()=>openTrade("LONG");$("sellBtn").onclick=()=>openTrade("SHORT");
document.querySelectorAll("[data-amount]").forEach(b=>b.onclick=()=>{$("amount").value=b.dataset.amount});
$("maxBtn").onclick=()=>{$("amount").value=Math.floor(balance)};
$("profileBtn").onclick=()=>{const name=prompt("Имя профиля",localStorage.getItem("arvex_name")||"");if(name&&name.trim()){localStorage.setItem("arvex_name",name.trim());setName(name.trim());saveState()}};
function setName(name){$("userName").textContent=name.toUpperCase();$("sideName").textContent=name.toUpperCase();document.querySelectorAll(".avatar").forEach(a=>a.textContent=name.trim()[0].toUpperCase());}
const savedName=localStorage.getItem("arvex_name");if(savedName)setName(savedName);
const savedUsername=localStorage.getItem("arvex_username");if(savedUsername)$("profileBtn").innerHTML=`<span class="avatar small">${(savedName||"A")[0].toUpperCase()}</span><span>@${savedUsername}</span>⌄`;
$("createProfile").onclick=createProfile;
document.querySelectorAll(".lesson-btn").forEach(b=>b.onclick=()=>{xp+=20;if(xp>=100){level+=Math.floor(xp/100);xp%=100}renderStats();showToast("Урок отмечен! +20 XP. Продолжай обучение.")});
loadState();
$("assetSelect").value=currentAsset;
renderStats();updateHeaderPrice();renderMarket();initChart();fetchPrices();setInterval(fetchPrices,15000);openWelcome();
