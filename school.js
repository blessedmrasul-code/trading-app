/* ARVEX — Школа: уроки, тесты, экзамены, словарь. Зависит от lessons.js, exam.js, glossary.js, app.js */
let schoolTab="lessons";
let lessonView={screen:"list",id:null,result:null};
let ex={screen:"menu",id:null,qs:[],idx:0,deadline:0,result:null};
let exTimer=null;

const RESOURCES=[
 {t:"Binance Academy",u:"https://academy.binance.com",d:"Бесплатные статьи и курсы по крипте и трейдингу."},
 {t:"BabyPips",u:"https://www.babypips.com",d:"Бесплатная «школа» трейдинга от основ до психологии (английский)."},
 {t:"Investopedia",u:"https://www.investopedia.com",d:"Большой словарь и статьи по финансам (английский)."}
];
const BOOKS=[
 "«Воспоминания биржевого спекулянта» — Эдвин Лефевр",
 "«Волшебники рынка» — Джек Швагер",
 "«Зона трейдинга» (Trading in the Zone) — Марк Дуглас",
 "«Технический анализ финансовых рынков» — Джон Мэрфи"
];
const lessonById=id=>LESSONS.find(l=>l.id===id);

function renderSchool(){
 document.querySelectorAll("#schoolSeg button").forEach(b=>b.classList.toggle("on",b.dataset.tab===schoolTab));
 const box=$("schoolBody");if(!box)return;
 if(schoolTab==="lessons")box.innerHTML=lessonsHTML();
 else if(schoolTab==="exam")box.innerHTML=examHTML();
 else if(schoolTab==="masterclass")box.innerHTML=masterclassHTML();
 else box.innerHTML=glossaryHTML();
}
function openLesson(id){schoolTab="lessons";lessonView={screen:"lesson",id,result:null};go("school")}

