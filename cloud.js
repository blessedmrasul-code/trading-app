/* ARVEX Cloud: вход по email/паролю и синхронизация прогресса через Supabase (REST).
   Пароль нигде не хранится — только токены сессии. Без настроек работает офлайн. */
const Cloud=(()=>{
 const cfg=()=>window.ARVEX_CLOUD||{};
 const SK="arvex_cloud_session";
 let session=null,timer=null,busy=false,status="",profileDataLoading=false,profileDataLoadedAt=0;
 try{session=JSON.parse(localStorage.getItem(SK)||"null")}catch(e){}
 const enabled=()=>!!(cfg().url&&cfg().anonKey);
 const keep=s=>{session=s;try{s?localStorage.setItem(SK,JSON.stringify(s)):localStorage.removeItem(SK)}catch(e){}};
 const hdr=(tok)=>({"apikey":cfg().anonKey,"Authorization":"Bearer "+(tok||cfg().anonKey),"Content-Type":"application/json"});
 async function req(path,opt){
  const r=await fetch(cfg().url.replace(/\/$/,"")+path,opt);
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const err=new Error((j&&(j.msg||j.error_description||j.message||j.error))||("HTTP "+r.status));err.status=r.status;err.code=j&&j.code;err.details=j&&j.details;err.hint=j&&j.hint;throw err}
  return j;
 }
 function adopt(j){
  if(!j||!j.access_token)return false;
  keep({access:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-60000,email:(j.user&&j.user.email)||(session&&session.email)||"",uid:(j.user&&j.user.id)||(session&&session.uid)||""});
  return true;
 }
 async function token(){
  if(!session)throw new Error("Нет входа");
  if(Date.now()>session.exp){
   try{const j=await req("/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:hdr(),body:JSON.stringify({refresh_token:session.refresh})});adopt(j)}
   catch(e){keep(null);throw new Error("Сессия истекла, войди снова")}
  }
  return session.access;
 }
 async function signUp(email,pw){
  // Не задаём redirect_to: Supabase использует Site URL проекта.
  // После подтверждения пользователь может вернуться в ARVEX и нажать «Войти».
  const j=await req("/auth/v1/signup",{method:"POST",headers:hdr(),body:JSON.stringify({email,password:pw})});
  if(adopt(j))return {ok:true};
  return {ok:false,confirm:true}; // включено подтверждение почты
 }
 async function signIn(email,pw){
  const j=await req("/auth/v1/token?grant_type=password",{method:"POST",headers:hdr(),body:JSON.stringify({email,password:pw})});
  adopt(j);return {ok:true};
 }

 async function requestPasswordReset(email){
  const clean=String(email||"").trim();
  if(!/^\S+@\S+\.\S+$/.test(clean))throw new Error("Проверь адрес электронной почты.");
  const redirectTo=location.origin+location.pathname+"?auth=recovery";
  await req("/auth/v1/recover?redirect_to="+encodeURIComponent(redirectTo),{method:"POST",headers:hdr(),body:JSON.stringify({email:clean})});
  return true;
 }
 async function updatePassword(password){
  if(!password||password.length<8)throw new Error("Пароль должен содержать минимум 8 символов.");
  const tok=await token();
  const j=await req("/auth/v1/user",{method:"PUT",headers:hdr(tok),body:JSON.stringify({password})});
  return j;
 }
 function recoverySessionFromUrl(){
  const params=new URLSearchParams(location.hash.replace(/^#/,""));
  if(params.get("type")!=="recovery"||!params.get("access_token"))return false;
  const access=params.get("access_token"),refresh=params.get("refresh_token")||"";
  keep({access,refresh,exp:Date.now()+Math.max(60,Number(params.get("expires_in"))||3600)*1000-60000,email:"",uid:""});
  history.replaceState(null,"",location.pathname+location.search);
  return true;
 }
 function recoveryHTML(){
  return '<div class="card" id="arvexRecoveryCard"><div class="card-title">Новый пароль</div><p class="muted">Ссылка подтверждена. Придумай новый пароль для ARVEX.</p><input class="field" id="arvexNewPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Новый пароль (от 8 символов)"><input class="field" id="arvexNewPassword2" type="password" minlength="8" autocomplete="new-password" placeholder="Повтори новый пароль" style="margin-top:8px"><button class="primary" id="arvexSavePassword" style="margin-top:10px">Сохранить пароль</button><p class="muted" id="arvexRecoveryMsg" aria-live="polite"></p></div>';
 }
 async function changeSignedInPassword(){
  const p=document.getElementById("arvexChangePasswordInput"),m=document.getElementById("arvexChangePasswordMsg"),b=document.getElementById("arvexChangePassword");
  if(!p||!m)return;
  if((p.value||"").length<8){m.textContent="Пароль должен содержать минимум 8 символов.";return}
  if(b)b.disabled=true;m.textContent="Сохраняем…";
  try{await updatePassword(p.value);p.value="";m.textContent="Пароль успешно изменён.";showToast("Пароль изменён")}
  catch(e){m.textContent="Не удалось изменить пароль: "+e.message}
  finally{if(b)b.disabled=false}
 }
 async function saveRecoveryPassword(){
  const p=document.getElementById("arvexNewPassword"),p2=document.getElementById("arvexNewPassword2"),m=document.getElementById("arvexRecoveryMsg"),b=document.getElementById("arvexSavePassword");
  if(!p||!p2||!m)return;
  if((p.value||"").length<8){m.textContent="Пароль должен содержать минимум 8 символов.";return}
  if(p.value!==p2.value){m.textContent="Пароли не совпадают.";return}
  b.disabled=true;m.textContent="Сохраняем…";
  try{await updatePassword(p.value);m.textContent="Пароль изменён. Теперь можно войти в ARVEX.";p.value="";p2.value="";showToast("Пароль успешно изменён")}
  catch(e){m.textContent="Не удалось изменить пароль: "+e.message}
  finally{b.disabled=false}
 }
 function signOut(){keep(null);status="";if(typeof Access!=="undefined")Access.refresh()}
 async function pull(){
  const tok=await token();
  const rows=await req(`/rest/v1/arvex_saves?user_id=eq.${session.uid}&select=data,updated_at`,{headers:hdr(tok)});
  return rows&&rows[0]?rows[0]:null;
 }
 async function push(raw){
  const tok=await token();
  await req("/rest/v1/arvex_saves?on_conflict=user_id",{method:"POST",headers:{...hdr(tok),"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:session.uid,data:JSON.parse(raw),updated_at:new Date().toISOString()})});
 }
 // Двусторонняя синхронизация: побеждает более свежее состояние (поле updatedAt).
 async function sync(){
  if(!enabled()||!session||busy)return;
  busy=true;
  try{
   const row=await pull(),raw=localStorage.getItem(STORAGE_KEY);
   const local=raw?JSON.parse(raw):null,lt=(local&&local.updatedAt)||0,ct=row&&row.data&&row.data.updatedAt||0;
   const fresh=!local||(!(local.history||[]).length&&!(local.positions||[]).length&&!local.xp&&(local.level||1)<=1&&!Object.keys((local.progress&&local.progress.lessons)||{}).length&&!Object.keys((local.progress&&local.progress.exams)||{}).length);
   if(row&&(ct>lt||fresh)){localStorage.setItem(STORAGE_KEY,JSON.stringify(row.data));loadState();rerender();status="Загружено из облака"}
   else if(raw){await push(raw);status="Сохранено в облако"}
   if(typeof Access!=="undefined")Access.refresh();
   status+=" · "+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  }catch(e){status="Ошибка синхронизации: "+e.message}
  busy=false;if(typeof activeScreen!=="undefined"&&activeScreen==="profile")renderProfile();
 }
 function rerender(){renderTop();renderTicker();renderHead();renderPositions();renderPortfolio();if(typeof renderSchool==="function")renderSchool();if(activeScreen==="profile")renderProfile()}
 function schedule(){if(!enabled()||!session)return;clearTimeout(timer);timer=setTimeout(sync,4000)}
 function accountHTML(){
  if(!enabled())return `<p class="muted" style="margin:0">Сейчас профиль хранится на этом устройстве.</p><div class="soon">🔒 Облачные аккаунты подключаются владельцем проекта (см. README → «Облако»).</div>`;
  if(session)return `<p style="margin:0 0 8px">Вход выполнен: <b>${esc(session.email)}</b></p><p class="muted" style="margin:0 0 10px">${esc(status||"Прогресс синхронизируется автоматически.")}</p><div class="btn-row"><button class="ghost" id="cloudSync">↻ Синхронизировать</button><button class="danger" id="cloudOut">Выйти</button></div>`;
  return `<p class="muted" style="margin:0 0 10px">Войди, чтобы сохранить прогресс в облаке и открыть его на другом устройстве.</p><input class="field" id="cEmail" type="email" placeholder="Email" autocomplete="email"><input class="field" id="cPass" type="password" placeholder="Пароль (от 8 символов)" autocomplete="current-password" style="margin-top:8px"><div class="btn-row" style="margin-top:10px"><button class="primary" id="cloudIn">Войти</button><button class="ghost" id="cloudUp">Регистрация</button></div><button class="ghost" type="button" id="cloudForgot" style="margin-top:8px">Забыли пароль?</button><p class="muted" id="cloudMsg" style="margin:8px 0 0"></p>`;
 }
 async function form(kind){
  const e=($("cEmail").value||"").trim(),p=$("cPass").value||"",m=$("cloudMsg");
  if(!/^\S+@\S+\.\S+$/.test(e)){m.textContent="Проверь email.";return}
  if(p.length<8){m.textContent="Пароль — минимум 8 символов.";return}
  m.textContent="Подождите…";
  try{
   if(kind==="up"){const r=await signUp(e,p);if(r.confirm){m.textContent="Письмо отправлено. Подтверди почту и нажми «Войти».";return}}
   else await signIn(e,p);
   showToast("Вход выполнен");await sync();
  }catch(err){m.textContent=err.message}
 }
 function click(t){
  if(t.closest("#cloudIn")){form("in");return true}
  if(t.closest("#cloudUp")){form("up");return true}
  if(t.closest("#cloudForgot")){requestPasswordReset(document.getElementById("cEmail")?.value).then(()=>{const m=document.getElementById("cloudMsg");if(m)m.textContent="Если аккаунт существует, письмо со ссылкой отправлено."}).catch(e=>{const m=document.getElementById("cloudMsg");if(m)m.textContent=e.message});return true}
  if(t.closest("#arvexSavePassword")){saveRecoveryPassword();return true}
  if(t.closest("#arvexChangePassword")){changeSignedInPassword();return true}
  if(t.closest("#cloudSync")){sync();return true}
  if(t.closest("#cloudOut")){signOut();renderProfile();return true}
  if(t.closest("#arvexPromoApply")){const m=document.getElementById("arvexPromoMsg");m.textContent="Проверяю…";redeemPromo(document.getElementById("arvexPromoCode").value).then(()=>{m.textContent="Промокод активирован!";if(typeof renderProfile==="function")renderProfile()}).catch(e=>m.textContent=e.message);return true}
  if(t.closest("#arvexPaymentsLoad")){loadPayments();return true}
  if(t.closest("#arvexNotificationsLoad")){loadNotifications();return true}
  if(t.closest("#arvexAdminPromoCreate")){createAdminPromo();return true}
  if(t.closest("#arvexAdminPromoRefresh")){loadAdminPromos();return true}
  if(t.closest("#arvexAdminSupportRefresh")){loadAdminSupport();return true}
  const supportUpdate=t.closest("[data-support-update]");
  if(supportUpdate){const row=supportUpdate.closest("[data-support-row]"),select=row&&row.querySelector("select");if(select)updateSupportStatus(supportUpdate.dataset.supportUpdate,select.value);return true}
  return false;
 }
async function insertOrder(o){
  const tok=session?await token():cfg().anonKey;
  const body={...o};if(session)body.user_id=session.uid;
  await req("/rest/v1/orders",{method:"POST",headers:{...hdr(tok),"Prefer":"return=minimal"},body:JSON.stringify(body)});return true;
 }
 async function createStarsInvoice(){
  if(!enabled()||!session)throw new Error("Сначала войди в аккаунт ARVEX.");
  const tok=await token();
  const r=await fetch(cfg().url.replace(/\/$/,"")+"/functions/v1/create-stars-invoice",{
   method:"POST",headers:hdr(tok),body:"{}"
  });
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.error)||("HTTP "+r.status));
  return j||{};
 }
 async function createStarsBotLink(){
  if(!enabled()||!session)throw new Error("Сначала войди в аккаунт ARVEX.");
  const tok=await token();
  const r=await fetch(cfg().url.replace(/\/$/,"")+"/functions/v1/create-stars-bot-link",{
   method:"POST",headers:hdr(tok),body:"{}"
  });
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.error)||("HTTP "+r.status));
  if(!j||!j.url)throw new Error("Не удалось подготовить переход к оплате.");
  return j;
 }
 async function setStarsAutoRenew(enabled){
  if(!session)throw new Error("Сначала войди в аккаунт ARVEX.");
  const tok=await token();
  const r=await fetch(cfg().url.replace(/\/$/,"")+"/functions/v1/cancel-stars-subscription",{
   method:"POST",headers:hdr(tok),body:JSON.stringify({enabled:!!enabled})
  });
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.error)||("HTTP "+r.status));
  return j||{};
 }
 async function myEntitlement(){
  const tok=await token();
  const rows=await req(`/rest/v1/arvex_subscriptions?user_id=eq.${session.uid}&select=is_forever,expires_at,auto_renew`,{headers:hdr(tok)});
  return rows&&rows[0]?{plan:rows[0].is_forever?"lifetime":"monthly",expires_at:rows[0].expires_at,auto_renew:rows[0].auto_renew}:null;
 }

 async function redeemPromo(code){
  const tok=await token();
  const rows=await req("/rest/v1/rpc/arvex_redeem_promo",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_code:String(code||"").trim()})});
  if(typeof Access!=="undefined")await Access.refresh();
  return rows;
 }
 async function paymentHistory(){
  const tok=await token();
  return await req("/rest/v1/telegram_star_payments?select=stars_amount,currency,is_recurring,expires_at,refunded_at,created_at&user_id=eq."+encodeURIComponent(session.uid)+"&order=created_at.desc&limit=30",{headers:hdr(tok)});
 }
 async function supportTickets(){
  const tok=await token();
  return await req("/rest/v1/arvex_support_tickets?select=id,subject,message,status,created_at&user_id=eq."+encodeURIComponent(session.uid)+"&order=created_at.desc&limit=20",{headers:hdr(tok)});
 }
 async function createSupport(subject,message){
  if(!session||!session.uid)throw new Error("Войди в аккаунт ARVEX и попробуй ещё раз.");
  const cleanSubject=String(subject||"").trim(),cleanMessage=String(message||"").trim();
  if(cleanSubject.length<3||cleanSubject.length>120)throw new Error("Тема должна содержать от 3 до 120 символов.");
  if(cleanMessage.length<10||cleanMessage.length>4000)throw new Error("Сообщение должно содержать от 10 до 4000 символов.");
  const tok=await token();
  const rows=await req("/rest/v1/arvex_support_tickets?select=id,created_at,status",{method:"POST",headers:{...hdr(tok),"Prefer":"return=representation"},body:JSON.stringify({user_id:session.uid,subject:cleanSubject,message:cleanMessage})});
  if(!Array.isArray(rows)||!rows[0]||!rows[0].id)throw new Error("Сервер не подтвердил сохранение обращения. Попробуй ещё раз или напиши @mrasulv.");
  return rows[0];
 }
 async function submitSupportForm(form){
  const subject=form.querySelector("#arvexSupportSubject"),message=form.querySelector("#arvexSupportMessage"),status=form.querySelector("#arvexSupportMsg"),button=form.querySelector("#arvexSupportSend");
  const s=subject?subject.value:"",m=message?message.value:"";
  if(s.trim().length<3){if(status)status.textContent="Тема должна содержать минимум 3 символа.";if(subject)subject.focus();return}
  if(m.trim().length<10){if(status)status.textContent="Сообщение должно содержать минимум 10 видимых символов.";if(message)message.focus();return}
  if(button){button.disabled=true;button.textContent="Отправляем…"}
  if(status)status.textContent="Отправляем обращение в поддержку…";
  try{
   const ticket=await createSupport(s,m);
   if(subject)subject.value="";
   if(message)message.value="";
   if(status)status.textContent="✓ Обращение №"+ticket.id.slice(0,8)+" отправлено. Мы увидим его в панели поддержки.";
   await loadSupport();
  }catch(e){
   const extra=e.details?(" "+e.details):"";
   if(status)status.textContent="Не удалось отправить ("+(e.status||"сеть") + "): "+e.message+extra+" Напиши напрямую @mrasulv, если ошибка повторится.";
  }finally{
   if(button){button.disabled=false;button.textContent="Отправить обращение"}
  }
 }
 async function adminStatus(){
  const tok=await token();
  return (await req("/rest/v1/rpc/arvex_admin_is_admin",{method:"POST",headers:hdr(tok),body:"{}"}))===true;
 }
 async function loadAdminSupport(){
  const box=document.getElementById("arvexAdminSupportList");if(!box)return;
  box.textContent="Загрузка обращений…";
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_admin_list_support_tickets",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_limit:50})});
   box.textContent="";
   if(!Array.isArray(rows)||!rows.length){box.textContent="Обращений пока нет.";return}
   rows.forEach(ticket=>{
    const card=document.createElement("div");card.className="res-link";card.dataset.supportRow="1";
    const head=document.createElement("b");head.textContent=(ticket.subject||"Без темы")+" · "+(ticket.user_email||"аккаунт");card.appendChild(head);
    const body=document.createElement("span");body.textContent=(ticket.message||"")+" · "+new Date(ticket.created_at).toLocaleString("ru-RU");card.appendChild(body);
    const controls=document.createElement("div");controls.className="btn-row";controls.style.marginTop="8px";
    const select=document.createElement("select");select.className="field";
    [["open","Открыто"],["in_progress","В работе"],["closed","Закрыто"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;select.appendChild(option)});
    select.value=ticket.status||"open";
    const save=document.createElement("button");save.className="ghost";save.type="button";save.dataset.supportUpdate=ticket.ticket_id;save.textContent="Сохранить статус";
    controls.append(select,save);card.appendChild(controls);box.appendChild(card);
   });
  }catch(e){box.textContent="Не удалось загрузить обращения: "+e.message}
 }
 async function updateSupportStatus(ticketId,status){
  const box=document.getElementById("arvexAdminSupportList");
  try{
   const tok=await token();await req("/rest/v1/rpc/arvex_admin_set_support_status",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_ticket_id:ticketId,p_status:status})});
   showToast("Статус обращения обновлён");await loadAdminSupport();
  }catch(e){if(box)box.textContent="Не удалось обновить статус: "+e.message}
 }
 async function loadAdminPromos(){
  const box=document.getElementById("arvexAdminPromoList");if(!box)return;
  try{const tok=await token();const rows=await req("/rest/v1/rpc/arvex_admin_list_promos",{method:"POST",headers:hdr(tok),body:"{}"});
   box.textContent="";
   if(!rows.length){box.textContent="Промокодов пока нет.";return}
   rows.forEach(p=>{const el=document.createElement("p");el.textContent=p.code+" — "+p.days+" дн. · "+p.redeemed_count+"/"+p.max_redemptions+" · "+(p.active?"активен":"выключен");box.appendChild(el)});
  }catch(e){box.textContent=e.message}
 }
 async function createAdminPromo(){
  const code=document.getElementById("arvexAdminCode"),days=document.getElementById("arvexAdminDays"),limit=document.getElementById("arvexAdminLimit"),msg=document.getElementById("arvexAdminPromoMsg");
  msg.textContent="Создаю…";
  try{const tok=await token();await req("/rest/v1/rpc/arvex_admin_create_promo",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_code:code.value,p_days:Number(days.value),p_max_redemptions:Number(limit.value),p_expires_at:null})});msg.textContent="Промокод создан.";code.value="";await loadAdminPromos()}catch(e){msg.textContent=e.message}
 }
 async function loadAdminTools(){
  if(!session)return;
  try{if(await adminStatus()){const box=document.getElementById("arvexAdminTools");if(box){box.classList.remove("hidden");await Promise.all([loadAdminPromos(),loadAdminSupport()])}}}catch(e){}
 }
 async function loadProfileData(force=false){
  if(!session||profileDataLoading||(!force&&Date.now()-profileDataLoadedAt<15000))return;
  profileDataLoading=true;
  try{await Promise.all([loadSupport(),loadNotifications(),loadAdminTools()]);profileDataLoadedAt=Date.now()}
  finally{profileDataLoading=false}
 }
 function userToolsHTML(){
  if(!enabled())return "";
  const currentLanguage=localStorage.getItem("arvex_language")==="en"?"en":"ru";
  const settings=`<div class="card"><div class="card-title">Настройки</div><label class="lbl" for="arvexLanguage">Язык интерфейса</label><select class="field" id="arvexLanguage"><option value="ru" ${currentLanguage==="ru"?"selected":""}>🇷🇺 Русский</option><option value="en" ${currentLanguage==="en"?"selected":""}>🇬🇧 English</option></select><p class="muted">Язык сохраняется на этом устройстве.</p></div>`;
  if(!session)return settings+'<div class="card"><div class="card-title">Сервисы аккаунта</div><p class="muted">Войди в аккаунт, чтобы использовать промокоды, смотреть платежи и обращаться в поддержку.</p></div>';
  return settings+'<div class="card"><div class="card-title">Смена пароля</div><input class="field" id="arvexChangePasswordInput" type="password" minlength="8" autocomplete="new-password" placeholder="Новый пароль (от 8 символов)"><button class="ghost" id="arvexChangePassword" type="button" style="margin-top:8px">Изменить пароль</button><p class="muted" id="arvexChangePasswordMsg"></p></div><div class="card"><div class="card-title">Промокод</div><div class="btn-row"><input class="field" id="arvexPromoCode" maxlength="32" placeholder="Введи промокод"><button class="primary" id="arvexPromoApply">Активировать</button></div><p class="muted" id="arvexPromoMsg"></p></div>'+
   '<div class="card"><div class="card-title">История платежей</div><button class="ghost" id="arvexPaymentsLoad">Показать платежи</button><div id="arvexPaymentsList"></div></div>'+
   '<div class="card"><div class="card-title">Поддержка ARVEX</div><p class="muted">Опиши вопрос — обращение сохранится в аккаунте и появится в панели администратора. Если срочно, <a href="https://t.me/mrasulv" target="_blank" rel="noopener" style="color:var(--purple2)">@mrasulv</a>.</p><form id="arvexSupportForm" novalidate><label class="lbl" for="arvexSupportSubject">Тема обращения</label><input class="field" id="arvexSupportSubject" name="subject" maxlength="120" required placeholder="Например: проблема с подпиской"><label class="lbl" for="arvexSupportMessage">Сообщение</label><textarea class="field" id="arvexSupportMessage" name="message" minlength="10" maxlength="4000" rows="5" required placeholder="Опиши проблему подробно (минимум 10 символов)" style="margin-top:4px"></textarea><button class="primary" type="submit" id="arvexSupportSend" style="margin-top:8px">Отправить обращение</button><p class="muted" id="arvexSupportMsg" aria-live="polite" role="status"></p></form><div id="arvexSupportList"></div></div>'+
   '<div class="card hidden" id="arvexAdminTools"><div class="card-title">Управление промокодами</div><input class="field" id="arvexAdminCode" maxlength="32" placeholder="Код, например START30"><div class="btn-row"><select class="field" id="arvexAdminDays"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option><option value="365">365 дней</option></select><input class="field" id="arvexAdminLimit" type="number" min="1" max="10000" value="1" placeholder="Лимит"></div><button class="primary" id="arvexAdminPromoCreate">Создать промокод</button><p id="arvexAdminPromoMsg" class="muted"></p><div id="arvexAdminPromoList"></div><button class="ghost" id="arvexAdminPromoRefresh">Обновить список</button><div style="height:1px;background:var(--border);margin:16px 0"></div><div class="card-title">Обращения пользователей</div><button class="ghost" type="button" id="arvexAdminSupportRefresh">Обновить обращения</button><div id="arvexAdminSupportList"></div></div>'+
   '<div class="card"><div class="card-title">Уведомления</div><button class="ghost" id="arvexNotificationsLoad">Проверить уведомления</button><div id="arvexNotificationsList"></div></div>';
 }
 async function loadPayments(){
  const box=document.getElementById("arvexPaymentsList");if(!box)return;
  box.textContent="Загрузка…";
  try{const rows=await paymentHistory();box.innerHTML=rows.length?rows.map(x=>'<div class="res-link"><b>'+Number(x.stars_amount)+' ⭐ · '+(x.refunded_at?'Возврат':'Оплачено')+'</b><span>'+new Date(x.created_at).toLocaleString("ru-RU")+(x.expires_at?' · до '+new Date(x.expires_at).toLocaleDateString("ru-RU"):'')+'</span></div>').join(""):'<p class="muted">Платежей пока нет.</p>'}
  catch(e){box.textContent="Не удалось загрузить историю: "+e.message}
 }
 async function loadSupport(){
  const box=document.getElementById("arvexSupportList");if(!box)return;
  box.textContent="Загрузка…";
  try{const rows=await supportTickets();box.innerHTML=rows.length?rows.map(x=>'<div class="res-link"><b>'+esc(x.subject)+' · '+({open:"Открыто",in_progress:"В работе",closed:"Закрыто"}[x.status]||x.status)+'</b><span>'+esc(x.message)+' · '+new Date(x.created_at).toLocaleString("ru-RU")+'</span></div>').join(""):'<p class="muted">Обращений пока нет.</p>'}
  catch(e){box.textContent="Не удалось загрузить обращения: "+e.message}
 }
 async function loadNotifications(){
  const box=document.getElementById("arvexNotificationsList");if(!box)return;
  box.textContent="Загрузка…";
  try{const tok=await token(),rows=await req("/rest/v1/arvex_notifications?select=id,title,body,kind,created_at,read_at&user_id=eq."+encodeURIComponent(session.uid)+"&order=created_at.desc&limit=30",{headers:hdr(tok)});
   box.innerHTML=rows.length?rows.map(x=>'<div class="res-link"><b>'+esc(x.title)+'</b><span>'+esc(x.body)+' · '+new Date(x.created_at).toLocaleString("ru-RU")+(x.read_at?' · Прочитано':'')+'</span></div>').join(""):'<p class="muted">Новых уведомлений нет.</p>';
   const unread=rows.filter(x=>!x.read_at).map(x=>x.id);if(unread.length){await req("/rest/v1/arvex_notifications?id=in.("+unread.join(",")+")",{method:"PATCH",headers:{...hdr(tok),"Prefer":"return=minimal"},body:JSON.stringify({read_at:new Date().toISOString()})})}
  }catch(e){box.textContent="Не удалось загрузить уведомления: "+e.message}
 }

 document.addEventListener("submit",e=>{const form=e.target;if(!form||form.id!=="arvexSupportForm")return;e.preventDefault();submitSupportForm(form)});
 document.addEventListener("change",e=>{if(e.target&&e.target.id==="arvexLanguage"){localStorage.setItem("arvex_language",e.target.value);applyLanguage(e.target.value)}});
 function applyLanguage(lang){
  const en=lang==="en";
  const dict={
   "Торговля":"Trading","Портфель":"Portfolio","Школа":"Academy","Инструменты":"Tools","Профиль":"Profile","Счёт":"Balance",
   "Настройки":"Settings","Язык интерфейса":"Interface language","Сервисы аккаунта":"Account services","Войти":"Sign in","Регистрация":"Create account","Забыли пароль?":"Forgot password?",
   "Смена пароля":"Change password","Изменить пароль":"Change password","Новый пароль (от 8 символов)":"New password (8+ characters)","Сохранить пароль":"Save password",
   "История платежей":"Payment history","Поддержка ARVEX":"ARVEX Support","Уведомления":"Notifications","Промокод":"Promo code","Активировать":"Activate",
   "Добро пожаловать":"Welcome","Новая сделка":"New trade","Только виртуальные средства":"Virtual funds only","Маржа (своя сумма)":"Margin (custom amount)",
   "Плечо":"Leverage","Тейк-профит, %":"Take profit, %","Стоп-лосс, %":"Stop loss, %","Доступно":"Available","Размер позиции":"Position size",
   "Ликвидация LONG":"LONG liquidation","Ликвидация SHORT":"SHORT liquidation","Открытые позиции":"Open positions","История сделок":"Trade history",
   "Школа ARVEX":"ARVEX Academy","Уроки":"Lessons","Экзамен":"Exam","Словарь":"Glossary","Калькулятор":"Calculator","Помощник":"Assistant",
   "Аккаунт":"Account","Редактировать":"Edit","Сбросить демо-счёт":"Reset demo balance","Обучающий тур":"Guided tour","Результат":"Result",
   "Лучшая сделка":"Best trade","Уроков":"Lessons","Экзаменов сдано":"Exams passed","Достижения":"Achievements","Создать профиль":"Create profile",
   "Добро пожаловать в ARVEX":"Welcome to ARVEX","Аватар":"Avatar","Имя":"Name","Отмена":"Cancel","Сохранить":"Save",
   "Убрать фото":"Remove photo","Выбери картинку.":"Choose an image.","Не удалось открыть фото.":"Could not open the photo.",
   "Введи имя.":"Enter a name.","Профиль обновлён.":"Profile updated.","Цена входа":"Entry price","Маржа":"Margin","Размер позиции":"Position size",
   "Ликвидация":"Liquidation","Тейк-профит":"Take profit","Стоп-лосс":"Stop loss","Открыть":"Open","Закрыть":"Close",
   "Отмена":"Cancel","Сбросить":"Reset","Нет открытых позиций.":"No open positions.","История пуста. Закрытые сделки появятся здесь.":"History is empty. Closed trades will appear here.",
   "Выбери направление и открой первую демо-сделку.":"Choose a direction and open your first demo trade.","Капитал":"Equity","Свободно":"Available",
   "Закрытый результат":"Realized P&L","Открытый результат":"Unrealized P&L","Сделок":"Trades","Винрейт":"Win rate",
   "Проверь email.":"Check your email address.","Отправляю…":"Sending…","Сохраняем…":"Saving…","Пароли не совпадают.":"Passwords do not match.",
   "Пароль должен содержать минимум 8 символов.":"Password must contain at least 8 characters.",
   "Пароль успешно изменён.":"Password changed successfully.","Пароль изменён. Теперь можно войти в ARVEX.":"Password changed. You can now sign in to ARVEX.",
   "Если аккаунт существует, письмо со ссылкой отправлено.":"If an account exists, a recovery link has been sent.",
   "Не удалось изменить пароль:":"Could not change password:","Новый пароль":"New password","Повтори новый пароль":"Repeat new password","Ссылка подтверждена. Придумай новый пароль для ARVEX.":"Link verified. Create a new password for ARVEX.",
   "Язык сохраняется на этом устройстве.":"Language is saved on this device.","🇷🇺 Русский":"🇷🇺 Russian","🇬🇧 English":"🇬🇧 English"
  };
  document.documentElement.lang=en?"en":"ru";
  const translateNode=node=>{
   if(node.nodeType===Node.TEXT_NODE){
    const parent=node.parentElement;
    if(!parent||/^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/i.test(parent.tagName))return;
    const raw=node.nodeValue;
    const key=(node.__arvexRuText||(node.__arvexRuText=raw)).trim();
    if(!key)return;
    const value=en?(dict[key]||key):key;
    if(raw.trim()!==value)node.nodeValue=raw.replace(key,value);
   }else if(node.nodeType===Node.ELEMENT_NODE){
    if(node.matches("input,textarea")){
     const ph=node.getAttribute("placeholder");
     if(ph){const key=node.dataset.arvexRuPlaceholder||(node.dataset.arvexRuPlaceholder=ph);node.setAttribute("placeholder",en?(dict[key]||key):key)}
    }
    ["title","aria-label"].forEach(attr=>{const val=node.getAttribute(attr);if(val){const key=node.dataset["arvexRu"+attr.replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]||(node.dataset["arvexRu"+attr.replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=val);node.setAttribute(attr,en?(dict[key]||key):key)}});
    if(node.childNodes)Array.from(node.childNodes).forEach(translateNode);
   }
  };
  translateNode(document.body);
  const select=document.getElementById("arvexLanguage");if(select)select.value=en?"en":"ru";
  if(!window.__arvexLanguageObserver){
   window.__arvexLanguageObserver=new MutationObserver(records=>{if(localStorage.getItem("arvex_language")==="en")records.forEach(r=>{r.type==="childList"?r.addedNodes.forEach(translateNode):r.type==="characterData"&&translateNode(r.target)})});
   window.__arvexLanguageObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
  }
 }
 function initLanguage(){const lang=localStorage.getItem("arvex_language")==="en"?"en":"ru";applyLanguage(lang)}
 document.addEventListener("DOMContentLoaded",initLanguage);
 if(recoverySessionFromUrl()){document.addEventListener("DOMContentLoaded",()=>{if(typeof go==="function")go("profile");const box=document.getElementById("profileBody");if(box)box.insertAdjacentHTML("afterbegin",recoveryHTML());});}


 return {insertOrder,myEntitlement,createStarsInvoice,createStarsBotLink,setStarsAutoRenew,createSupport,enabled,accountHTML,userToolsHTML,loadProfileData,click,schedule,sync,isIn:()=>!!session};
})();

// Netlify production redeploy trigger: email confirmation redirects to the public site.
