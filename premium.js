/* ARVEX PREMIUM UI — все административные действия выполняются защищёнными Supabase RPC. */
(function(){
 const $ = id => document.getElementById(id);
 const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt = v => v ? new Date(v).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"}) : "Навсегда";
 let observer, busy=false, admin=false, currentUser=null, lastQuery="";
 async function rpc(name,args={}){
  if(!window.Cloud || !Cloud.isIn()) throw new Error("Сначала войди в облачный аккаунт.");
  return Cloud.rpc(name,args);
 }
 async function loadStatus(){
  const host=$("premiumStatus"); if(!host) return;
  try{
   const rows=await rpc("arvex_my_premium");
   const s=Array.isArray(rows)?rows[0]:null;
   host.innerHTML=s&&s.is_active
    ? '<span class="tag long">PREMIUM АКТИВЕН</span><p class="note">'+(s.is_forever?"Доступ навсегда":"Действует до "+esc(fmt(s.expires_at)))+'</p>'
    : '<span class="tag short">PREMIUM НЕ АКТИВЕН</span><p class="note">После проверки перевода владелец сможет открыть доступ.</p>';
  }catch(e){host.innerHTML='<p class="note">Статус появится после входа в облачный аккаунт и настройки базы.</p>';}
 }
 function cardHTML(){
  return '<section class="card" id="premiumCard"><div class="card-title">ARVEX PREMIUM <span class="badge">100 ⭐ / 30 дней</span></div><div id="premiumStatus"><p class="muted">Проверяем подписку…</p></div><p class="note">Для покупки напиши владельцу и отправь 100 Telegram Stars. Доступ включается вручную после проверки платежа.</p><a class="primary" style="display:block;text-align:center;text-decoration:none" href="https://t.me/mrasulv" target="_blank" rel="noopener">Купить / продлить в Telegram · @mrasulv</a></section><section class="card" id="premiumAdmin"><div class="card-title">Администрирование PREMIUM</div><div id="premiumAdminBody"><p class="muted">Проверяем права администратора…</p></div></section>';
 }
 function mount(){
  const box=$("profileBody"); if(!box || !Cloud || !Cloud.enabled()) return;
  let card=$("premiumCard");
  if(!card){box.insertAdjacentHTML("beforeend",cardHTML());loadStatus();checkAdmin();}
 }
 async function checkAdmin(){
  const host=$("premiumAdminBody");if(!host)return;
  try{
   const yes=await rpc("arvex_admin_is_admin");
   admin=yes===true;
   if(!admin){$("premiumAdmin")?.remove();return;}
   host.innerHTML='<p class="muted">Поиск пользователей по email или UUID. Можно выдать 30, 90, 365 дней или навсегда.</p><div class="chat-input"><input class="field" id="premiumSearch" placeholder="Email или UUID"><button id="premiumFind">Найти</button></div><div id="premiumResults" class="premium-results"><p class="note">Введи email пользователя.</p></div>';
  }catch(e){$("premiumAdmin")?.remove();}
 }
 async function search(){
  const q=($("premiumSearch")?.value||"").trim();lastQuery=q;
  const out=$("premiumResults");if(!out)return;
  out.innerHTML='<p class="muted">Ищем…</p>';
  try{
   const rows=await rpc("arvex_admin_search_users",{p_query:q});
   if(!rows?.length){out.innerHTML='<p class="empty">Пользователи не найдены.</p>';return;}
   out.innerHTML=rows.map(u=>'<div class="premium-user"><div><b>'+esc(u.email||"Без email")+'</b><small>'+esc(u.user_id)+'</small><small>'+(u.is_active?(u.is_forever?"PREMIUM · навсегда":"PREMIUM до "+esc(fmt(u.expires_at))):"Без активной подписки")+'</small></div><div class="premium-actions"><select class="field" data-plan="'+esc(u.user_id)+'"><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">365 дней</option><option value="forever">Навсегда</option></select><button class="primary" data-grant="'+esc(u.user_id)+'">Выдать</button>'+(u.is_active?'<button class="danger" data-revoke="'+esc(u.user_id)+'">Отключить</button>':'')+'</div></div>').join("");
  }catch(e){out.innerHTML='<p class="note">Ошибка: '+esc(e.message)+'</p>';}
 }
 async function action(kind,id){
  if(busy)return;busy=true;
  try{
   if(kind==="grant"){
    const plan=$('premiumAdmin').querySelector('[data-plan="'+CSS.escape(id)+'"]').value;
    await rpc("arvex_admin_set_subscription",{p_user_id:id,p_days:plan==="forever"?30:Number(plan),p_forever:plan==="forever"});
    if(window.showToast)showToast("PREMIUM выдан.");
   }else{
    if(!confirm("Отключить PREMIUM этому пользователю?"))return;
    await rpc("arvex_admin_revoke_subscription",{p_user_id:id});
    if(window.showToast)showToast("Доступ отключён.");
   }
   await search();await loadStatus();
  }catch(e){alert(e.message);}
  finally{busy=false;}
 }
 document.addEventListener("click",e=>{
  if(e.target.closest("#premiumFind"))search();
  const g=e.target.closest("[data-grant]");if(g)action("grant",g.dataset.grant);
  const r=e.target.closest("[data-revoke]");if(r)action("revoke",r.dataset.revoke);
  if(e.target.closest("#cloudIn")||e.target.closest("#cloudUp"))setTimeout(()=>{mount();loadStatus();checkAdmin()},900);
 });
 document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="premiumSearch")search();});
 window.addEventListener("DOMContentLoaded",()=>{
  const target=$("profileBody");if(target){observer=new MutationObserver(()=>{if(document.getElementById("screen-profile")?.classList.contains("active"))mount();});observer.observe(target,{childList:true});}
  mount();
 });
 window.addEventListener("arvex:cloud-auth",()=>{mount();loadStatus();checkAdmin();});
})();