/* ----- Уроки ----- */
function roadmapHTML(){
 const steps=[
  ["Создать профиль",!!profile],
  ["Пройти первый урок",Object.keys(progress.lessons).length>=1],
  ["Сдать первый тест",Object.keys(progress.quizzes).length>=1],
  ["Открыть первую демо-сделку",history.length+positions.length>=1],
  ["Сдать экзамен новичка",!!progress.exams.novice?.passed],
  ["Сдать экспертный экзамен",!!progress.exams.expert?.passed]
 ],done=steps.filter(s=>s[1]).length;
 return `<div class="card roadmap"><div class="card-title">Путь новичка <span class="badge">${done}/${steps.length}</span></div><div class="bar"><i style="width:${done/steps.length*100}%"></i></div>
  <div class="steps">${steps.map(s=>`<div class="${s[1]?"ok":""}"><span class="dot">${s[1]?"✓":""}</span>${s[0]}</div>`).join("")}</div></div>`;
}
function lessonsHTML(){
 const v=lessonView,lesson=v.id?lessonById(v.id):null;
 if(v.screen==="lesson"&&lesson)return lessonPage(lesson);
 if(v.screen==="quiz"&&lesson)return quizPage(lesson);
 const doneL=LESSONS.filter(l=>progress.lessons[l.id]).length,doneQ=LESSONS.filter(l=>progress.quizzes[l.id]).length;
 let html=roadmapHTML()+`<div class="muted" style="margin:4px 2px 0">Уроков: <b style="color:var(--text)">${doneL}/${LESSONS.length}</b> · Тестов: <b style="color:var(--text)">${doneQ}/${LESSONS.length}</b> · +${LESSON_XP} XP за урок и +${QUIZ_XP} XP за тест (один раз)</div>`;
 let mod="";
 LESSONS.forEach((l,i)=>{
  if(l.module!==mod){mod=l.module;html+=`<div class="module">${mod}</div>`}
  const dl=!!progress.lessons[l.id],dq=!!progress.quizzes[l.id];
  html+=`<button class="lesson-card ${dl&&dq?"done":""}" data-act="open" data-lesson="${l.id}"><div class="n">${dl&&dq?"✓":i+1}</div><div><h3>${l.title}</h3><p>${l.summary}</p></div><div class="st"><b>${dl?"✓ Урок":"Урок"}</b>${dq?"✓ Тест":"Тест"}</div></button>`;
 });
 html+=`<div class="card" style="margin-top:18px"><div class="card-title">Бесплатные ресурсы</div>${RESOURCES.map(r=>`<a class="res-link" href="${r.u}" target="_blank" rel="noopener"><b>${r.t} ↗</b><span>${r.d}</span></a>`).join("")}
  <div class="module" style="margin-top:14px">Книги для чтения</div><ul style="margin:6px 0 0;padding-left:18px;color:var(--muted);font-size:14px;line-height:1.8">${BOOKS.map(b=>`<li>${b}</li>`).join("")}</ul>
  <p class="note">Внешние материалы не принадлежат ARVEX и не являются финансовой рекомендацией. Ищите легальные копии книг.</p></div>`;
 return html;
}
function lessonPage(l){
 const done=!!progress.lessons[l.id],idx=LESSONS.indexOf(l),next=LESSONS[idx+1];
 return `<button class="back-btn" data-act="list">← Все уроки</button><article class="lesson-view"><span class="lesson-tag">${l.tag}</span><h3>${l.title}</h3>${l.body.map(t=>`<p>${t}</p>`).join("")}
  <div class="key-points"><b>Главное</b><ul>${l.points.map(t=>`<li>${t}</li>`).join("")}</ul></div>
  <div class="actions">${done?`<button class="primary" data-act="quiz" data-lesson="${l.id}">Перейти к тесту</button>${next?`<button class="ghost" data-act="open" data-lesson="${next.id}">Следующий урок →</button>`:""}<small class="muted" style="width:100%">Урок засчитан · XP за него начисляется один раз</small>`
  :`<button class="primary" data-act="finish" data-lesson="${l.id}">Завершить урок · +${LESSON_XP} XP</button>`}</div></article>`;
}
function quizPage(l){
 const r=lessonView.result,done=!!progress.quizzes[l.id];
 return `<button class="back-btn" data-act="lesson" data-lesson="${l.id}">← К уроку</button><article class="lesson-view"><span class="lesson-tag">ТЕСТ · ${l.title}</span><h3>Проверь себя</h3>
  <p class="muted">Нужно ${QUIZ_PASS_SCORE} правильных из ${l.quiz.length}. ${done?"Тест уже сдан, XP за него начисляется один раз.":"За успешную сдачу: +"+QUIZ_XP+" XP."}</p>
  ${l.quiz.map((q,qi)=>{const given=r?r.answers[qi]:null;
   return `<fieldset class="quiz-q"><legend>${qi+1}. ${q.q}</legend>${q.options.map((o,oi)=>{let c="";if(r){if(oi===q.answer)c="right";else if(oi===given)c="wrong"}
    return `<label class="opt ${c}"><input type="radio" name="q${qi}" value="${oi}" ${given===oi?"checked":""} ${r?"disabled":""}><span>${o}</span></label>`}).join("")}${r?`<small class="muted">${q.explain}</small>`:""}</fieldset>`}).join("")}
  ${r?`<div class="result ${r.passed?"pass":"fail"}">Результат: ${r.score} из ${l.quiz.length}. ${r.passed?"Тест сдан!":"Пока не зачтено — перечитай урок и попробуй снова."}${r.xpText?" "+r.xpText:""}</div><div class="actions"><button class="primary" data-act="retry" data-lesson="${l.id}">Пройти заново</button><button class="ghost" data-act="list">К списку</button></div>`
  :`<div class="actions"><button class="primary" data-act="check" data-lesson="${l.id}">Проверить ответы</button></div>`}</article>`;
}
function lessonAction(act,id){
 const l=lessonById(id);
 if(act==="list")lessonView={screen:"list",id:null,result:null};
 else if(act==="open"||act==="lesson")lessonView={screen:"lesson",id,result:null};
 else if(act==="finish"&&l){
  const r=awardOnce("lessons",id,LESSON_XP);
  showToast(r.awarded?(r.levelUp?`Урок пройден! +${LESSON_XP} XP · Новый уровень ${level}!`:`Урок пройден! +${LESSON_XP} XP`):"Этот урок уже засчитан.");
  lessonView={screen:"quiz",id,result:null};
 }
 else if(act==="quiz"||act==="retry")lessonView={screen:"quiz",id,result:null};
 else if(act==="check"&&l){
  const answers=l.quiz.map((_,qi)=>{const c=document.querySelector(`input[name="q${qi}"]:checked`);return c?Number(c.value):null});
  if(answers.some(a=>a===null)){showToast("Ответь на все вопросы теста.");return}
  const score=answers.filter((a,qi)=>a===l.quiz[qi].answer).length,passed=score>=QUIZ_PASS_SCORE;let xpText="";
  if(passed){const r=awardOnce("quizzes",id,QUIZ_XP);xpText=r.awarded?`+${QUIZ_XP} XP получено${r.levelUp?` · Новый уровень ${level}!`:""}.`:"XP за этот тест уже был получен.";showToast(r.awarded?`Тест сдан! +${QUIZ_XP} XP`:"Тест сдан. XP уже начислен ранее.")}
  lessonView={screen:"quiz",id,result:{answers,score,passed,xpText}};
 }
 renderSchool();window.scrollTo(0,0);
}

