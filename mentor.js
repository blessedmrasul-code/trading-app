/* ARVEX MENTOR V4 — учебный маршрут по локальному прогрессу */
function mentorEscape(value){
 return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderMentorHTML(){
 const lessons=Array.isArray(LESSONS)?LESSONS:[];
 const p=progress||{}, pl=p.lessons||{}, pq=p.quizzes||{}, pe=p.exams||{};
 const total=lessons.length;
 const done=lessons.filter(l=>!!pl[l.id]).length;
 const tested=lessons.filter(l=>!!pq[l.id]).length;
 const exams=Object.values(pe);
 const passed=exams.filter(x=>x&&x.passed).length;
 const examTotal=typeof EXAMS!=="undefined"&&EXAMS?Object.keys(EXAMS).length:exams.length;
 const examRate=examTotal?Math.round(passed/examTotal*100):(passed?100:0);
 const completion=total?Math.round(done/total*100):0;
 const quizRate=total?Math.round(tested/total*100):0;
 const readiness=Math.round(completion*.4+quizRate*.4+examRate*.2);
 const next=lessons.find(l=>!pl[l.id]||!pq[l.id]);
 const isLesson=!!(next&&!pl[next.id]);
 const modules=[];
 lessons.forEach(l=>{
  const name=l.module||"Другие темы";
  let m=modules.find(x=>x.name===name);
  if(!m){m={name,items:[]};modules.push(m);}
  m.items.push(l);
 });
 const moduleHtml=modules.map(m=>{
  const d=m.items.filter(l=>pl[l.id]).length, q=m.items.filter(l=>pq[l.id]).length;
  const pct=m.items.length?Math.round(d/m.items.length*100):0;
  return '<div class="mentor-module"><div class="mentor-module-head"><b>'+mentorEscape(m.name)+'</b><span>'+d+'/'+m.items.length+' уроков · '+q+'/'+m.items.length+' тестов</span></div><div class="mentor-bar"><i style="width:'+pct+'%"></i></div></div>';
 }).join("");
 const nextHtml=next
  ? '<div class="mentor-next"><small>'+(isLesson?"РЕКОМЕНДУЕМЫЙ УРОК":"ТЕСТ ДЛЯ ЗАКРЕПЛЕНИЯ")+'</small><h3>'+mentorEscape(next.title)+'</h3><p>'+mentorEscape(next.summary||"Закрепи знания и проверь себя.")+'</p><button class="primary" data-act="'+(isLesson?"open":"quiz")+'" data-lesson="'+Number(next.id)+'">'+(isLesson?"Начать урок →":"Перейти к тесту →")+'</button></div>'
  : '<div class="mentor-next"><small>ОСНОВНАЯ ПРОГРАММА ЗАВЕРШЕНА</small><h3>Проверь знания на экзамене</h3><p>Все уроки и тесты пройдены. Следующий шаг — итоговая проверка знаний.</p><button class="primary" onclick="schoolTab=&quot;exam&quot;;renderSchool()">Открыть экзамены →</button></div>';
 const status=done===0?"Старт обучения":done===total?"Уроки завершены":done>=Math.ceil(total*.6)?"Хороший темп":"Формируем базу";
 return '<section class="mentor-hero"><div class="mentor-kicker">ARVEX · PERSONAL STUDY GUIDE</div><h2>Твой учебный маршрут</h2><p>Наставник отслеживает прогресс и помогает выбрать следующий шаг.</p><div class="mentor-progress"><div><b>'+done+'/'+total+'</b><span>уроки</span></div><div><b>'+tested+'/'+total+'</b><span>тесты</span></div><div><b>'+passed+'</b><span>экзамены сданы</span></div></div><div class="mentor-bar"><i style="width:'+completion+'%"></i></div><small>'+completion+'% уроков завершено · '+status+'</small></section>'
 +nextHtml
 +'<div class="card mentor-card"><div class="card-title">Прогресс по модулям</div>'+(moduleHtml||'<p class="muted">Уроки пока не загружены.</p>')+'</div>'
 +'<div class="card mentor-card"><div class="card-title">Готовность к проверке знаний</div><div class="mentor-score"><b>'+readiness+'%</b><span>учебная готовность</span></div><div class="mentor-bar"><i style="width:'+readiness+'%"></i></div><p>'+(done===total&&tested===total?"Все уроки и тесты пройдены — можно переходить к экзамену.":"Чтобы подготовиться, пройди уроки и успешно сдай тесты по ним.")+'</p><button class="ghost" onclick="schoolTab=&quot;exam&quot;;renderSchool()">Перейти к экзаменам</button><p class="note">Это условный показатель завершённости программы, а не оценка навыка торговли.</p></div>'
 +'<div class="card mentor-card"><div class="card-title">План следующего занятия</div><ol class="mentor-plan"><li>Изучи рекомендуемый урок и выпиши три главные мысли.</li><li>Пройди тест и прочитай объяснения ответов.</li><li>Открой демо-симулятор и потренируйся без спешки.</li><li>Запиши, что получилось и что осталось непонятным.</li></ol></div>'
 +'<div class="card mentor-card"><div class="card-title">Контроль перед виртуальной сделкой</div><ul class="mentor-check"><li>Я могу объяснить причину входа.</li><li>Я заранее определил уровень отмены идеи.</li><li>Я понимаю размер возможного убытка.</li><li>Я не вхожу из-за страха упустить движение.</li></ul><p class="note">Используй этот список в учебном симуляторе. Это не торговый сигнал.</p></div>'
 +'<div class="mentor-disclaimer">Наставник работает локально по данным прогресса ARVEX. Это не подключённая нейросеть, не анализ рынка в реальном времени и не персональная финансовая рекомендация.</div>';
}