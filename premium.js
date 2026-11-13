/* ARVEX PRO — расширенная аналитика, риск-лаборатория, watchlist и журнал.
   Расчёты выполняются локально на реальных свечах, если они доступны. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const key = () => {
    const owner = localStorage.getItem("arvex_local_state_owner") || "guest";
    return "arvex_pro_" + owner;
  };
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(key()) || "{}");
      return {
        watchlist: Array.isArray(value.watchlist) ? value.watchlist.filter(x => ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"].includes(x)) : ["BTCUSDT","ETHUSDT"],
        journal: Array.isArray(value.journal) ? value.journal.slice(0,100) : []
      };
    } catch (_) { return { watchlist:["BTCUSDT","ETHUSDT"], journal:[] }; }
  };
  const write = (value) => localStorage.setItem(key(), JSON.stringify(value));
  const isEnglish = () => localStorage.getItem("arvex_language") === "en";
  const tr = (ru, en) => isEnglish() ? en : ru;
  const translateMarkup = (html) => {
    if (!isEnglish()) return html;
    const words = {
      "Больше контроля над каждой сделкой":"More control over every trade",
      "Профессиональные инструменты для обучения и анализа. Все сделки остаются виртуальными.":"Professional tools for learning and analysis. All trades remain virtual.",
      "Расширенная аналитика":"Advanced analytics",
      "RSI, MACD, EMA, полосы Боллинджера и ATR на рыночных свечах.":"RSI, MACD, EMA, Bollinger Bands and ATR from market candles.",
      "Риск-лаборатория":"Risk lab",
      "Размер позиции, денежный риск, потенциальная прибыль и соотношение риск/прибыль.":"Position size, cash risk, potential profit and risk/reward ratio.",
      "Торговый дневник":"Trading journal",
      "Личные заметки, торговый план и разбор дисциплины.":"Personal notes, trading plan and discipline review.",
      "Избранные рынки":"Watchlist",
      "Список наблюдения за активами и быстрые рыночные показатели.":"Track selected assets and view quick market prices.",
      "Технический обзор":"Technical overview",
      "Сводка тренда и импульса на основе рассчитанных индикаторов.":"Trend and momentum summary based on calculated indicators.",
      "Покупка доступна в профиле. Доступ проверяется по серверной подписке.":"Purchase is available in Profile. Access is verified against the server subscription.",
      "Загружаем достаточно свечей для расчёта. Проверь подключение к рынку и открой этот раздел чуть позже.":"Loading enough candles for calculations. Check your market connection and try again shortly.",
      "Восходящий":"Uptrend","Нисходящий":"Downtrend","Боковой / смешанный":"Sideways / mixed",
      "Перекупленность":"Overbought","Перепроданность":"Oversold","Положительный импульс":"Positive momentum","Отрицательный импульс":"Negative momentum","Нейтральный импульс":"Neutral momentum",
      "RSI находится в высокой зоне: не следует трактовать это как автоматический сигнал на продажу.":"RSI is elevated; this should not be treated as an automatic sell signal.",
      "RSI находится в низкой зоне: это не гарантирует разворот.":"RSI is low; this does not guarantee a reversal.",
      "RSI не показывает экстремальную зону.":"RSI is not in an extreme zone.",
      "Тренд:":"Trend:","Расчёт по":"Calculated from","последним свечам":"latest candles","Индикаторы — вспомогательные данные, не торговый сигнал и не гарантия результата.":"Indicators are supporting data, not a trade signal or a guarantee of results.",
      "Баланс, $":"Balance, $","Риск, %":"Risk, %","Цена входа":"Entry price","Цена стопа":"Stop price","Цель":"Target","Плечо":"Leverage",
      "Укажи цену стопа для расчёта.":"Enter a stop price to calculate.",
      "Проверь баланс, риск (0,1–10%), цену входа и стоп.":"Check balance, risk (0.1–10%), entry price and stop.",
      "Риск в деньгах":"Cash risk","Размер позиции":"Position size","Потенциальная прибыль":"Potential profit","Риск / прибыль":"Risk / reward",
      "${tr("Внимание: расчётная маржа превышает баланс.","Warning: required margin exceeds your balance.")}":"Warning: required margin exceeds your balance.",
      "Модель не учитывает проскальзывание, funding и комиссии. Используй запас по риску.":"This model excludes slippage, funding and fees. Keep a risk buffer.",
      "Список пока пуст.":"Your watchlist is empty.",
      "Заголовок":"Title","План / выводы":"Plan / takeaways","Сохранить запись":"Save entry","Записей пока нет.":"No journal entries yet.","Удалить":"Delete",
      "Профессиональная статистика":"Pro statistics","Закрытых сделок":"Closed trades","Средний результат":"Average result","Валовая прибыль":"Gross profit","Валовый убыток":"Gross loss",
      "Статистика рассчитывается по истории демо-сделок на этом устройстве. Результаты симулятора не прогнозируют реальную доходность.":"Statistics use the demo trade history on this device. Simulator results do not predict real returns.",
      "Добавь заголовок и не менее 8 символов заметки.":"Add a title and a note of at least 8 characters.",
      "Запись сохранена.":"Entry saved."
    };
    for (const [ru, en] of Object.entries(words)) html = html.replaceAll(ru, en);
    return html;
  };
  const fmt = (value, digits=2) => Number.isFinite(value) ? value.toLocaleString("ru-RU",{maximumFractionDigits:digits,minimumFractionDigits:digits}) : "—";
  const money = (value) => (value < 0 ? "−" : "") + "$" + fmt(Math.abs(value));
  const PREMIUM_KEYS = ["pro_analytics","pro_risk_lab","pro_journal","pro_watchlist","pro_market_review"];
  const premium = () => typeof Access !== "undefined" && Access.isPremium() && PREMIUM_KEYS.every(feature => !Access.locked(feature));
  const goProfile = () => { if (typeof go === "function") go("profile"); };
  const gated = () => {
    const labels = [
      ["📊","Расширенная аналитика","RSI, MACD, EMA, полосы Боллинджера и ATR на рыночных свечах."],
      ["🧮","Риск-лаборатория","Размер позиции, денежный риск, потенциальная прибыль и соотношение риск/прибыль."],
      ["📓","Торговый дневник","Личные заметки, торговый план и разбор дисциплины."],
      ["⭐","Избранные рынки","Список наблюдения за активами и быстрые рыночные показатели."],
      ["🧭","Технический обзор","Сводка тренда и импульса на основе рассчитанных индикаторов."]
    ];
    return `<div class="card pro-hero"><span class="pro-kicker">ARVEX PREMIUM</span><h2>Больше контроля над каждой сделкой</h2><p class="muted">Профессиональные инструменты для обучения и анализа. Все сделки остаются виртуальными.</p><div class="pro-grid">${labels.map(([icon,title,desc])=>`<article class="pro-teaser"><b>${icon} ${title}</b><p>${desc}</p></article>`).join("")}</div><button class="primary" id="proUpgrade">Открыть Premium · 120 ⭐ / 30 дней</button><p class="note">Покупка доступна в профиле. Доступ проверяется по серверной подписке.</p></div>`;
  };
  const ema = (values, period) => {
    if (values.length < period) return null;
    const alpha = 2/(period+1);
    let out = values.slice(0,period).reduce((a,b)=>a+b,0)/period;
    for (const value of values.slice(period)) out = value*alpha + out*(1-alpha);
    return out;
  };
  const rsi = (values, period=14) => {
    if (values.length <= period) return null;
    let gains=0,losses=0;
    for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];if(d>0)gains+=d;else losses-=d;}
    if(losses===0)return 100;
    const rs=(gains/period)/(losses/period);
    return 100-100/(1+rs);
  };
  const indicators = () => {
    const rows = Array.isArray(candles) ? candles.filter(c=>Number.isFinite(c.c)&&Number.isFinite(c.h)&&Number.isFinite(c.l)) : [];
    const closes=rows.map(c=>c.c);
    if(closes.length<30)return null;
    const last=closes[closes.length-1],e20=ema(closes,20),e50=ema(closes,50),fast=ema(closes.slice(-60),12),slow=ema(closes.slice(-60),26);
    const mean=closes.slice(-20).reduce((a,b)=>a+b,0)/20;
    const sd=Math.sqrt(closes.slice(-20).reduce((a,b)=>a+(b-mean)**2,0)/20);
    let tr=0;
    for(let i=Math.max(1,rows.length-14);i<rows.length;i++){const c=rows[i],p=rows[i-1].c;tr+=Math.max(c.h-c.l,Math.abs(c.h-p),Math.abs(c.l-p));}
    return {last,e20,e50,rsi:rsi(closes),macd:fast!==null&&slow!==null?fast-slow:null,upper:mean+2*sd,lower:mean-2*sd,atr:tr/Math.min(14,rows.length-1),rows:rows.length};
  };
  const marketRead = (v) => {
    const trend=v.last>v.e20&&v.e20>v.e50?"Восходящий":v.last<v.e20&&v.e20<v.e50?"Нисходящий":"Боковой / смешанный";
    const momentum=v.rsi>=70?"Перекупленность":v.rsi<=30?"Перепроданность":v.rsi>=55?"Положительный импульс":v.rsi<=45?"Отрицательный импульс":"Нейтральный импульс";
    const caution=v.rsi>=70?"RSI находится в высокой зоне: не следует трактовать это как автоматический сигнал на продажу.":v.rsi<=30?"RSI находится в низкой зоне: это не гарантирует разворот.":"RSI не показывает экстремальную зону.";
    return {trend,momentum,caution};
  };
  const indicatorsHTML = () => {
    const v=indicators();
    if(!v)return `<div class="card"><div class="card-title">Технический обзор</div><p class="muted">Загружаем достаточно свечей для расчёта. Проверь подключение к рынку и открой этот раздел чуть позже.</p></div>`;
    const readout=marketRead(v);
    return `<div class="card"><div class="card-title">Технический обзор <span class="badge">${ASSETS[currentAsset].sym}</span></div><div class="pro-grid pro-metrics">
      <div class="stat"><small>RSI · 14</small><b>${fmt(v.rsi,1)}</b></div><div class="stat"><small>EMA · 20</small><b>${money(v.e20)}</b></div>
      <div class="stat"><small>EMA · 50</small><b>${money(v.e50)}</b></div><div class="stat"><small>MACD</small><b>${fmt(v.macd,4)}</b></div>
      <div class="stat"><small>ATR · 14</small><b>${money(v.atr)}</b></div><div class="stat"><small>Bollinger · верх</small><b>${money(v.upper)}</b></div>
      </div><div class="pro-insight"><b>Тренд: ${readout.trend}</b><p>${readout.momentum}. ${readout.caution}</p><small>Расчёт по ${v.rows} последним свечам · таймфрейм ${tf}</small></div><p class="note">Индикаторы — вспомогательные данные, не торговый сигнал и не гарантия результата.</p></div>`;
  };
  const riskHTML = () => `<div class="card"><div class="card-title">Риск-лаборатория <span class="badge">PRO</span></div>
    <div class="row2"><div><label class="lbl" for="proBalance">Баланс, $</label><input class="field" id="proBalance" type="number" min="0" step="0.01" value="${fmt(balance,2)}"></div><div><label class="lbl" for="proRisk">Риск, %</label><input class="field" id="proRisk" type="number" min="0.1" max="10" step="0.1" value="1"></div></div>
    <div class="row2"><div><label class="lbl" for="proEntry">Цена входа</label><input class="field" id="proEntry" type="number" min="0" step="any" value="${fmt(marketPrice(),4)}"></div><div><label class="lbl" for="proStop">Цена стопа</label><input class="field" id="proStop" type="number" min="0" step="any" placeholder="Укажи стоп"></div></div>
    <div class="row2"><div><label class="lbl" for="proTarget">Цель</label><input class="field" id="proTarget" type="number" min="0" step="any" placeholder="Необязательно"></div><div><label class="lbl" for="proLev">Плечо</label><select class="field" id="proLev"><option>1</option><option>2</option><option>3</option><option>5</option><option>10</option><option>20</option></select></div></div>
    <div id="proRiskResult" class="calc-out pro-output">Укажи цену стопа для расчёта.</div><p class="note">Модель не учитывает проскальзывание, funding и комиссии. Используй запас по риску.</p></div>`;
  const watchHTML = (data) => `<div class="card"><div class="card-title">Избранные рынки</div><div class="chips pro-watch-add">${Object.keys(ASSETS).map(a=>`<button data-watch-add="${a}">+${ASSETS[a].sym}</button>`).join("")}</div><div class="pro-watch-list">${data.watchlist.map(a=>`<div class="pro-watch-row"><div><b>${ASSETS[a].sym}/USDT</b><small>${ASSETS[a].name}</small></div><strong>${money(marketPrice(a))}</strong><button class="ghost" data-watch-remove="${a}" aria-label="Убрать ${ASSETS[a].sym}">×</button></div>`).join("")||"<p class='muted'>Список пока пуст.</p>"}</div></div>`;
  const journalHTML = (data) => `<div class="card"><div class="card-title">Торговый дневник</div><label class="lbl" for="proJournalTitle">Заголовок</label><input class="field" id="proJournalTitle" maxlength="70" placeholder="Например: BTC — ждал подтверждения тренда"><label class="lbl" for="proJournalBody">План / выводы</label><textarea class="field" id="proJournalBody" maxlength="1200" placeholder="Почему выбрал сценарий? Где стоп? Что получилось и чему научился?"></textarea><button class="primary" id="proJournalSave">Сохранить запись</button><div class="pro-journal-list">${data.journal.map((entry,i)=>`<article class="pro-journal-entry"><div><b>${escapeHTML(entry.title)}</b><small>${new Date(entry.createdAt).toLocaleString("ru-RU")}</small></div><p>${escapeHTML(entry.body).replace(/\n/g,"<br>")}</p><button class="ghost" data-journal-delete="${i}">Удалить</button></article>`).join("")||"<p class='muted'>Записей пока нет.</p>"}</div></div>`;
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const statsHTML = () => {
    const rows=Array.isArray(history)?history:[];
    const wins=rows.filter(x=>x.pnl>0),losses=rows.filter(x=>x.pnl<0),sum=rows.reduce((a,x)=>a+(Number(x.pnl)||0),0);
    const grossWin=wins.reduce((a,x)=>a+x.pnl,0),grossLoss=Math.abs(losses.reduce((a,x)=>a+x.pnl,0));
    const pf=grossLoss?grossWin/grossLoss:null;
    const avg=rows.length?sum/rows.length:0;
    return `<div class="card"><div class="card-title">Профессиональная статистика</div><div class="pro-grid pro-metrics">
      <div class="stat"><small>Закрытых сделок</small><b>${rows.length}</b></div><div class="stat"><small>Win rate</small><b>${rows.length?fmt(wins.length/rows.length*100,1)+"%":"—"}</b></div>
      <div class="stat"><small>Profit factor</small><b>${pf===null?"—":fmt(pf,2)}</b></div><div class="stat"><small>Средний результат</small><b>${rows.length?money(avg):"—"}</b></div>
      <div class="stat"><small>Валовая прибыль</small><b class="pos">${money(grossWin)}</b></div><div class="stat"><small>Валовый убыток</small><b class="neg">${money(-grossLoss)}</b></div>
      </div><p class="note">Статистика рассчитывается по истории демо-сделок на этом устройстве. Результаты симулятора не прогнозируют реальную доходность.</p></div>`;
  };
  const render = () => {
    const root=$("premiumBody");if(!root)return;
    if(!premium()){root.innerHTML=gated();return;}
    const data=read();
    root.innerHTML=translateMarkup(indicatorsHTML()+statsHTML()+riskHTML()+watchHTML(data)+journalHTML(data));
    bindRisk();
  };
  const bindRisk = () => {
    const ids=["proBalance","proRisk","proEntry","proStop","proTarget","proLev"];
    const update=()=>{
      const out=$("proRiskResult");if(!out)return;
      const bal=Number($("proBalance").value),risk=Number($("proRisk").value),entry=Number($("proEntry").value),stop=Number($("proStop").value),target=Number($("proTarget").value),lev=Number($("proLev").value);
      if(!(bal>0&&risk>0&&risk<=10&&entry>0&&stop>0&&entry!==stop)){out.textContent=tr("Проверь баланс, риск (0,1–10%), цену входа и стоп.","Check balance, risk (0.1–10%), entry price and stop.");return;}
      const riskCash=bal*risk/100,dist=Math.abs(entry-stop)/entry,notional=riskCash/dist,margin=notional/Math.max(1,lev),reward=target>0?Math.abs(target-entry)/entry*notional:null,rr=target>0?Math.abs(target-entry)/Math.abs(entry-stop):null;
      out.innerHTML=`<div class="pro-result-grid"><div><small>${tr("Риск в деньгах","Cash risk")}</small><b class="neg">${money(-riskCash)}</b></div><div><small>${tr("Размер позиции","Position size")}</small><b>${money(notional)}</b></div><div><small>Маржа при ${lev}x</small><b>${money(margin)}</b></div><div><small>${tr("Потенциальная прибыль","Potential profit")}</small><b class="pos">${reward===null?"—":money(reward)}</b></div><div><small>${tr("Риск / прибыль","Risk / reward")}</small><b>${rr===null?"—":"1 : "+fmt(rr,2)}</b></div></div>${margin>bal?'<p class="neg">Внимание: расчётная маржа превышает баланс.</p>':""}`;
    };
    ids.forEach(id=>$(id)?.addEventListener("input",update));update();
  };
  document.addEventListener("click", async (event) => {
    const nav=event.target.closest('[data-go="premium"]');
    if(nav){setTimeout(()=>{if(typeof Access!=="undefined")Access.refresh().finally(render);else render();},0);return;}
    if(event.target.closest("#proUpgrade")){goProfile();return;}
    if(event.target.closest("#proJournalSave")){
      const title=$("proJournalTitle").value.trim(),body=$("proJournalBody").value.trim();
      if(!title||body.length<8){if(typeof showToast==="function")showToast(tr("Добавь заголовок и не менее 8 символов заметки.","Add a title and a note of at least 8 characters."));return;}
      const data=read();data.journal.unshift({title:title.slice(0,70),body:body.slice(0,1200),createdAt:Date.now()});data.journal=data.journal.slice(0,100);write(data);render();if(typeof showToast==="function")showToast(tr("Запись сохранена.","Entry saved."));return;
    }
    const add=event.target.closest("[data-watch-add]");
    if(add){const data=read(),asset=add.dataset.watchAdd;if(!data.watchlist.includes(asset))data.watchlist.push(asset);write(data);render();return;}
    const remove=event.target.closest("[data-watch-remove]");
    if(remove){const data=read();data.watchlist=data.watchlist.filter(x=>x!==remove.dataset.watchRemove);write(data);render();return;}
    const del=event.target.closest("[data-journal-delete]");
    if(del){const data=read();data.journal.splice(Number(del.dataset.journalDelete),1);write(data);render();return;}
  });
  window.addEventListener("arvex:premium-refresh",render);
  window.ARVEX_PRO={render,indicators};
})();