/* ----- Экзамены ----- */
const fmtTime=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
function examHTML(){
 if(ex.screen==="run")return examRun();
 if(ex.screen==="result")return examResult();
 return `<p class="muted" style="margin:0 2px 12px">Как настоящий экзамен: каждый раз новые случайные вопросы, перемешанные ответы и таймер. Подсказки видны только после завершения.</p>`+
  Object.values(EXAMS).map(c=>{const p=progress.exams[c.id];
   return `<div class="card exam-card"><h3>${c.title} ${p?.passed?'<span class="tag long">СДАН</span>':""}</h3><p>${c.desc}</p>
   <div class="meta"><span>${c.count} вопросов</span><span>${Math.round(c.time/60)} мин</span><span>Зачёт от ${c.pass}%</span><span>+${c.xp} XP</span>${p?`<span>Лучший: ${p.best}%</span><span>Попыток: ${p.attempts}</span>`:""}</div>
   <button class="primary" style="margin-top:0" data-act="start" data-exam="${c.id}">${p?"Пройти снова":"Начать экзамен"}</button></div>`}).join("");
}
function startExam(id){
 ex={screen:"run",id,qs:buildExam(id),idx:0,deadline:Date.now()+EXAMS[id].time*1000,result:null};
 clearInterval(exTimer);exTimer=setInterval(tickExam,500);renderSchool();window.scrollTo(0,0);
}
function tickExam(){
 if(ex.screen!=="run"){clearInterval(exTimer);return}
 const left=Math.max(0,Math.ceil((ex.deadline-Date.now())/1000)),el=$("examTimer");
 if(el){el.textContent=fmtTime(left);el.classList.toggle("low",left<=60)}
 if(left<=0){showToast("Время вышло — экзамен завершён.");finishExam()}
}
function examRun(){
 const q=ex.qs[ex.idx],n=ex.qs.length,left=Math.max(0,Math.ceil((ex.deadline-Date.now())/1000));
 return `<div class="exam-head"><span>${EXAMS[ex.id].title} · ${ex.idx+1}/${n}</span><span class="timer ${left<=60?"low":""}" id="examTimer">${fmtTime(left)}</span></div>
  <div class="bar" style="height:6px;border-radius:6px;background:rgba(255,255,255,.07);overflow:hidden"><i style="display:block;height:100%;width:${(ex.idx+1)/n*100}%;background:var(--purple)"></i></div>
  <div class="q-text">${q.q}</div>${q.opts.map((o,i)=>`<button class="opt ${q.picked===i?"sel":""}" data-act="pick" data-i="${i}"><span>${o.t}</span></button>`).join("")}
  <div class="actions">${ex.idx>0?`<button class="ghost" data-act="prev">← Назад</button>`:""}<button class="primary" data-act="${ex.idx===n-1?"finish-exam":"next"}">${ex.idx===n-1?"Завершить экзамен":"Далее →"}</button></div>
  <p class="note">Можно пропустить вопрос и вернуться к нему кнопкой «Назад». Неотвеченные считаются неверными.</p>`;
}
function finishExam(){
 if(ex.screen!=="run")return;
 clearInterval(exTimer);
 const cfg=EXAMS[ex.id],n=ex.qs.length,score=ex.qs.filter(q=>q.picked!=null&&q.opts[q.picked].ok).length,pct=Math.round(score/n*100),passed=pct>=cfg.pass;
 const prev=progress.exams[ex.id]||{best:0,passed:false,xpGiven:false,attempts:0};
 const rec={best:Math.max(prev.best,pct),passed:prev.passed||passed,xpGiven:prev.xpGiven,attempts:prev.attempts+1};
 let xpText="";
 if(passed){if(!rec.xpGiven){rec.xpGiven=true;const up=addXp(cfg.xp);xpText=`+${cfg.xp} XP получено${up?` · Новый уровень ${level}!`:""}.`}else xpText="XP за этот экзамен уже был получен."}
 progress.exams[ex.id]=rec;saveState();renderTop();
 ex={...ex,screen:"result",result:{score,n,pct,passed,xpText}};renderSchool();window.scrollTo(0,0);
}
function examResult(){
 const r=ex.result,cfg=EXAMS[ex.id];
 return `<div class="result ${r.passed?"pass":"fail"}" style="font-size:17px">${r.passed?"Экзамен сдан!":"Экзамен не сдан"} · ${r.score} из ${r.n} (${r.pct}%)${r.xpText?"<br><small>"+r.xpText+"</small>":`<br><small>Нужно ${cfg.pass}% для зачёта.</small>`}</div>
  <div class="card"><div class="card-title">Разбор ответов</div>${ex.qs.map((q,i)=>{const ok=q.picked!=null&&q.opts[q.picked].ok,right=q.opts.find(o=>o.ok).t;
   return `<div class="review-item"><b>${i+1}. ${q.q}</b><br><span class="${ok?"pos":"neg"}">${q.picked==null?"Нет ответа":(ok?"✓ ":"✗ ")+q.opts[q.picked].t}</span>${ok?"":`<br><span class="pos">Верно: ${right}</span><br><small class="muted">${q.explain}</small>`}</div>`}).join("")}</div>
  <div class="actions"><button class="primary" data-act="start" data-exam="${ex.id}">Пройти заново (новые вопросы)</button><button class="ghost" data-act="menu">В меню</button></div>`;
}
function examAction(act,t){
 if(act==="start")return startExam(t.dataset.exam);
 if(act==="menu"){ex={screen:"menu",id:null,qs:[],idx:0,deadline:0,result:null}}
 else if(act==="pick"){ex.qs[ex.idx].picked=Number(t.dataset.i)}
 else if(act==="next")ex.idx=Math.min(ex.qs.length-1,ex.idx+1);
 else if(act==="prev")ex.idx=Math.max(0,ex.idx-1);
 else if(act==="finish-exam")return finishExam();
 renderSchool();
}


