/* ARVEX Cloud: вход по email/паролю и синхронизация прогресса через Supabase (REST).
   Пароль нигде не хранится — только токены сессии. Без настроек работает офлайн. */
const Cloud=(()=>{
 const cfg=()=>window.ARVEX_CLOUD||{};
 const SK="arvex_cloud_session",LOCAL_OWNER_KEY="arvex_local_state_owner",LOCAL_RESET_KEY="arvex_account_state_reset",STATE_KEY="arvex_v3_state";
 const GOOGLE_REDIRECT="app.arvex.trading://auth/callback";
 let session=null,timer=null,busy=false,status="",profileDataLoading=false,profileDataLoadedAt=0;
 try{session=JSON.parse(localStorage.getItem(SK)||"null")}catch(e){}
 // Keep the device-local demo state associated with the account that created it.
 if(session&&session.uid){const owner=localStorage.getItem(LOCAL_OWNER_KEY);if(owner&&owner!==session.uid)localStorage.removeItem(STATE_KEY);localStorage.setItem(LOCAL_OWNER_KEY,session.uid)}
 let recoveryMode=false;
 try{
  const hp=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  if(hp.get("type")==="recovery"&&hp.get("access_token")){
   adopt({access_token:hp.get("access_token"),refresh_token:hp.get("refresh_token")||"",expires_in:Number(hp.get("expires_in"))||3600});
   recoveryMode=true;
   history.replaceState(null,"",location.pathname);
  }
 }catch(e){}
 const enabled=()=>!!(cfg().url&&cfg().anonKey);
 const keep=s=>{session=s;try{s?localStorage.setItem(SK,JSON.stringify(s)):localStorage.removeItem(SK)}catch(e){}};
 const hdr=(tok)=>({"apikey":cfg().anonKey,"Authorization":"Bearer "+(tok||cfg().anonKey),"Content-Type":"application/json"});
 async function req(path,opt){
  const r=await fetch(cfg().url.replace(/\/$/,"")+path,opt);
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const err=new Error((j&&(j.msg||j.error_description||j.message||j.error))||("HTTP "+r.status));err.status=r.status;err.code=j&&(j.code||j.error_code);err.details=j&&j.details;err.hint=j&&j.hint;throw err}
  return j;
 }
 function adopt(j){
  if(!j||!j.access_token)return false;
  const uid=(j.user&&j.user.id)||(session&&session.uid)||"",owner=localStorage.getItem(LOCAL_OWNER_KEY)||(session&&session.uid)||"";
  if(uid&&owner&&owner!==uid){localStorage.removeItem(STATE_KEY);localStorage.setItem(LOCAL_RESET_KEY,"1")}
  if(uid)localStorage.setItem(LOCAL_OWNER_KEY,uid);
  keep({access:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-60000,email:(j.user&&j.user.email)||(session&&session.email)||"",uid});
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
  if(j&&j.user&&Array.isArray(j.user.identities)&&j.user.identities.length===0)return {ok:false,exists:true};
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
 const PKCE_KEY="arvex_google_pkce_verifier";
 function base64url(bytes){let bin="";for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
 async function makePkce(){
  const bytes=new Uint8Array(64);crypto.getRandomValues(bytes);
  const verifier=base64url(bytes),digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
  localStorage.setItem(PKCE_KEY,verifier);
  return {verifier,challenge:base64url(new Uint8Array(digest))};
 }
 async function acceptOAuthCallback(rawUrl){
  try{
   const u=new URL(rawUrl,location.href),hash=new URLSearchParams((u.hash||"").replace(/^#/,""));
   const error=u.searchParams.get("error_description")||u.searchParams.get("error")||hash.get("error_description")||hash.get("error");
   if(error){status="Ошибка входа Google: "+error;if(typeof renderProfile==="function")renderProfile();return false;}
   let tokens=null;
   const code=u.searchParams.get("code");
   if(code){
    const verifier=localStorage.getItem(PKCE_KEY);
    if(!verifier)throw new Error("Не найден ключ проверки Google-входа. Повтори авторизацию.");
    tokens=await req("/auth/v1/token?grant_type=pkce",{method:"POST",headers:hdr(),body:JSON.stringify({auth_code:code,code_verifier:verifier})});
    localStorage.removeItem(PKCE_KEY);
   }else if(hash.get("access_token")&&hash.get("refresh_token")){
    tokens={access_token:hash.get("access_token"),refresh_token:hash.get("refresh_token"),expires_in:Number(hash.get("expires_in"))||3600};
   }else return false;
   if(!tokens.user){tokens.user=await req("/auth/v1/user",{headers:hdr(tokens.access_token)});}
   const ok=adopt(tokens);
   if(ok){history.replaceState(null,"",location.pathname+location.search);status="Вход через Google выполнен";if(await checkAccountStatus())return true;if(localStorage.getItem(LOCAL_RESET_KEY)==="1"){localStorage.removeItem(LOCAL_RESET_KEY);location.reload();return true}await sync();if(typeof renderProfile==="function")renderProfile();return true;}
  }catch(e){status="Не удалось завершить вход Google: "+e.message;if(typeof renderProfile==="function")renderProfile();}
  return false;
 }
 async function startGoogleSignIn(){
  if(!enabled())throw new Error("Облачная авторизация сейчас недоступна.");
  const native=typeof window.ARVEX_CAP_IS_NATIVE==="function"?window.ARVEX_CAP_IS_NATIVE():!!(window.Capacitor&&window.Capacitor.isNativePlatform());
  const redirect=native?GOOGLE_REDIRECT:(location.origin+location.pathname);
  const pkce=await makePkce(),u=new URL(cfg().url.replace(/\/$/,"")+"/auth/v1/authorize");
  u.searchParams.set("provider","google");u.searchParams.set("redirect_to",redirect);
  u.searchParams.set("code_challenge",pkce.challenge);u.searchParams.set("code_challenge_method","s256");
  const browser=window.ARVEX_CAP_BROWSER;
  if(native&&browser)await browser.open({url:u.toString()});
  else location.href=u.toString();
 }
 if(typeof window!=="undefined"&&typeof location!=="undefined"&&(/[?&]code=/.test(location.search)||/access_token=/.test(location.hash||""))){
  setTimeout(()=>acceptOAuthCallback(location.href),0);
 }
 function installOAuthDeepLink(){
  const app=window.ARVEX_CAP_APP;
  const native=typeof window.ARVEX_CAP_IS_NATIVE==="function"?window.ARVEX_CAP_IS_NATIVE():!!(window.Capacitor&&window.Capacitor.isNativePlatform());
  if(!app||!native)return;
  try{
   app.addListener("appUrlOpen",e=>{
    if(e&&e.url){
     const browser=window.ARVEX_CAP_BROWSER;if(browser&&browser.close)browser.close().catch(()=>{});
     acceptOAuthCallback(e.url);
    }
   });
   app.addListener("appStateChange",state=>{if(state&&state.isActive)checkAccountStatus();});
   app.getLaunchUrl().then(r=>{if(r&&r.url)acceptOAuthCallback(r.url);}).catch(()=>{});
  }catch(e){console.warn("ARVEX Google OAuth deep-link listener:",e);}
 }
 if(typeof window!=="undefined")installOAuthDeepLink();
 if(typeof window!=="undefined"&&typeof setInterval==="function")setInterval(()=>{if(session)checkAccountStatus()},30000);
 async function signIn(email,pw){
  const j=await req("/auth/v1/token?grant_type=password",{method:"POST",headers:hdr(),body:JSON.stringify({email,password:pw})});
  adopt(j);return {ok:true};
 }
 async function signOut(){
  const old=session;
  try{if(old){const current=await token();await req("/auth/v1/logout?scope=global",{method:"POST",headers:hdr(current)});}}catch(e){}
  if(old&&old.uid)localStorage.setItem(LOCAL_OWNER_KEY,old.uid);
  keep(null);status="";blocked=false;hideBanScreen();
  if(typeof Access!=="undefined")Access.refresh();
 }
 let blocked=false;
 function hideBanScreen(){
  const el=document.getElementById("arvexBanOverlay");
  if(el)el.remove();
  if(document.body){
   for(const child of Array.from(document.body.children)){
    if(child.dataset&&child.dataset.arvexBanWasInert!==undefined){
     child.inert=child.dataset.arvexBanWasInert==="1";
     delete child.dataset.arvexBanWasInert;
    }
   }
   if(document.body.dataset&&document.body.dataset.arvexBanOverflow!==undefined){
    document.body.style.overflow=document.body.dataset.arvexBanOverflow;
    delete document.body.dataset.arvexBanOverflow;
   }
  }
  blocked=false;
 }
 function showBanScreen(info){
  blocked=true;
  const en=localStorage.getItem("arvex_language")==="en",locale=en?"en-US":"ru-RU";
  const words=en?{
   title:"Your account has been blocked by an administrator",
   admin:"Administrator",reason:"Reason for the block",exit:"Exit the app",appeal:"Appeal this decision",
   appealText:"Hello, I would like to appeal my ARVEX account restriction. Email: ",
   fallback:"Access to this account has been restricted by ARVEX administration."
  }:{
   title:"Вы были заблокированы администратором",admin:"Администратор",reason:"Причина блокировки",
   exit:"Выйти из приложения",appeal:"Обжаловать блокировку",
   appealText:"Здравствуйте, хочу обжаловать блокировку аккаунта ARVEX. Email: ",
   fallback:"Доступ к аккаунту ограничен администрацией ARVEX."
  };
  let el=document.getElementById("arvexBanOverlay");
  if(!el){el=document.createElement("div");el.id="arvexBanOverlay";document.body.appendChild(el)}
  if(document.body){
   if(document.body.dataset.arvexBanOverflow===undefined)document.body.dataset.arvexBanOverflow=document.body.style.overflow||"";
   document.body.style.overflow="hidden";
   for(const child of Array.from(document.body.children)){
    if(child!==el){
     if(child.dataset&&child.dataset.arvexBanWasInert===undefined)child.dataset.arvexBanWasInert=child.inert?"1":"0";
     child.inert=true;
    }
   }
  }
  const reason=esc(info.reason||words.fallback),when=info.banned_at?new Date(info.banned_at).toLocaleString(locale):"";
  const appeal=words.appealText+(session?.email||"unknown")+". "+(info.reason||"");
  el.style.cssText="position:fixed;inset:0;z-index:2147483000;background:rgba(5,7,16,.98);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto";
  el.innerHTML='<div style="width:min(100%,440px);background:#111827;border:1px solid #754b5b;border-radius:20px;padding:26px;color:#f7f7fb;text-align:center;box-shadow:0 20px 80px #0009"><div style="font-size:48px;margin-bottom:12px">🔒</div><h2 style="margin:0 0 10px">'+words.title+'</h2><p style="color:#b8c0d2;margin:0 0 6px">'+words.admin+': <b>'+esc(info.administrator||'Mrasulv')+'</b></p><div style="background:#1c2434;border-radius:12px;padding:14px;margin:14px 0;text-align:left"><b>'+words.reason+'</b><p style="white-space:pre-wrap;margin:8px 0 0">'+reason+'</p></div><p style="color:#9ca8bb;font-size:12px;margin:0 0 16px">'+esc(when)+'</p><button id="arvexBanExit" class="danger" style="width:100%;margin-bottom:10px">'+words.exit+'</button><a id="arvexBanAppeal" href="https://t.me/mrasulv?text='+encodeURIComponent(appeal)+'" target="_blank" rel="noopener" style="display:block;background:#7655e8;color:white;text-decoration:none;padding:13px;border-radius:10px;font-weight:700">'+words.appeal+'</a></div>';
  el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label",words.title);
  el.onkeydown=e=>{
   if(e.key==="Escape"){e.preventDefault();e.stopPropagation();return}
   if(e.key==="Tab"){
    const focusable=Array.from(el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    if(!focusable.length){e.preventDefault();return}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
   }
  };
  const exitButton=el.querySelector("#arvexBanExit");if(exitButton)exitButton.focus();
 }
 async function exitBlockedApp(){
  await signOut();
  const app=window.ARVEX_CAP_APP;
  if(app&&typeof app.exitApp==="function"){try{await app.exitApp();return}catch(e){}}
  try{location.replace("about:blank")}catch(e){}
 }
 async function checkAccountStatus(){
  if(!session)return false;
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_my_account_status",{method:"POST",headers:hdr(tok),body:"{}"});
   const info=Array.isArray(rows)?rows[0]:rows;
   if(info&&info.is_banned){showBanScreen(info);return true}
   hideBanScreen();return false;
  }catch(e){if(e.status===401){keep(null)}return false}
 }
 async function deleteOwnAccount(){
  if(!session)throw new Error("Сначала войди в аккаунт.");
  const tok=await token();
  const r=await fetch(cfg().url.replace(/\/$/,"")+"/functions/v1/delete-own-account",{method:"POST",headers:hdr(tok),body:JSON.stringify({confirm:"DELETE"})});
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error((j&&j.error)||"Не удалось удалить аккаунт.");
  keep(null);localStorage.removeItem(STATE_KEY);localStorage.removeItem(LOCAL_OWNER_KEY);localStorage.removeItem(LOCAL_RESET_KEY);localStorage.removeItem("arvex_google_pkce_verifier");
  return true;
 }
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
  if(await checkAccountStatus())return;
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
  if(session)return `<p style="margin:0 0 8px">Вход выполнен: <b>${esc(session.email)}</b></p><p class="muted" style="margin:0 0 10px">${esc(status||"Прогресс синхронизируется автоматически.")}</p><div class="btn-row"><button class="ghost" id="cloudSync">↻ Синхронизировать</button><button class="danger" id="cloudOut">Выйти</button><button class="ghost" id="arvexDeleteAccount">Удалить аккаунт</button></div>`;
  return `<p class="muted" style="margin:0 0 10px">Войди, чтобы сохранить прогресс в облаке и открыть его на другом устройстве.</p><input class="field" id="cEmail" type="email" placeholder="Email" autocomplete="email"><input class="field" id="cPass" type="password" placeholder="Пароль (от 8 символов)" autocomplete="current-password" style="margin-top:8px"><div class="btn-row" style="margin-top:10px"><button class="primary" id="cloudIn">Войти</button><button class="ghost" id="cloudUp">Регистрация</button><button class="ghost" id="cloudGoogle">G Продолжить с Google</button><button class="ghost" id="cloudForgot">Забыли пароль?</button></div><p class="muted" id="cloudMsg" style="margin:8px 0 0"></p>`;
 }
 async function form(kind){
  const e=($("cEmail").value||"").trim(),p=$("cPass").value||"",m=$("cloudMsg"),en=localStorage.getItem("arvex_language")==="en";
  const say=(ru,english)=>en?english:ru;
  if(!/^\S+@\S+\.\S+$/.test(e)){m.textContent=say("Проверь email.","Check your email address.");return}
  if(p.length<8){m.textContent=say("Пароль — минимум 8 символов.","Password must be at least 8 characters.");return}
  m.textContent=say("Подождите…","Please wait…");
  try{
   if(kind==="up"){
    const r=await signUp(e,p);
    if(r.exists){m.textContent=say("Этот email уже зарегистрирован. Нажми «Войти» или «Забыли пароль?».","This email is already registered. Sign in or reset your password.");return}
    if(r.confirm){m.textContent=say("Письмо отправлено. Подтверди почту и нажми «Войти».","Confirmation email sent. Verify it, then sign in.");return}
   }else await signIn(e,p);
   if(await checkAccountStatus())return;
   if(localStorage.getItem(LOCAL_RESET_KEY)==="1"){localStorage.removeItem(LOCAL_RESET_KEY);location.reload();return}
   showToast("Вход выполнен");await sync();
  }catch(err){
   const code=String(err.code||"").toLowerCase(),msg=String(err.message||"");
   if(/ban/i.test(msg))m.textContent=say("Аккаунт заблокирован администратором Mrasulv. Для обжалования напиши @mrasulv.","Your account is restricted by administrator Mrasulv. Contact @mrasulv to appeal.");
   else if(code==="email_not_confirmed"||/email not confirmed/i.test(msg))m.textContent=say("Сначала подтверди email по ссылке из письма, затем войди.","Verify your email using the link we sent, then sign in.");
   else if(code==="invalid_credentials"||/invalid login credentials/i.test(msg))m.textContent=say("Неверный email или пароль. Если входил через Google, нажми кнопку Google.","Incorrect email or password. If you used Google, choose Continue with Google.");
   else if(/provider.*not enabled|unsupported provider/i.test(msg))m.textContent=say("Вход Google пока не настроен в Supabase. Попробуй позже или войди по email.","Google sign-in is not configured in Supabase yet. Try later or use email sign-in.");
   else m.textContent=msg;
  }
 }
 function click(t){
  if(t.closest("#arvexBanExit")){exitBlockedApp();return true}
  if(t.closest("#arvexBanAppeal")){return true}
  if(t.closest("#arvexDeleteAccount")){
   if(typeof openSheet==="function")openSheet('<h3>Удалить аккаунт ARVEX?</h3><p class="muted">Это действие необратимо. Удалятся облачный аккаунт и связанные с ним данные. Если Premium продлевается автоматически, автопродление сначала будет отключено. Для подтверждения введи DELETE.</p><input class="field" id="arvexDeleteConfirmText" placeholder="DELETE" autocomplete="off"><p class="muted" id="arvexDeleteMsg"></p><div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="danger" id="arvexDeleteConfirm">Удалить аккаунт</button></div>');
   return true;
  }
  if(t.closest("#arvexDeleteConfirm")){
   const m=document.getElementById("arvexDeleteMsg");
   if(document.getElementById("arvexDeleteConfirmText")?.value!=="DELETE"){if(m)m.textContent="Введи DELETE для подтверждения.";return true}
   if(m)m.textContent="Удаляем аккаунт…";
   deleteOwnAccount().then(()=>{if(typeof closeSheet==="function")closeSheet();localStorage.removeItem("arvex_v3_state");location.reload()}).catch(e=>{if(m)m.textContent=e.message});
   return true;
  }
  if(t.closest("#cloudGoogle")){
   const m=document.getElementById("cloudMsg");
   if(m)m.textContent="Открываем безопасный вход Google…";
   startGoogleSignIn().catch(e=>{if(m)m.textContent=e.message;status=e.message;});
   return true;
  }

  if(t.closest("#cloudIn")){form("in");return true}
  if(t.closest("#cloudUp")){form("up");return true}
  if(t.closest("#cloudForgot")){const email=(document.getElementById("cEmail")?.value||"").trim(),m=document.getElementById("cloudMsg");if(!email){if(m)m.textContent="Сначала введи email.";return true}m.textContent="Отправляем ссылку для восстановления…";resetPassword(email).then(()=>m.textContent="Если аккаунт с таким email существует, письмо для сброса пароля отправлено.").catch(e=>m.textContent=e.message);return true}
  if(t.closest("#arvexPasswordSave")){const p=document.getElementById("arvexNewPassword")?.value||"",p2=document.getElementById("arvexNewPassword2")?.value||"",m=document.getElementById("arvexPasswordMsg");if(p.length<8){m.textContent="Минимум 8 символов.";return true}if(p!==p2){m.textContent="Пароли не совпадают.";return true}m.textContent="Сохраняю…";updatePassword(p).then(()=>{m.textContent="Пароль изменён.";setTimeout(()=>{if(typeof closeSheet==="function")closeSheet()},900)}).catch(e=>m.textContent=e.message);return true}
  if(t.closest("#cloudSync")){sync();return true}
  if(t.closest("#cloudOut")){signOut().then(()=>{if(typeof renderProfile==="function")renderProfile()});return true}
  if(t.closest("#arvexPromoApply")){const m=document.getElementById("arvexPromoMsg");m.textContent="Проверяю…";redeemPromo(document.getElementById("arvexPromoCode").value).then(()=>{m.textContent="Промокод активирован!";if(typeof renderProfile==="function")renderProfile()}).catch(e=>m.textContent=e.message);return true}
  if(t.closest("#arvexPaymentsLoad")){loadPayments();return true}
  if(t.closest("#arvexNotificationsLoad")){loadNotifications();return true}
  if(t.closest("#arvexAdminPromoCreate")){createAdminPromo();return true}
  if(t.closest("#arvexAdminPromoRefresh")){loadAdminPromos();return true}
  if(t.closest("#arvexAdminSupportRefresh")){loadAdminSupport();return true}
  if(t.closest("#arvexAdminUserSearch")){searchAdminUsers();return true}
  if(t.closest("#arvexAdminBanRefresh")){loadAdminBans();loadAdminBanHistory();return true}
  const banUser=t.closest("[data-admin-ban-user]");
  if(banUser){openAdminBanDialog(banUser.dataset.adminBanUser,banUser.dataset.adminBanEmail);return true}
  const unbanUser=t.closest("[data-admin-unban-user]");
  if(unbanUser){const id=unbanUser.dataset.adminUnbanUser;if(typeof openSheet==="function")openSheet('<h3>Снять блокировку?</h3><p class="muted">Пользователь снова сможет войти в ARVEX.</p><div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="primary" id="arvexUnbanConfirm" data-user-id="'+esc(id)+'">Снять блокировку</button></div>');return true}
  if(t.closest("#arvexBanConfirm")){
   const id=t.closest("#arvexBanConfirm").dataset.userId,reason=document.getElementById("arvexBanReason")?.value||"",m=document.getElementById("arvexBanMsg");
   if(reason.trim().length<5){if(m)m.textContent="Укажи причину минимум из 5 символов.";return true}
   if(m)m.textContent="Применяю блокировку…";
   setUserBan(id,"ban",reason).then(()=>{if(typeof closeSheet==="function")closeSheet();showToast("Аккаунт заблокирован.")}).catch(e=>{if(m)m.textContent=e.message});return true;
  }
  if(t.closest("#arvexUnbanConfirm")){
   const id=t.closest("#arvexUnbanConfirm").dataset.userId;
   setUserBan(id,"unban").then(()=>{if(typeof closeSheet==="function")closeSheet();showToast("Блокировка снята.")}).catch(e=>showToast(e.message));return true;
  }
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
  const en=localStorage.getItem("arvex_language")==="en";
  box.textContent=en?"Loading requests…":"Загрузка обращений…";
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_admin_list_support_tickets",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_limit:50})});
   box.textContent="";
   if(!Array.isArray(rows)||!rows.length){box.textContent=en?"No support requests yet.":"Обращений пока нет.";return}
   rows.forEach(ticket=>{
    const card=document.createElement("div");card.className="res-link";card.dataset.supportRow="1";
    const head=document.createElement("b");head.textContent=(ticket.subject||(en?"No subject":"Без темы"))+" · "+(ticket.user_email||(en?"account":"аккаунт"));card.appendChild(head);
    const body=document.createElement("span");body.textContent=(ticket.message||"")+" · "+new Date(ticket.created_at).toLocaleString(en?"en-US":"ru-RU");card.appendChild(body);
    const controls=document.createElement("div");controls.className="btn-row";controls.style.marginTop="8px";
    const select=document.createElement("select");select.className="field";
    [["open",en?"Open":"Открыто"],["in_progress",en?"In progress":"В работе"],["closed",en?"Closed":"Закрыто"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;select.appendChild(option)});
    select.value=ticket.status||"open";
    const save=document.createElement("button");save.className="ghost";save.type="button";save.dataset.supportUpdate=ticket.ticket_id;save.textContent=en?"Save status":"Сохранить статус";
    controls.append(select,save);card.appendChild(controls);box.appendChild(card);
   });
  }catch(e){box.textContent=(en?"Could not load requests: ":"Не удалось загрузить обращения: ")+e.message}
 }
 async function updateSupportStatus(ticketId,status){
  const box=document.getElementById("arvexAdminSupportList"),en=localStorage.getItem("arvex_language")==="en";
  try{
   const tok=await token();await req("/rest/v1/rpc/arvex_admin_set_support_status",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_ticket_id:ticketId,p_status:status})});
   showToast(en?"Request status updated.":"Статус обращения обновлён");await loadAdminSupport();
  }catch(e){if(box)box.textContent=(en?"Could not update status: ":"Не удалось обновить статус: ")+e.message}
 }
 async function loadAdminPromos(){
  const box=document.getElementById("arvexAdminPromoList");if(!box)return;
  const en=localStorage.getItem("arvex_language")==="en";
  try{const tok=await token();const rows=await req("/rest/v1/rpc/arvex_admin_list_promos",{method:"POST",headers:hdr(tok),body:"{}"});
   box.textContent="";
   if(!rows.length){box.textContent=en?"No promo codes yet.":"Промокодов пока нет.";return}
   rows.forEach(p=>{const el=document.createElement("p");el.textContent=p.code+" — "+p.days+(en?" days · ":" дн. · ")+p.redeemed_count+"/"+p.max_redemptions+" · "+(p.active?(en?"active":"активен"):(en?"disabled":"выключен"));box.appendChild(el)});
  }catch(e){box.textContent=e.message}
 }
 async function createAdminPromo(){
  const code=document.getElementById("arvexAdminCode"),days=document.getElementById("arvexAdminDays"),limit=document.getElementById("arvexAdminLimit"),msg=document.getElementById("arvexAdminPromoMsg"),en=localStorage.getItem("arvex_language")==="en";
  msg.textContent=en?"Creating…":"Создаю…";
  try{const tok=await token();await req("/rest/v1/rpc/arvex_admin_create_promo",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_code:code.value,p_days:Number(days.value),p_max_redemptions:Number(limit.value),p_expires_at:null})});msg.textContent=en?"Promo code created.":"Промокод создан.";code.value="";await loadAdminPromos()}catch(e){msg.textContent=e.message}
 }
 let activeBanIds=new Set();
 async function loadAdminBans(){
  const box=document.getElementById("arvexAdminBanList");if(!box)return;
  const en=localStorage.getItem("arvex_language")==="en";box.textContent=en?"Loading active bans…":"Загружаю список блокировок…";
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_admin_list_bans",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_query:""})});
   activeBanIds=new Set((rows||[]).map(x=>x.user_id));
   box.textContent="";
   if(!rows||!rows.length){box.textContent=en?"No active bans.":"Активных блокировок нет.";return}
   rows.forEach(x=>{
    const card=document.createElement("div");card.className="res-link";
    const head=document.createElement("b");head.textContent=(x.email||x.user_id)+(en?" · blocked":" · заблокирован");card.appendChild(head);
    const reason=document.createElement("span");reason.textContent=(en?"Reason: ":"Причина: ")+x.reason+(en?" · issued by: ":" · выдал: ")+(x.banned_by||"Mrasulv")+" · "+new Date(x.created_at).toLocaleString(en?"en-US":"ru-RU");card.appendChild(reason);
    const button=document.createElement("button");button.className="ghost";button.type="button";button.dataset.adminUnbanUser=x.user_id;button.textContent=en?"Unban":"Снять блокировку";button.style.marginTop="8px";card.appendChild(button);box.appendChild(card);
   });
   if(typeof applyLanguage==="function")applyLanguage(en?"en":"ru");
  }catch(e){box.textContent=(en?"Could not load bans: ":"Не удалось загрузить блокировки: ")+e.message}
 }
 async function loadAdminBanHistory(){
  const box=document.getElementById("arvexAdminBanHistory");if(!box)return;
  const en=localStorage.getItem("arvex_language")==="en";
  box.textContent=en?"Loading ban history…":"Загружаю историю…";
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_admin_ban_history",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_limit:50})});
   box.textContent="";
   if(!rows||!rows.length){box.textContent=en?"Ban history is empty.":"История пока пуста.";return}
   rows.forEach(x=>{
    const card=document.createElement("div");card.className="res-link";
    const head=document.createElement("b");head.textContent=(x.action==="ban"?(en?"Ban: ":"Блокировка: "):(en?"Unban: ":"Снятие блокировки: "))+(x.email||x.user_id);card.appendChild(head);
    const info=document.createElement("span");info.textContent=(x.reason?(en?"Reason: ":"Причина: ")+x.reason+" · ":"")+(en?"Administrator: ":"Администратор: ")+(x.administrator||"Mrasulv")+" · "+new Date(x.created_at).toLocaleString(en?"en-US":"ru-RU");card.appendChild(info);
    box.appendChild(card);
   });
  }catch(e){box.textContent=(en?"Could not load ban history: ":"Не удалось загрузить историю: ")+e.message}
 }
 async function searchAdminUsers(){
  const box=document.getElementById("arvexAdminUsersList"),input=document.getElementById("arvexAdminUserQuery");if(!box||!input)return;
  const en=localStorage.getItem("arvex_language")==="en";box.textContent=en?"Searching accounts…":"Ищу аккаунты…";
  try{
   const tok=await token(),rows=await req("/rest/v1/rpc/arvex_admin_search_users",{method:"POST",headers:hdr(tok),body:JSON.stringify({p_query:input.value.trim()})});
   box.textContent="";
   if(!rows||!rows.length){box.textContent=en?"No users found.":"Пользователи не найдены.";return}
   rows.forEach(x=>{
    const card=document.createElement("div");card.className="res-link";
    const head=document.createElement("b");head.textContent=x.email||x.user_id;card.appendChild(head);
    const info=document.createElement("span");info.textContent="ID: "+x.user_id+" · Premium: "+(x.is_forever?(en?"forever":"навсегда"):x.expires_at?new Date(x.expires_at).toLocaleDateString(en?"en-US":"ru-RU"):(en?"no":"нет"));card.appendChild(info);
    const controls=document.createElement("div");controls.className="btn-row";controls.style.marginTop="8px";
    if(activeBanIds.has(x.user_id)){const un=document.createElement("button");un.className="ghost";un.type="button";un.dataset.adminUnbanUser=x.user_id;un.textContent=en?"Unban":"Снять блокировку";controls.appendChild(un)}
    else{const ban=document.createElement("button");ban.className="danger";ban.type="button";ban.dataset.adminBanUser=x.user_id;ban.dataset.adminBanEmail=x.email||"";ban.textContent=en?"Ban user":"Заблокировать";controls.appendChild(ban)}
    card.appendChild(controls);box.appendChild(card);
   });
   if(typeof applyLanguage==="function")applyLanguage(en?"en":"ru");
  }catch(e){box.textContent=(en?"Could not find users: ":"Не удалось найти пользователей: ")+e.message}
 }
 function openAdminBanDialog(userId,email){
  if(typeof openSheet!=="function")return;
  openSheet('<h3>Заблокировать аккаунт</h3><p class="muted">'+esc(email||userId)+'</p><label class="lbl" for="arvexBanReason">Причина блокировки</label><textarea class="field" id="arvexBanReason" rows="4" maxlength="1000" placeholder="Подробно укажи причину (минимум 5 символов)"></textarea><p class="muted" id="arvexBanMsg"></p><div class="dir-btns"><button class="ghost" id="sheetCancel">Отмена</button><button class="danger" id="arvexBanConfirm" data-user-id="'+esc(userId)+'">Подтвердить блокировку</button></div>');
 }
 async function setUserBan(userId,action,reason=""){
  const tok=await token(),r=await fetch(cfg().url.replace(/\/$/,"")+"/functions/v1/admin-user-ban",{method:"POST",headers:hdr(tok),body:JSON.stringify({user_id:userId,action,reason})});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error((j&&j.error)||"Не удалось изменить блокировку");
  await loadAdminBans();await loadAdminBanHistory();await searchAdminUsers();return j;
 }
 async function loadAdminTools(){
  if(!session)return;
  try{if(await adminStatus()){const box=document.getElementById("arvexAdminTools");if(box){box.classList.remove("hidden");await Promise.all([loadAdminPromos(),loadAdminSupport(),loadAdminBans(),loadAdminBanHistory()])}}}catch(e){}
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
   '<div class="card hidden" id="arvexAdminTools"><div class="card-title">Управление аккаунтами</div><input class="field" id="arvexAdminUserQuery" maxlength="120" placeholder="Email или ID пользователя"><div class="btn-row"><button class="primary" type="button" id="arvexAdminUserSearch">Найти пользователя</button><button class="ghost" type="button" id="arvexAdminBanRefresh">Обновить блокировки</button></div><div id="arvexAdminUsersList"></div><div class="card-title" style="margin-top:14px">Активные блокировки</div><div id="arvexAdminBanList"></div><div class="card-title" style="margin-top:14px">История блокировок</div><div id="arvexAdminBanHistory"></div><div style="height:1px;background:var(--border);margin:16px 0"></div><div class="card-title">Управление промокодами</div><input class="field" id="arvexAdminCode" maxlength="32" placeholder="Код, например START30"><div class="btn-row"><select class="field" id="arvexAdminDays"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option><option value="365">365 дней</option></select><input class="field" id="arvexAdminLimit" type="number" min="1" max="10000" value="1" placeholder="Лимит"></div><button class="primary" id="arvexAdminPromoCreate">Создать промокод</button><p id="arvexAdminPromoMsg" class="muted"></p><div id="arvexAdminPromoList"></div><button class="ghost" id="arvexAdminPromoRefresh">Обновить список</button><div style="height:1px;background:var(--border);margin:16px 0"></div><div class="card-title">Обращения пользователей</div><button class="ghost" type="button" id="arvexAdminSupportRefresh">Обновить обращения</button><div id="arvexAdminSupportList"></div></div>'+
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
 function notificationIdNumber(id){
  const hex=String(id||"").replace(/[^0-9a-f]/gi,"").slice(0,8);
  return (parseInt(hex,16)||1)&0x7fffffff;
 }
 async function deliverSystemNotifications(rows){
  if(localStorage.getItem("arvex_notifications_enabled")==="false")return;
  let delivered=[];try{delivered=JSON.parse(localStorage.getItem("arvex_delivered_notifications")||"[]")}catch(e){}
  if(!Array.isArray(delivered))delivered=[];
  const seen=new Set(delivered),pending=(rows||[]).filter(x=>!x.read_at&&!seen.has(x.id)).slice(0,10);
  if(!pending.length)return;
  const native=typeof window.ARVEX_CAP_IS_NATIVE==="function"?window.ARVEX_CAP_IS_NATIVE():!!(window.Capacitor&&window.Capacitor.isNativePlatform());
  const plugin=window.ARVEX_CAP_LOCAL_NOTIFICATIONS;
  try{
   if(native&&plugin){
    const permission=await plugin.checkPermissions();
    if(permission&&permission.display==="granted"){
     const sound=localStorage.getItem("arvex_sound_enabled")==="true",vibration=localStorage.getItem("arvex_vibration_enabled")==="true";
     const channelId="arvex-notifications-s"+(sound?"1":"0")+"-v"+(vibration?"1":"0");
     if(typeof plugin.createChannel==="function")await plugin.createChannel({id:channelId,name:"ARVEX",description:"Уведомления приложения ARVEX",importance:(sound||vibration)?3:2,sound:sound?"arvex_notification.wav":undefined,vibration});
     await plugin.schedule({notifications:pending.map(x=>({id:notificationIdNumber(x.id),title:String(x.title||"ARVEX"),body:String(x.body||""),channelId,schedule:{at:new Date(Date.now()+700)}}))});
     pending.forEach(x=>seen.add(x.id));
    }
   }else if("Notification" in window&&Notification.permission==="granted"){
    pending.forEach(x=>{new Notification(String(x.title||"ARVEX"),{body:String(x.body||""),icon:"icon-192.png",tag:"arvex-"+x.id,silent:localStorage.getItem("arvex_sound_enabled")!=="true",vibrate:localStorage.getItem("arvex_vibration_enabled")==="true"?[120,60,120]:[]});seen.add(x.id)});
   }
  }catch(e){console.warn("ARVEX notification delivery:",e)}
  localStorage.setItem("arvex_delivered_notifications",JSON.stringify([...seen].slice(-300)));
 }
 async function loadNotifications(){
  const box=document.getElementById("arvexNotificationsList");if(!box)return;
  box.textContent="Загрузка…";
  try{
   const tok=await token(),rows=await req("/rest/v1/arvex_notifications?select=id,title,body,kind,created_at,read_at&user_id=eq."+encodeURIComponent(session.uid)+"&order=created_at.desc&limit=30",{headers:hdr(tok)});
   await deliverSystemNotifications(rows);
   const en=localStorage.getItem("arvex_language")==="en";
   box.innerHTML=rows.length?rows.map(x=>'<div class="res-link"><b>'+esc(x.title)+'</b><span>'+esc(x.body)+' · '+new Date(x.created_at).toLocaleString(en?"en-US":"ru-RU")+(x.read_at?(en?' · Read':' · Прочитано'):'')+'</span></div>').join(""):'<p class="muted">'+(en?'No new notifications.':'Новых уведомлений нет.')+'</p>';
   const unread=rows.filter(x=>!x.read_at).map(x=>x.id);
   if(unread.length)await req("/rest/v1/arvex_notifications?id=in.("+unread.join(",")+")&user_id=eq."+encodeURIComponent(session.uid),{method:"PATCH",headers:{...hdr(tok),"Prefer":"return=minimal"},body:JSON.stringify({read_at:new Date().toISOString()})});
  }catch(e){box.textContent="Не удалось загрузить уведомления: "+e.message}
 }

 document.addEventListener("submit",e=>{const form=e.target;if(!form||form.id!=="arvexSupportForm")return;e.preventDefault();submitSupportForm(form)});

 return {insertOrder,myEntitlement,createStarsInvoice,createStarsBotLink,setStarsAutoRenew,createSupport,enabled,accountHTML,userToolsHTML,loadProfileData,loadNotifications,deliverSystemNotifications,click,schedule,sync,isIn:()=>!!session,changePasswordPrompt,startGoogleSignIn,acceptOAuthCallback,checkAccountStatus,deleteOwnAccount};
})();

// Netlify production redeploy trigger: email confirmation redirects to the public site.
