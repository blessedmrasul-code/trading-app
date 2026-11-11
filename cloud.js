/* ARVEX Cloud: вход по email/паролю и синхронизация прогресса через Supabase (REST).
   Пароль нигде не хранится — только токены сессии. Без настроек работает офлайн. */
const Cloud=(()=>{
 const cfg=()=>window.ARVEX_CLOUD||{};
 const SK="arvex_cloud_session";
 let session=null,timer=null,busy=false,status="";
 try{session=JSON.parse(localStorage.getItem(SK)||"null")}catch(e){}
 const enabled=()=>!!(cfg().url&&cfg().anonKey);
 const keep=s=>{session=s;try{s?localStorage.setItem(SK,JSON.stringify(s)):localStorage.removeItem(SK)}catch(e){}};
 const hdr=(tok)=>({"apikey":cfg().anonKey,"Authorization":"Bearer "+(tok||cfg().anonKey),"Content-Type":"application/json"});
 async function req(path,opt){
  const r=await fetch(cfg().url.replace(/\/$/,"")+path,opt);
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&(j.msg||j.error_description||j.message||j.error))||("HTTP "+r.status));
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
  const j=await req("/auth/v1/signup",{method:"POST",headers:hdr(),body:JSON.stringify({email,password:pw})});
  if(adopt(j))return {ok:true};
  return {ok:false,confirm:true}; // включено подтверждение почты
 }
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
 function accountHTML(){
  if(!enabled())return `<p class="muted" style="margin:0">Сейчас профиль хранится на этом устройстве.</p><div class="soon">🔒 Облачные аккаунты подключаются владельцем проекта (см. README → «Облако»).</div>`;
  if(session)return `<p style="margin:0 0 8px">Вход выполнен: <b>${esc(session.email)}</b></p><p class="muted" style="margin:0 0 10px">${esc(status||"Прогресс синхронизируется автоматически.")}</p><div class="btn-row"><button class="ghost" id="cloudSync">↻ Синхронизировать</button><button class="danger" id="cloudOut">Выйти</button></div>`;
  return `<p class="muted" style="margin:0 0 10px">Войди, чтобы сохранить прогресс в облаке и открыть его на другом устройстве.</p><input class="field" id="cEmail" type="email" placeholder="Email" autocomplete="email"><input class="field" id="cPass" type="password" placeholder="Пароль (от 8 символов)" autocomplete="current-password" style="margin-top:8px"><div class="btn-row" style="margin-top:10px"><button class="primary" id="cloudIn">Войти</button><button class="ghost" id="cloudUp">Регистрация</button></div><p class="muted" id="cloudMsg" style="margin:8px 0 0"></p>`;
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
  if(t.closest("#cloudSync")){sync();return true}
  if(t.closest("#cloudOut")){signOut();renderProfile();return true}
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
  const rows=await req(`/rest/v1/entitlements?user_id=eq.${session.uid}&select=plan,expires_at,auto_renew`,{headers:hdr(tok)});
  return rows&&rows[0]?rows[0]:null;
 }
 return {insertOrder,myEntitlement,createStarsInvoice,setStarsAutoRenew,enabled,accountHTML,click,schedule,sync,isIn:()=>!!session};
})();
