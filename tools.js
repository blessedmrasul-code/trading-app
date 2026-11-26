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
 return `<div class="card"><div class="card-title">Помощник ARVEX <small>справочник и анализ</small></div><div class="chat" id="chat"></div><div class="quick" id="quick">${QUICK.map(q=>`<button data-q="${q}">${q}</button>`).join("")}</div>
  <div class="chat-input"><input id="chatText" class="field" type="text" placeholder="Спроси про термин, урок или свои сделки…" autocomplete="off"><button id="chatSend">➤</button></div>
  <p class="note">Помощник отвечает по материалам школы и твоей статистике. Это не финансовый совет. Ответы формируются по базе знаний ARVEX и твоей статистике. Свободный генеративный режим потребует подключения языковой модели.</p></div>`;
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
 const raw=String(q||"").trim(),t=raw.toLowerCase().replace(/ё/g,"е");
 if(/(разбер|анализ|мои сделк|моя статист|как я торгу|мой результат|портфель)/.test(t))return analyzeTrades();
 if(/^(привет|здравств|хай|hello|hi|добрый день|добрый вечер)\\b/.test(t))return `<p>Привет! Я помощник ARVEX. Могу объяснить торговые понятия, индикаторы и графики, помочь рассчитать риск, разобрать демо-статистику и подобрать следующий урок.</p><p>Напиши вопрос целиком — например: «Почему стоп-лосс важен при плече 10x?»</p>`;
 const answers=[
  {re:/(плеч|leverage)/,html:`<p><b>Плечо</b> увеличивает номинал позиции относительно залоговой маржи. При марже $100 и плече 5x размер позиции равен примерно $500.</p><p>Важно: прибыль и убыток относительно маржи тоже усиливаются. Движение цены на 2% против позиции с плечом 5x означает около 10% убытка от маржи до комиссий и других расходов. Высокое плечо приближает ликвидацию, но не делает стратегию прибыльнее.</p>${lessonLink(6)}`},
  {re:/(ликвидац|liquidat)/,html:`<p><b>Ликвидация</b> — принудительное закрытие позиции, когда залога уже недостаточно для поддержания позиции. Чем выше плечо, тем меньше неблагоприятное движение цены, которое выдерживает маржа.</p><p>Чтобы снизить риск: уменьшай плечо и размер позиции, заранее рассчитывай стоп и не используй всю доступную маржу. В ARVEX ликвидация моделируется упрощённо.</p>${lessonLink(8)}`},
  {re:/(стоп.?лосс|stop.?loss|стоп|stop loss)/,html:`<p><b>Стоп-лосс</b> — заранее заданный уровень выхода, если сценарий сделки не подтвердился. Он ограничивает планируемый убыток, но на реальном рынке цена исполнения может отличаться из-за гэпа и проскальзывания.</p><p>Сначала выбери логичный уровень отмены идеи, затем рассчитай размер позиции под допустимый риск. Не отодвигай стоп дальше только ради того, чтобы избежать фиксации убытка.</p>${lessonLink(12)}`},
  {re:/(тейк.?профит|take.?profit|тейк)/,html:`<p><b>Тейк-профит</b> — целевой уровень, на котором позиция закрывается с прибылью. Его стоит выбирать вместе со стопом: сравни потенциальную прибыль и возможный убыток (R:R).</p><p>Например, если риск до стопа $10, а цель даёт $20, соотношение риск/прибыль — 1:2. Это не гарантирует прибыль: важны вероятность достижения цели, комиссии и качество входа.</p>${lessonLink(12)}`},
  {re:/(funding|фандинг)/,html:`<p><b>Funding Rate</b> — периодический платёж между держателями LONG и SHORT в бессрочных фьючерсах. При положительной ставке обычно платят лонги, при отрицательной — шорты. Ставка и расписание зависят от площадки.</p><p>Funding — расход или доход позиции, а не гарантированная прибыль. Учитывай его вместе с торговыми комиссиями.</p>${lessonLink(4)}`},
  {re:/(свеч|японск.*граф|ohlc)/,html:`<p><b>Японская свеча</b> показывает четыре значения за выбранный период: Open (открытие), High (максимум), Low (минимум) и Close (закрытие). Тело — расстояние между открытием и закрытием, фитили — достигнутые экстремумы.</p><p>Зелёная свеча обычно закрылась выше открытия, красная — ниже. Одна свеча сама по себе не предсказывает следующую: смотри на контекст, объём, тренд и уровни.</p>${lessonLink(3)}`},
  {re:/(таймфрейм|timeframe|1м|5м|15м|1ч|4ч|1д)/,html:`<p><b>Таймфрейм</b> — длительность одной свечи. На 15м каждая свеча отображает 15 минут, на 4ч — четыре часа. Младшие интервалы показывают больше краткосрочного шума; старшие помогают видеть общую структуру.</p><p>Полезно сначала определить направление на старшем интервале, а затем искать сценарий на младшем — без гарантии результата.</p>${lessonLink(3)}`},
  {re:/(тренд|trend|направлени.*рынк)/,html:`<p><b>Тренд</b> — устойчивое направление движения цены. Восходящая структура часто формирует более высокие максимумы и минимумы; нисходящая — более низкие максимумы и минимумы. Боковое движение называют диапазоном (range).</p><p>Не определяй тренд по одной свече. Отметь последовательность экстремумов и проверь её на нескольких таймфреймах.</p>${lessonLink(5)}`},
  {re:/(поддержк|сопротивлен|уровн|support|resistance)/,html:`<p><b>Поддержка и сопротивление</b> — ценовые зоны, где ранее усиливалась активность покупателей или продавцов. Это зоны, а не идеально точные линии.</p><p>Отмечай области повторных реакций, смотри на закрытия свечей и объём. Пробой может оказаться ложным, поэтому полезно заранее определить подтверждение и сценарий отмены идеи.</p>${lessonLink(7)}`},
  {re:/(rsi|индекс относительной силы)/,html:`<p><b>RSI</b> — осциллятор импульса, обычно отображаемый от 0 до 100. Уровни 70 и 30 часто используют как ориентиры перекупленности и перепроданности, но они не являются автоматическими сигналами разворота.</p><p>В сильном тренде RSI может долго оставаться в высокой или низкой зоне. Сопоставляй его со структурой цены и другими подтверждениями.</p>${lessonLink(10)}`},
  {re:/(macd)/,html:`<p><b>MACD</b> сравнивает две экспоненциальные скользящие средние и показывает их разницу, сигнальную линию и гистограмму. Его используют для оценки импульса и возможных смен темпа.</p><p>MACD запаздывает, поскольку основан на прошлых ценах. Пересечение линий не гарантирует продолжение движения.</p>${lessonLink(10)}`},
  {re:/(bollinger|боллинджер|bb)/,html:`<p><b>Полосы Боллинджера</b> состоят из средней скользящей и верхней/нижней границ, рассчитанных через стандартное отклонение. Полосы расширяются при росте волатильности и сужаются при её снижении.</p><p>Касание верхней или нижней полосы не означает обязательный разворот: в тренде цена может двигаться вдоль полосы.</p>${lessonLink(10)}`},
  {re:/(ma|sma|скользящ|ema)/,html:`<p><b>MA / SMA</b> — простая скользящая средняя, которая сглаживает цену за выбранное число свечей. <b>EMA</b> тоже сглаживает цену, но придаёт больший вес последним значениям и быстрее реагирует на изменения.</p><p>Обе линии запаздывают и не предсказывают будущее. Используй их как контекст, а не как самостоятельную гарантию входа.</p>${lessonLink(10)}`},
  {re:/(объем|объём|volume)/,html:`<p><b>Объём</b> показывает, сколько актива или контрактов прошло через рынок за период (в зависимости от источника данных). Сравнивай текущий объём с предыдущими свечами и учитывай, что высокий объём сам по себе не говорит о направлении.</p><p>Рост цены на повышенном объёме может подтверждать активность покупателей, но требует проверки структуры и закрытия свечи.</p>${lessonLink(11)}`},
  {re:/(риск|депозит|капитал|не слить|убыт|просадк)/,html:`<p><b>Управление риском</b> начинается с суммы, которую ты готов потерять при ошибке. Например, 1% от виртуального баланса $10 000 — это $100 планового риска.</p><p>Размер позиции рассчитывают от расстояния до стопа: номинал ≈ допустимый убыток / относительное расстояние до стопа. После этого отдельно учитывают плечо, маржу, комиссии и возможное проскальзывание. Не увеличивай риск после серии убытков.</p>${lessonLink(12)}`},
  {re:/(long|лонг)/,html:`<p><b>LONG</b> — позиция, которая получает прибыль при росте цены базового актива и теряет при падении. Перед открытием определи точку отмены идеи, стоп, размер риска и целевой сценарий.</p>${lessonLink(1)}`},
  {re:/(short|шорт)/,html:`<p><b>SHORT</b> — позиция, которая получает прибыль при снижении цены и теряет при росте. Резкий рост против SHORT может привести к крупному убытку или ликвидации при использовании плеча.</p>${lessonLink(1)}`},
  {re:/(спред|spread)/,html:`<p><b>Спред</b> — разница между лучшей доступной ценой покупки (ask) и продажи (bid). Чем шире спред, тем дороже может оказаться немедленный вход и выход.</p>${lessonLink(4)}`},
  {re:/(проскальзыван|slippage)/,html:`<p><b>Проскальзывание</b> — разница между ожидаемой и фактической ценой исполнения. Оно чаще заметно при высокой волатильности, низкой ликвидности и крупных рыночных ордерах.</p><p>Учитывай его при тестировании стратегии: результат без реалистичных издержек может быть завышен.</p>${lessonLink(20)}`},
  {re:/(спот|фьючерс|perpetual)/,html:`<p><b>Спот</b> — покупка или продажа самого актива. <b>Фьючерс</b> — контракт на изменение его цены; он может позволять LONG, SHORT и плечо. Бессрочные контракты используют Funding Rate.</p><p>Плечо и ликвидация добавляют фьючерсам риск, которого нет в той же форме при обычной покупке актива без заёмных средств.</p>${lessonLink(4)}`},
  {re:/(что купить|что продать|какой актив|куда пойдет|куда пойд|прогноз цены|сигнал)/,html:`<p>Я не могу достоверно предсказать направление рынка или назвать гарантированную сделку. Вместо сигнала могу помочь разобрать актив по плану: таймфрейм, структура тренда, уровни, объём, точка отмены идеи и риск до стопа.</p><p>Напиши тикер и таймфрейм, а также свой сценарий — помогу структурировать учебный разбор. Это не финансовая рекомендация.</p>`},
  {re:/(начать|нович|с чего)/,html:`<p><b>План обучения:</b></p><p>1. Изучи основы рынка и торговые пары.<br>2. Разберись со свечами и таймфреймами.<br>3. Освой LONG/SHORT, стоп и тейк.<br>4. Научись считать риск до открытия позиции.<br>5. Проводи только демо-практику и веди журнал.<br>6. Пройди экзамен новичка в разделе «Школа».</p>`}
 ];
 for(const item of answers)if(item.re.test(t))return item.html;

 const words=t.split(/[^а-яёa-z0-9]+/).filter(w=>w.length>2&&!/^(что|как|это|для|при|или|мне|можно|такое|такой|так|the|and|for|with)$/.test(w));
 const scored=GLOSSARY.map(g=>{
  const terms=[g.term,...(g.alias||[])].map(x=>String(x).toLowerCase().replace(/ё/g,"е"));
  const text=(g.term+" "+(g.alias||[]).join(" ")+" "+g.def).toLowerCase().replace(/ё/g,"е");
  let score=0;
  for(const w of words){if(terms.some(x=>x===w||x.includes(w)||w.includes(x)))score+=3;else if(text.includes(w))score+=1}
  return {g,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2);
 const lesson=findLesson(t);
 if(scored.length)return scored.map(x=>`<p><b>${esc(x.g.term)}</b> — ${esc(x.g.def)}</p>`).join("")+(lesson?lessonLink(lesson.id):"");
 if(lesson)return `<p>Похоже, вопрос связан с темой <b>«${esc(lesson.title)}»</b>.</p><p>${lesson.points.slice(0,4).map(p=>"• "+esc(p)).join("<br>")}</p><p>${esc(lesson.summary)}</p>${lessonLink(lesson.id)}`;
 return `<p>Я пока не нашёл достаточно точного ответа на формулировку: «${esc(raw)}».</p><p>Уточни, пожалуйста, что именно нужно разобрать: термин, индикатор, расчёт позиции, риск, график или конкретную демо-сделку. Я могу отвечать по материалам ARVEX и твоей статистике, но для свободного генеративного диалога потребуется подключить языковую модель на сервере.</p>`;
}
function findLesson(t){
 const stop=new Set(["что","как","это","для","при","или","мне","тебя","такое","такой","почему","когда","где","какой","какая","какие","можно","будет","есть","про"]);
 const words=String(t).toLowerCase().replace(/ё/g,"е").split(/[^а-яa-z0-9]+/).filter(w=>w.length>=3&&!stop.has(w));
 let best=null,bs=0;
 LESSONS.forEach(l=>{
  const hay=(l.title+" "+l.summary+" "+l.body.join(" ")+" "+l.points.join(" ")).toLowerCase().replace(/ё/g,"е");
  let score=0;
  for(const w of words){if(hay.includes(w))score+=w.length>=6?2:1}
  if(score>bs){bs=score;best=l}
 });
 return bs>=2?best:null;
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