const MASTER_LESSONS=[
{id:"master-risk",title:"Архитектура риска: выживание серии",summary:"Расчёт позиции, коррелированный риск, лимиты дня и стресс-сценарии.",body:["Профессиональная система начинается не с поиска входа, а с ограничения ущерба. До сделки зафиксируй капитал, риск в R, точку отмены идеи, дневной лимит и максимальную суммарную экспозицию. Если хотя бы одно значение неизвестно — сделки нет.","Номинал позиции = допустимый денежный убыток / относительное расстояние до стопа. Затем отдельно оцени маржу, комиссии, funding, проскальзывание и гэп. Стоп не гарантирует исполнение по указанной цене.","Риск нескольких позиций нельзя считать изолированно. BTC и ETH могут иметь общий фактор движения; две позиции по 1R способны вести себя как одна крупная ставка. Считай стресс-убыток портфеля при общем шоке.","Дневной лимит — жёсткий выключатель. После нарушения торговля прекращается до следующего периода. Запрещено двигать стоп дальше или повышать плечо ради отыгрыша."],points:["Сначала лимит потерь, потом торговая идея.","Номинал выводится из риска и стоп-дистанции.","Коррелированные позиции оцениваются как общий сценарный риск.","Дневной лимит нельзя отменять эмоциями."],quiz:[
{q:"Капитал $8 000, риск 0,75%, стоп 1,5%. Номинал?",options:["$400","$4 000","$8 000"],answer:1,explain:"Риск $60; $60 / 0,015 = $4 000."},
{q:"Две сильно коррелированные позиции по 1R. Что корректнее?",options:["Считать независимыми","Оценить общий стресс-сценарий","Увеличить плечо"],answer:1,explain:"Общий фактор способен вызвать одновременный убыток."},
{q:"Дневной лимит достигнут, появился идеальный сигнал.",options:["Открыть половину","Увеличить плечо","Остановить торговлю"],answer:2,explain:"Лимит — безусловное правило остановки."},
{q:"Почему стоп не гарантирует точный убыток?",options:["Гэп, проскальзывание и нехватка ликвидности","Стоп отменяет комиссии","Стоп всегда исполняется точно"],answer:0,explain:"Цена исполнения может отличаться от стоп-уровня."},
{q:"Риск $48, стоп-дистанция 0,8%. Номинал?",options:["$600","$6 000","$3 840"],answer:1,explain:"48 / 0,008 = $6 000."}
]},
{id:"master-edge",title:"Проверка преимущества без самообмана",summary:"Ожидание, выборки, переоптимизация, издержки и форвард-тест.",body:["Положительный результат на графике или в небольшой выборке не доказывает преимущество. Формализуй вход, выход, стоп, размер позиции и правила пропуска так, чтобы два человека применяли их одинаково.","Ожидание до расходов: E = p × средний выигрыш − (1−p) × средний убыток. Затем вычти комиссии, funding, спред и проскальзывание. Если преимущество исчезает после реалистичных расходов, стратегия не готова.","Разделяй данные на разработку, валидацию и финальную out-of-sample выборку. Не меняй параметры после просмотра финальной выборки. Многократный перебор повышает шанс случайно найти красивую историю.","После бэктеста проведи форвард-тест на демо с неизменными правилами. Записывай сигналы, пропуски, исполнение, отклонения и эмоциональные решения."],points:["Правила формализуются до теста.","Ожидание считается после расходов.","Финальная выборка не участвует в подборе.","Форвард-тест проверяет переносимость и дисциплину."],quiz:[
{q:"Винрейт 42%, выигрыш 2R, убыток 1R. E до расходов?",options:["+0,26R","−0,16R","+0,42R"],answer:0,explain:"0,42×2 − 0,58 = +0,26R."},
{q:"E до расходов +0,18R, издержки 0,23R. Чистое E?",options:["+0,41R","+0,05R","−0,05R"],answer:2,explain:"0,18 − 0,23 = −0,05R."},
{q:"Зачем out-of-sample выборка?",options:["Подбирать параметры точнее","Проверять на данных, не использованных при разработке","Увеличить число сделок"],answer:1,explain:"Она помогает выявить переоптимизацию."},
{q:"Изменил параметры после просмотра финальной выборки. Что теперь?",options:["Считать её независимой","Нужна новая независимая выборка","Удалить убыточные сделки"],answer:1,explain:"После подбора выборка перестаёт быть независимой."},
{q:"Что делает форвард-тест недостоверным?",options:["Менять правила после каждого убытка без протокола","Записывать сделки","Задать дату завершения"],answer:0,explain:"Изменение правил на ходу разрушает сопоставимость."}
]}
];
const MASTER_FINAL=[
{q:"Счёт $12 000, риск 0,6%, стоп 1,2%. Номинал?",options:["$600","$6 000","$10 000"],answer:1,explain:"Риск $72; 72 / 0,012 = $6 000."},
{q:"Винрейт 38%, выигрыш 2,4R, убыток 1R. E?",options:["+0,292R","−0,088R","+0,912R"],answer:0,explain:"0,38×2,4 − 0,62 = +0,292R."},
{q:"E +0,12R, расходы 0,17R. Чистое E?",options:["+0,29R","−0,05R","+0,12R"],answer:1,explain:"Чистое ожидание −0,05R."},
{q:"Три коррелированные позиции по 0,8R. Подход?",options:["Игнорировать корреляцию","Проверить общий стресс-сценарий","Увеличить плечо"],answer:1,explain:"Общий фактор может задеть все позиции."},
{q:"Дневной лимит достигнут, новый сигнал на другой паре.",options:["Торговать","Удвоить риск","Остановиться"],answer:2,explain:"Лимит относится ко всей системе."},
{q:"Почему стоп-лимит может не закрыть позицию?",options:["Цена прошла лимит без встречного объёма","Рынок закрыт","Отменяется плечо"],answer:0,explain:"Лимит ограничивает цену, но не гарантирует исполнение."},
{q:"Параметры подобраны на всей истории. Главный риск?",options:["Переоптимизация","Недостаточное плечо","Слишком низкая комиссия"],answer:0,explain:"История использовалась для принятия решений."},
{q:"Какой набор оставить нетронутым?",options:["Out-of-sample","Только прибыльные сделки","Случайные скриншоты"],answer:0,explain:"Финальная выборка не участвует в подборе."},
{q:"Funding +0,02% каждые 8 часов, LONG $15 000. Расход за сутки?",options:["$3","$9","$30"],answer:1,explain:"15 000 × 0,0002 × 3 = $9."},
{q:"20 сигналов пропущены из-за ошибок исполнения. Что анализировать?",options:["Только бэктест","Журнал сигналов, пропусков и ошибок","Удалить пропуски"],answer:1,explain:"Операционные ошибки входят в реальную реализацию стратегии."},
{q:"30 сделок дали минус, правила соблюдались. Что делать?",options:["Удвоить риск","Сверить с протоколом и критериями выборки","Менять стопы задним числом"],answer:1,explain:"Решение принимают по заранее заданным критериям."},
{q:"Что доказывает успешный демо-форвард-тест?",options:["Гарантию прибыли","Будущую доходность","Только соблюдение протокола на этой выборке"],answer:2,explain:"Ни один тест не гарантирует будущий результат."}
];
let masterState={view:"list",id:null,answers:[],result:null,deadline:0,questions:[]},masterTimer=null;
function masterShuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function masterclassHTML(){
 if(typeof Access==="undefined"||!Access.isPremium())return '<div class="card"><span class="lesson-tag">BY MRASULV</span><h3>Личная мастерская создателя</h3><p>Два углублённых авторских модуля и итоговый экзамен повышенной сложности.</p><p class="muted">Доступ открывается после подтверждения Premium на сервере.</p><a class="primary" href="https://t.me/ArvexPremiumBot" data-premium-purchase style="display:block;text-align:center;text-decoration:none">Оформить Premium · 120 ⭐ / 30 дней</a></div>';
 if(masterState.view==="lesson"){const l=MASTER_LESSONS.find(x=>x.id===masterState.id);if(l)return '<button class="back-btn" data-master-act="back">← К мастерской</button><article class="lesson-view"><span class="lesson-tag">ЛИЧНЫЙ УРОК СОЗДАТЕЛЯ</span><h3>'+l.title+'</h3>'+l.body.map(p=>"<p>"+p+"</p>").join("")+'<div class="key-points"><b>Главное</b><ul>'+l.points.map(p=>"<li>"+p+"</li>").join("")+'</ul></div><button class="primary" data-master-act="quiz" data-master-id="'+l.id+'">Сложный тест · 5 вопросов</button></article>'}
 if(masterState.view==="quiz"||masterState.view==="final"){const qs=masterState.questions;if(masterState.result){const r=masterState.result;return '<button class="back-btn" data-master-act="back">← К мастерской</button><div class="card"><h3>'+ (masterState.view==="final"?"Итоговый экзамен":"Контрольный тест")+'</h3><div class="result '+(r.passed?"pass":"fail")+'">Результат: '+r.score+'/'+qs.length+'. '+(r.passed?"Зачёт получен.":"Не зачтено — изучи разбор и повтори.")+'</div>'+qs.map((q,i)=>'<div class="quiz-q"><b>'+(i+1)+'. '+q.q+'</b><p class="'+(masterState.answers[i]===q.answer?"pos":"neg")+'">Твой ответ: '+(q.options[masterState.answers[i]]||"Нет ответа")+'</p><small class="muted">Верно: '+q.options[q.answer]+'. '+q.explain+'</small></div>').join("")+'<button class="primary" data-master-act="'+(masterState.view==="final"?"final":"quiz")+'" '+(masterState.view==="quiz"?'data-master-id="'+masterState.id+'"':"")+' >Повторить испытание</button></div>'}
 return '<button class="back-btn" data-master-act="back">← К мастерской</button><div class="card"><div class="card-title">'+(masterState.view==="final"?"Итоговый экзамен · 12 вопросов":"Контрольный тест · 5 вопросов")+'</div><p class="muted">Время: '+(masterState.view==="final"?"15 минут":"8 минут")+'. Зачёт: '+(masterState.view==="final"?"10/12":"4/5")+'.</p><div id="masterTimer" class="badge">Таймер запущен</div>'+qs.map((q,i)=>'<fieldset class="quiz-q"><legend>'+(i+1)+'. '+q.q+'</legend>'+q.options.map((o,j)=>'<label class="opt"><input type="radio" name="master'+i+'" value="'+j+'" '+(masterState.answers[i]===j?"checked":"")+'><span>'+o+'</span></label>').join("")+'</fieldset>').join("")+'<button class="primary" data-master-act="submit">Завершить и проверить</button></div>';
 }
 return '<div class="card"><span class="lesson-tag">PERSONAL PROGRAM · BY MRASULV</span><h3>Личная мастерская создателя ARVEX</h3><p class="muted">Риск-менеджмент, проверка торгового преимущества и строгий экзаменационный протокол.</p></div>'+MASTER_LESSONS.map(l=>'<article class="card"><span class="lesson-tag">ADVANCED</span><h3>'+l.title+'</h3><p>'+l.summary+'</p><div class="meta"><span>4 главы</span><span>5 сложных вопросов</span></div><button class="primary" data-master-act="open" data-master-id="'+l.id+'">Изучить личный урок</button></article>').join("")+'<article class="card exam-card"><span class="lesson-tag">FINAL · PRO</span><h3>Закрытый экзамен создателя</h3><p>12 ситуационных задач и расчётов, 15 минут, проходной балл 10/12.</p><button class="primary" data-master-act="final">Начать финальный экзамен</button></article>';
}
function masterStart(kind,id){const l=MASTER_LESSONS.find(x=>x.id===id);masterState={view:kind==="final"?"final":"quiz",id:id||null,answers:[],result:null,deadline:Date.now()+(kind==="final"?900:480)*1000,questions:kind==="final"?masterShuffle(MASTER_FINAL):masterShuffle(l.quiz)};clearInterval(masterTimer);masterTimer=setInterval(()=>{const el=$("masterTimer"),left=Math.max(0,Math.ceil((masterState.deadline-Date.now())/1000));if(el)el.textContent="Осталось "+Math.floor(left/60)+":"+String(left%60).padStart(2,"0");if(left===0)masterSubmit()},500);renderSchool();window.scrollTo(0,0)}
function masterSubmit(){if(masterState.result)return;clearInterval(masterTimer);masterState.answers=masterState.questions.map((q,i)=>{const x=document.querySelector('input[name="master'+i+'"]:checked');return x?Number(x.value):null});const score=masterState.answers.filter((a,i)=>a===masterState.questions[i].answer).length;masterState.result={score,passed:score>=(masterState.view==="final"?10:4)};if(typeof showToast==="function")showToast(masterState.result.passed?"Испытание пройдено.":"Испытание не пройдено. Изучи разбор.");renderSchool();window.scrollTo(0,0)}
function masterAction(action,b){if(!Access.isPremium()){if(typeof showToast==="function")showToast("Для мастерской нужен активный Premium.");return}if(action==="back"){clearInterval(masterTimer);masterState={view:"list",id:null,answers:[],result:null,deadline:0,questions:[]}}else if(action==="open")masterState={view:"lesson",id:b.dataset.masterId,answers:[],result:null,deadline:0,questions:[]};else if(action==="quiz")masterStart("quiz",b.dataset.masterId);else if(action==="final")masterStart("final");else if(action==="submit")masterSubmit();renderSchool()}

