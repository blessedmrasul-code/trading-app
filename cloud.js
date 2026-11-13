/* ARVEX Cloud: вход по email/паролю и синхронизация прогресса через Supabase (REST).
   Пароль нигде не хранится — только токены сессии. Без настроек работает офлайн. */
const Cloud=(()=>{
 const cfg=()=>window.ARVEX_CLOUD||{};
 const SK="arvex_cloud_session";
 const GOOGLE_REDIRECT="app.arvex.trading://auth/callback";
 let session=null,timer=null,busy=false,status="",profileDataLoading=false,profileDataLoadedAt=0;
 try{session=JSON.parse(localStorage.getItem(SK)||"null")}catch(e){}
 let recoveryMode=false;
 try{
  const hp=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  if(hp.get("type")==="recovery"&&hp.get("access_token")){
   adopt({access_token:hp.get("access_token"),refresh_token:hp.get("refresh_token")||"",expires_in:Number(hp.get("expires_in"))||3600});
   recoveryMode=true;
   history.replaceState(null,"",location.pathname+location.search);
  }
 }catch(e){}
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
 async function resetPassword(email){
  const e=String(email||"").trim();if(!/^\S+@\S+\.\S+$/.test(e))throw new Error("Укажи корректный email.");
  await req("/auth/v1/recover",{method:"POST",headers:hdr(),body:JSON.stringify({email:e})});
  return true;
 }
 async function updatePassword(password){
  if(!session)throw new Error("Сначала войди в аккаунт.");
  if(String(password||"").length<8)throw new Error("Пароль должен содержать минимум 8 символов.");
  const tok=await token();
  await req("/auth/v1/user",{method:"PUT",headers:hdr(tok),body:JSON.stringify({password:String(password)})});
  return true;
 }
 function changePasswordPrompt(){
  if(typeof openSheet==="function")openSheet('<h3>Изменить пароль</h3><p class="muted">Введи новый пароль (минимум 8 символов).</p><input class="field" id="arvexNewPassword" type="password" autocomplete="new-password" placeholder="Новый пароль"><input class="field" id="arvexNewPassword2" type="password" autocomplete="new-password" placeholder="Повтори новый пароль" style="margin-top:8px"><p class="muted" id="arvexPasswordMsg"></p><div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="primary" id="arvexPasswordSave">Сохранить</button></div>');
 }
 // Google OAuth: Supabase возвращает токены на custom Android deep link.
 async function acceptOAuthCallback(rawUrl){
  try{
   const u=new URL(rawUrl,location.href);
   const params=new URLSearchParams((u.hash||"").replace(/^#/,""));
   const error=params.get("error_description")||params.get("error");
   if(error){status="Ошибка входа Google: "+error;if(typeof renderProfile==="function")renderProfile();return false;}
   const access=params.get("access_token"),refresh=params.get("refresh_token");
   if(!access||!refresh)return false;
   const user=await req("/auth/v1/user",{headers:hdr(access)});
   const ok=adopt({access_token:access,refresh_token:refresh,expires_in:Number(params.get("expires_in"))||3600,user});
   if(ok){history.replaceState(null,"",location.pathname+location.search);status="Вход через Google выполнен";await sync();if(typeof renderProfile==="function")renderProfile();return true;}
  }catch(e){status="Не удалось обработать ответ Google: "+e.message;}
  return false;
 }
 function startGoogleSignIn(){
  if(!enabled())throw new Error("Облачная авторизация сейчас недоступна.");
  const u=new URL(cfg().url.replace(/\/$/,"")+"/auth/v1/authorize");
  u.searchParams.set("provider","google");
  u.searchParams.set("redirect_to",GOOGLE_REDIRECT);
  u.searchParams.set("flow_type","implicit");
  const browser=window.ARVEX_CAP_BROWSER;
  if(browser&&window.Capacitor&&window.Capacitor.isNativePlatform())browser.open({url:u.toString()});
  else location.href=u.toString();
 }
 function installOAuthDeepLink(){
  const app=window.ARVEX_CAP_APP;
  if(!app||!window.Capacitor||typeof window.Capacitor.isNativePlatform!=="function"||!window.Capacitor.isNativePlatform())return;
  try{
   app.addListener("appUrlOpen",e=>{if(e&&e.url)acceptOAuthCallback(e.url);});
   app.getLaunchUrl().then(r=>{if(r&&r.url)acceptOAuthCallback(r.url);}).catch(()=>{});
  }catch(e){console.warn("ARVEX Google OAuth deep-link listener:",e);}
 }
 if(typeof window!=="undefined")installOAuthDeepLink();
 async function signIn(email,pw){
  const j=await req("/auth/v1/token?grant_type=password",{method:"POST",headers:hdr(),body:JSON.stringify({email,password:pw})});
  adopt(j);return {ok:true};
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
 if(recoveryMode&&typeof window!=="undefined")setTimeout(()=>changePasswordPrompt(),700);
 function accountHTML(){
  if(!enabled())return `<p class="muted" style="margin:0">Сейчас профиль хранится на этом устройстве.</p><div class="soon">🔒 Облачные аккаунты подключаются владельцем проекта (см. README → «Облако»).</div>`;
  if(session)return `<p style="margin:0 0 8px">Вход выполнен: <b>${esc(session.email)}</b></p><p class="muted" style="margin:0 0 10px">${esc(status||"Прогресс синхронизируется автоматически.")}</p><div class="btn-row"><button class="ghost" id="cloudSync">↻ Синхронизировать</button><button class="danger" id="cloudOut">Выйти</button></div>`;
  return `<p class="muted" style="margin:0 0 10px">Войди, чтобы сохранить прогресс в облаке и открыть его на другом устройстве.</p><input class="field" id="cEmail" type="email" placeholder="Email" autocomplete="email"><input class="field" id="cPass" type="password" placeholder="Пароль (от 8 символов)" autocomplete="current-password" style="margin-top:8px"><div class="btn-row" style="margin-top:10px"><button class="primary" id="cloudIn">Войти</button><button class="ghost" id="cloudUp">Регистрация</button><button class="ghost" id="cloudGoogle">G Google</button><button class="ghost" id="cloudForgot">Забыли пароль?</button></div><p class="muted" id="cloudMsg" style="margin:8px 0 0"></p>`;
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
  if(t.closest("#cloudGoogle")){
   const m=document.getElementById("cloudMsg");
   try{if(m)m.textContent="Открываем безопасный вход Google…";startGoogleSignIn();}
   catch(e){if(m)m.textContent=e.message;}
   return true;
  }

  if(t.closest("#cloudIn")){form("in");return true}
  if(t.closest("#cloudUp")){form("up");return true}
  if(t.closest("#cloudForgot")){const email=(document.getElementById("cEmail")?.value||"").trim(),m=document.getElementById("cloudMsg");if(!email){if(m)m.textContent="Сначала введи email.";return true}m.textContent="Отправляем ссылку для восстановления…";resetPassword(email).then(()=>m.textContent="Если аккаунт с таким email существует, письмо для сброса пароля отправлено.").catch(e=>m.textContent=e.message);return true}
  if(t.closest("#arvexPasswordSave")){const p=document.getElementById("arvexNewPassword")?.value||"",p2=document.getElementById("arvexNewPassword2")?.value||"",m=document.getElementById("arvexPasswordMsg");if(p.length<8){m.textContent="Минимум 8 символов.";return true}if(p!==p2){m.textContent="Пароли не совпадают.";return true}m.textContent="Сохраняю…";updatePassword(p).then(()=>{m.textContent="Пароль изменён.";setTimeout(()=>{if(typeof closeSheet==="function")closeSheet()},900)}).catch(e=>m.textContent=e.message);return true}
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
  if(!session)return '<div class="card"><div class="card-title">Сервисы аккаунта</div><p class="muted">Войди в аккаунт, чтобы использовать промокоды, смотреть платежи и обращаться в поддержку.</p></div>';
  return '<div class="card"><div class="card-title">Промокод</div><div class="btn-row"><input class="field" id="arvexPromoCode" maxlength="32" placeholder="Введи промокод"><button class="primary" id="arvexPromoApply">Активировать</button></div><p class="muted" id="arvexPromoMsg"></p></div>'+
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

 return {insertOrder,myEntitlement,createStarsInvoice,createStarsBotLink,setStarsAutoRenew,createSupport,enabled,accountHTML,userToolsHTML,loadProfileData,click,schedule,sync,isIn:()=>!!session,changePasswordPrompt,startGoogleSignIn,acceptOAuthCallback};
})();

// Netlify production redeploy trigger: email confirmation redirects to the public site.
