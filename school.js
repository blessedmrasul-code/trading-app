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
  ["Сдать экзамен новичка",!!progress.exams.novice?.passed]
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
 $("schoolSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b)return;schoolTab=b.dataset.tab;renderSchool()});
 body.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const act=b.dataset.act;
  if(["start","menu","pick","next","prev","finish-exam"].includes(act))examAction(act,b);
  else lessonAction(act,Number(b.dataset.lesson)||null);
 });
 body.addEventListener("input",e=>{if(e.target.id==="glSearch")$("glList").innerHTML=glossaryList(e.target.value)});
});