/* ----- Словарь ----- */
function glossaryHTML(){
 return `<div class="card"><input id="glSearch" class="field" type="search" placeholder="Поиск термина…" autocomplete="off"><div class="muted" style="margin:10px 2px 0;font-size:13px">Терминов: ${GLOSSARY.length}</div><div id="glList">${glossaryList("")}</div></div>`;
}
function glossaryList(q){
 const s=q.trim().toLowerCase();
 const items=GLOSSARY.slice().sort((a,b)=>a.term.localeCompare(b.term,"ru")).filter(g=>!s||g.term.toLowerCase().includes(s)||g.def.toLowerCase().includes(s)||(g.alias||[]).some(a=>a.includes(s)));
 return items.length?items.map(g=>`<div class="gl-item"><b>${g.term}</b><p>${g.def}</p></div>`).join(""):`<div class="empty">Ничего не найдено.</div>`;
}

window.addEventListener("DOMContentLoaded",()=>{
 const body=$("schoolBody");if(!body)return;
 $("schoolSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b)return;schoolTab=b.dataset.tab;if(schoolTab==="masterclass"&&typeof Access!=="undefined")Access.refresh().finally(renderSchool);renderSchool()});
 body.addEventListener("click",e=>{
  const master=e.target.closest("[data-master-act]");if(master){masterAction(master.dataset.masterAct,master);return;}
  const b=e.target.closest("[data-act]");if(!b)return;
  const act=b.dataset.act;
  if(["start","menu","pick","next","prev","finish-exam"].includes(act))examAction(act,b);
  else lessonAction(act,Number(b.dataset.lesson)||null);
 });
 body.addEventListener("input",e=>{if(e.target.id==="glSearch")$("glList").innerHTML=glossaryList(e.target.value)});
});
