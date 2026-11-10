/* ARVEX — Инструменты: калькуляторы и офлайн-помощник. Зависит от app.js, lessons.js, glossary.js */
let toolsTab="calc";
let calcDir="LONG";
let chatLog=[];

const num=id=>{const v=parseFloat(String($(id)?.value||"").replace(",","."));return Number.isFinite(v)?v:NaN};
const fx=v=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:v>=100?2:4}):"—";
const r2=v=>Math.round(v*100)/100;

function renderTools(){
 document.querySelectorAll("#toolsSeg button").forEach(b=>b.classList.toggle("on",b.dataset.tab===toolsTab));
 if(toolsTab==="calc"){$("toolsBody").innerHTML=calcHTML();initCalc()}
 else{$("toolsBody").innerHTML=chatHTML();renderChat()}
}

/* ----- Калькуляторы ----- */
function calcHTML(){
 return `<div class="card"><div class="card-title">Калькулятор позиции <small>LONG / SHORT</small></div>
  <label class="lbl">Актив</label><select id="cAsset" class="field">${Object.keys(ASSETS).map(a=>`<option value="${a}" ${a===currentAsset?"selected":""}>${ASSETS[a].pair}</option>`).join("")}</select>
  <div class="chips" id="cDir"><button data-d="LONG" class="on">LONG ↗</button><button data-d="SHORT">SHORT ↘</button></div>
  <div class="row2"><div><label class="lbl">Цена входа</label><input id="cEntry" class="field" inputmode="decimal"></div><div><label class="lbl">Маржа, $</label><input id="cMargin" class="field" inputmode="decimal" value="100"></div></div>
  <div class="row2"><div><label class="lbl">Плечо</label><input id="cLev" class="field" inputmode="decimal" value="10"></div><div><label class="lbl">Комиссия, % (на вход и выход)</label><input id="cFee" class="field" inputmode="decimal" value="0.04"></div></div>
  <div class="row2"><div><label class="lbl">Тейк-профит</label><input id="cTp" class="field" inputmode="decimal"></div><div><label class="lbl">Стоп-лосс</label><input id="cSl" class="field" inputmode="decimal"></div></div>
  <div class="calc-out" id="cOut"></div></div>
  <div class="card"><div class="card-title">Размер позиции по риску</div>
  <div class="row2"><div><label class="lbl">Баланс, $</label><input id="rBal" class="field" inputmode="decimal" value="${r2(balance)}"></div><div><label class="lbl">Риск на сделку, %</label><input id="rPct" class="field" inputmode="decimal" value="1"></div></div>
  <div class="row2"><div><label class="lbl">Цена входа</label><input id="rEntry" class="field" inputmode="decimal"></div><div><label class="lbl">Стоп-лосс</label><input id="rSl" class="field" inputmode="decimal"></div></div>
  <label class="lbl">Плечо</label><input id="rLev" class="field" inputmode="decimal" value="5">
  <div class="calc-out" id="rOut"></div></div>
  <p class="note">Расчёты учебные: не учитывают проскальзывание и изменения funding. Формула ликвидации — как в симуляторе ARVEX (поддерживающая маржа 0,5%).</p>`;
}
function setCalcDefaults(){
 const e=marketPrice($("cAsset").value),d=calcDir==="LONG"?1:-1;
 $("cEntry").value=r2(e);$("cTp").value=r2(e*(1+0.03*d));$("cSl").value=r2(e*(1-0.015*d));
 $("rEntry").value=r2(e);$("rSl").value=r2(e*(1-0.015*d));
}
function initCalc(){
 setCalcDefaults();calcPosition();calcRisk();
 $("cAsset").addEventListener("change",()=>{setCalcDefaults();calcPosition();calcRisk()});
 $("cDir").addEventListener("click",e=>{const b=e.target.closest("button[data-d]");if(!b)return;calcDir=b.dataset.d;document.querySelectorAll("#cDir button").forEach(x=>x.classList.toggle("on",x===b));setCalcDefaults();calcPosition();calcRisk()});
 ["cEntry","cMargin","cLev","cFee","cTp","cSl"].forEach(id=>$(id).addEventListener("input",calcPosition));
 ["rBal","rPct","rEntry","rSl","rLev"].forEach(id=>$(id).addEventListener("input",calcRisk));
}
function calcPosition(){
 const entry=num("cEntry"),margin=num("cMargin"),lev=num("cLev"),fee=num("cFee")||0,tp=num("cTp"),sl=num("cSl"),d=calcDir==="LONG"?1:-1,out=$("cOut");
 if(!(entry>0&&margin>0&&lev>=1)){out.innerHTML=`<div class="warn">Введи цену входа, маржу и плечо (от 1).</div>`;return}
 const size=margin*lev,qty=size/entry,fees=size*fee/100*2,liq=liqPrice(entry,lev,calcDir);
 const pnl=p=>(p-entry)/entry*size*d-fees;
 const rows=[["Размер позиции",money(size)],["Количество",qty.toLocaleString("en-US",{maximumFractionDigits:6})+" "+ASSETS[$("cAsset").value].sym],["Комиссии (оценка)",money(fees)],["Цена ликвидации",liq?`<b class="neg">${money(liq)}</b>`:"—"]];
 let warn="";
 if(tp>0){const v=pnl(tp);rows.push(["Результат на тейке",`<b class="${v>=0?"pos":"neg"}">${v>=0?"+":""}${money(v)} (${(v/margin*100).toFixed(1)}% маржи)</b>`]);if((tp-entry)*d<=0)warn+="Тейк-профит стоит не в ту сторону для выбранного направления. "}
 if(sl>0){const v=pnl(sl);rows.push(["Результат на стопе",`<b class="${v>=0?"pos":"neg"}">${v>=0?"+":""}${money(v)} (${(v/margin*100).toFixed(1)}% маржи)</b>`]);if((sl-entry)*d>=0)warn+="Стоп-лосс стоит не в ту сторону. ";if(liq&&((calcDir==="LONG"&&sl<=liq)||(calcDir==="SHORT"&&sl>=liq)))warn+="Ликвидация наступит раньше стопа! "}
 if(tp>0&&sl>0&&(tp-entry)*d>0&&(entry-sl)*d>0)rows.push(["Соотношение R:R",`<b>1 : ${(Math.abs(tp-entry)/Math.abs(entry-sl)).toFixed(2)}</b>`]);
 out.innerHTML=`<div class="kvs">${rows.map(r=>`<div><span>${r[0]}</span><span style="color:var(--text)">${r[1].startsWith("<")?r[1]:`<b>${r[1]}</b>`}</span></div>`).join("")}</div>${warn?`<div class="warn">⚠ ${warn}</div>`:""}`;
}
function calcRisk(){
 const bal=num("rBal"),pct=num("rPct"),entry=num("rEntry"),sl=num("rSl"),lev=num("rLev"),out=$("rOut");
 if(!(bal>0&&pct>0&&entry>0&&sl>0&&lev>=1)||entry===sl){out.innerHTML=`<div class="warn">Заполни все поля. Стоп не должен совпадать со входом.</div>`;return}
 const risk=bal*pct/100,dist=Math.abs(entry-sl)/entry,size=risk/dist,margin=size/lev,dir=sl<entry?"LONG":"SHORT",liq=liqPrice(entry,lev,dir);
 let warn="";
 if(margin>bal)warn+="Нужной маржи больше баланса — увеличь плечо или уменьши риск. ";
 if(liq&&((dir==="LONG"&&sl<=liq)||(dir==="SHORT"&&sl>=liq)))warn+="Ликвидация раньше стопа — снизь плечо. ";
 if(pct>3)warn+="Риск более 3% на сделку — это агрессивно для новичка. ";
 out.innerHTML=`<div class="kvs"><div><span>Направление</span><b>${dir}</b></div><div><span>Риск в деньгах</span><b>${money(risk)}</b></div><div><span>До стопа</span><b>${(dist*100).toFixed(2)}%</b></div><div><span>Размер позиции</span><b>${money(size)}</b></div><div><span>Нужная маржа</span><b>${money(margin)}</b></div><div><span>Ликвидация</span><b class="neg">${liq?money(liq):"—"}</b></div></div>${warn?`<div class="warn">⚠ ${warn}</div>`:""}`;
}

/* ----- Помощник (офлайн) ----- */
const QUICK=["Что такое плечо?","Что такое ликвидация?","Как не слить депозит?","Что такое funding?","С чего начать?","Разбери мои сделки"];
function chatHTML(){
 return `<div class="card"><div class="card-title">Помощник ARVEX <small>офлайн</small></div><div class="chat" id="chat"></div><div class="quick" id="quick">${QUICK.map(q=>`<button data-q="${q}">${q}</button>`).join("")}</div>
  <div class="chat-input"><input id="chatText" class="field" type="text" placeholder="Спроси про термин, урок или свои сделки…" autocomplete="off"><button id="chatSend">➤</button></div>
  <p class="note">Помощник отвечает по материалам школы и твоей статистике. Это не финансовый совет. Умный онлайн-режим появится вместе с аккаунтами.</p></div>`;
}
function renderChat(){
 if(!chatLog.length)chatLog.push({who:"bot",html:`<p>Привет${profile?", <b>"+esc(profile.name)+"</b>":""}! Я помощник ARVEX. Объясняю термины, подсказываю уроки и разбираю твои демо-сделки.</p><p>Выбери вопрос ниже или напиши свой.</p>`});
 const c=$("chat");c.innerHTML=chatLog.map(m=>`<div class="msg ${m.who}">${m.html}</div>`).join("");c.scrollTop=c.scrollHeight;
}
function ask(text){
 const t=text.trim();if(!t)return;
 chatLog.push({who:"me",html:esc(t)});renderChat();
 setTimeout(()=>{chatLog.push({who:"bot",html:aiAnswer(t)});if(toolsTab==="ai"&&$("chat"))renderChat()},350);
}
const isCyr=s=>/[а-яё]/.test(s);
function hasWord(t,cand){
 cand=cand.toLowerCase();
 if(isCyr(cand)){
  if(cand.length<=3)return new RegExp("(^|[^а-яёa-z0-9])"+cand.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^а-яёa-z0-9])").test(t);
  const stem=cand.length>5?cand.slice(0,-2):cand.slice(0,-1);return t.includes(stem);
 }
 return new RegExp("(^|[^a-z0-9])"+cand.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).test(t);
}
function aiAnswer(q){
 const t=q.toLowerCase();
 if(/(разбер|анализ|мои сделк|моя статист|как я торгу|мой результат)/.test(t))return analyzeTrades();
 if(/(с чего начать|новичок|начать обучение|как начать|что делать)/.test(t))return `<p><b>План для новичка:</b></p><p>1. Пройди уроки 1–3 в разделе «Школа».<br>2. Открой пару демо-сделок с плечом 1x–2x.<br>3. Прочитай урок про риски и поставь себе правило: не более 1–2% баланса на сделку.<br>4. Сдай экзамен новичка.</p><p>Всё это отмечено в «Пути новичка» в начале школы.</p>`;
 if(/(как не слить|не потерять|сохранить депозит|слить)/.test(t))return `<p><b>Как беречь депозит:</b></p><p>• Рискуй 1–2% баланса на сделку.<br>• Ставь стоп-лосс до входа.<br>• Не используй высокое плечо, пока не набрал статистику.<br>• Не «отыгрывайся» увеличенным размером.<br>• Веди журнал сделок и разбирай ошибки.</p>${lessonLink(2)}`;
 if(/^(привет|здравств|хай|hello|hi)\b/.test(t))return `<p>Привет! Спроси про любой термин: плечо, ликвидация, funding, свечи, стоп-лосс.</p>`;
 // словарь
 const hits=GLOSSARY.map(g=>{let sc=0;[g.term,...(g.alias||[])].forEach(c=>{if(c.length>=2&&hasWord(t,c))sc=Math.max(sc,c.length)});return {g,sc}}).filter(x=>x.sc).sort((a,b)=>b.sc-a.sc).slice(0,2);
 if(hits.length){
  const lesson=findLesson(t);
  return hits.map(h=>`<p><b>${h.g.term}</b> — ${h.g.def}</p>`).join("")+(lesson?lessonLink(lesson.id):"");
 }
 const lesson=findLesson(t);
 if(lesson)return `<p>Похожая тема есть в уроке <b>«${lesson.title}»</b>:</p><p>${lesson.points.slice(0,3).map(p=>"• "+p).join("<br>")}</p>${lessonLink(lesson.id)}`;
 return `<p>Не нашёл точного ответа. Попробуй спросить про: <b>плечо, ликвидацию, funding, стоп-лосс, свечи, тренд, риск</b> — или открой «Словарь» в школе.</p>`;
}
function findLesson(t){
 const words=t.split(/[^а-яёa-z0-9]+/).filter(w=>w.length>=4).map(w=>w.slice(0,Math.max(4,w.length-2)));
 let best=null,bs=0;
 LESSONS.forEach(l=>{const hay=(l.title+" "+l.summary+" "+l.points.join(" ")).toLowerCase();const sc=words.filter(w=>hay.includes(w)).length;if(sc>bs){bs=sc;best=l}});
 return bs>=1?best:null;
}
function lessonLink(id){const l=lessonById(id);return l?`<p><a href="#" data-lesson-open="${id}" style="color:var(--purple2)">Открыть урок «${l.title}» →</a></p>`:""}
function analyzeTrades(){
 const s=tradeStats();
 if(!s.n)return `<p>Пока нет закрытых сделок. Открой и закрой несколько демо-сделок — и я разберу твою статистику.</p>`;
 const rr=s.avgLoss?Math.abs(s.avgWin/s.avgLoss):0,exp=s.totalPnl/s.n,tips=[];
 if(s.n<5)tips.push("Данных пока мало — набери хотя бы 10 сделок, чтобы выводы были надёжнее.");
 if(s.avgLev>10)tips.push(`Среднее плечо ${s.avgLev.toFixed(1)}x очень высокое: ликвидация близко. Попробуй 2x–5x.`);
 if(s.liq>0)tips.push(`Ликвидаций: ${s.liq}. Поставь стоп-лосс заранее и снизь плечо — стоп должен срабатывать раньше ликвидации.`);
 if(s.n>=5&&s.winrate<40&&rr<1.5)tips.push("Низкий винрейт при невысоком R:R. Либо отбирай сделки строже, либо ставь цели дальше стопа (цель не менее 1:2).");
 if(s.avgLoss&&Math.abs(s.avgLoss)>s.avgWin*1.5)tips.push("Средний убыток заметно больше средней прибыли — режь убытки быстрее.");
 if(!tips.length)tips.push(exp>0?"Хороший баланс. Продолжай следовать правилам риска и веди журнал сделок.":"Серьёзных перекосов не вижу. Следи за размером риска и дисциплиной.");
 return `<p><b>Твоя статистика:</b></p><p>Сделок: ${s.n} · Винрейт: ${s.winrate.toFixed(0)}%<br>Итог: ${s.totalPnl>=0?"+":""}${money(s.totalPnl)} · На сделку: ${exp>=0?"+":""}${money(exp)}<br>Средняя прибыль: ${money(s.avgWin)} · Средний убыток: ${money(s.avgLoss)}${rr?`<br>Фактический R:R ≈ 1 : ${rr.toFixed(2)}`:""}</p><p><b>Рекомендации:</b></p><p>${tips.map(x=>"• "+x).join("<br>")}</p><p class="muted"><small>Учебный разбор, не финансовый совет.</small></p>`;
}

window.addEventListener("DOMContentLoaded",()=>{
 $("toolsSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b)return;toolsTab=b.dataset.tab;renderTools()});
 $("toolsBody").addEventListener("click",e=>{
  const q=e.target.closest("[data-q]");if(q){ask(q.dataset.q);return}
  if(e.target.closest("#chatSend")){const i=$("chatText");ask(i.value);i.value="";return}
  const l=e.target.closest("[data-lesson-open]");if(l){e.preventDefault();openLesson(Number(l.dataset.lessonOpen))}
 });
 $("toolsBody").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="chatText"){ask(e.target.value);e.target.value=""}});
});
