/* ARVEX PREMIUM UI — админ-действия выполняются защищёнными Supabase RPC. */
(function(){
 const $ = id => document.getElementById(id);
 const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt = v => v ? new Date(v).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"}) : "Навсегда";
 let observer, busy=false;
 async function rpc(name,args={}){
  if(!window.Cloud || !Cloud.isIn()) throw new Error("Сначала войди в облачный аккаунт.");
  return Cloud.rpc(name,args);
 }
 async function loadStatus(){
  const host=$("premiumStatus"); if(!host)return;
  try{
   const rows=await rpc("arvex_my_premium"), s=Array.isArray(rows)?rows[0]:null;
   host.innerHTML=s&&s.is_active
    ? '<span class="tag long">PREMIUM АКТИВЕН</span><p class="note">'+(s.is_forever?"Доступ навсегда":"Действует до "+esc(fmt(s.expires_at)))+'</p>'
    : '<span class="tag short">PREMIUM НЕ АКТИВЕН</span><p class="note">После проверки перевода владелец сможет открыть доступ.</p>';
  }catch(e){host.innerHTML='<p class="note">Статус появится после входа в облачный аккаунт.</p>';}
 }
 function cardHTML(){
  return '<section class="card" id="premiumCard"><div class="card-title">ARVEX PREMIUM <span class="badge">100 ⭐ / 30 дней</span></div><div id="premiumStatus"><p class="muted">Проверяем подписку…</p></div><p class="note">Для покупки напиши владельцу и отправь 100 Telegram Stars. Доступ включается вручную после проверки платежа.</p><a class="primary" style="display:block;text-align:center;text-decoration:none" href="https://t.me/mrasulv" target="_blank" rel="noopener">Купить / продлить в Telegram · @mrasulv</a></section><section class="card" id="premiumAdmin"><div class="card-title">Администрирование PREMIUM</div><div id="premiumAdminBody"><p class="muted">Проверяем права администратора…</p></div></section>';
 }
 function mount(){
  const box=$("profileBody"); if(!box || !window.Cloud || !Cloud.enabled())return;
  if(!$("premiumCard")){box.insertAdjacentHTML("beforeend",cardHTML());loadStatus();checkAdmin();}
 }
 async function refreshAdminOverview(){
  const statsHost=$("premiumStats"), historyHost=$("premiumHistory");
  if(!statsHost||!historyHost)return;
  statsHost.innerHTML='<p class="muted">Загружаем статистику…</p>';
  historyHost.innerHTML='<p class="muted">Загружаем историю…</p>';
  try{
   const [statsRows,events]=await Promise.all([rpc("arvex_admin_stats"),rpc("arvex_admin_history",{p_limit:20})]);
   const s=Array.isArray(statsRows)?statsRows[0]:null;
   statsHost.innerHTML=s?'<div class="premium-stat-grid"><div><small>Пользователи</small><b>'+esc(s.total_users)+'</b></div><div><small>Активные</small><b>'+esc(s.active_subscriptions)+'</b></div><div><small>Навсегда</small><b>'+esc(s.forever_subscriptions)+'</b></div><div><small>Истекли</small><b>'+esc(s.expired_subscriptions)+'</b></div><div><small>Операции</small><b>'+esc(s.events_total)+'</b></div></div>':'<p class="muted">Статистика пока недоступна.</p>';
   historyHost.innerHTML=events&&events.length?events.map(e=>'<div class="premium-event"><b>'+(e.action==="grant"?"Выдача":"Отключение")+' · '+esc(e.email||"Без email")+'</b><small>'+esc(e.plan)+' · '+esc(fmt(e.event_at))+'</small><small>Администратор: '+esc(e.admin_email||"—")+'</small></div>').join(""):'<p class="muted">Операций пока нет.</p>';
  }catch(e){
   statsHost.innerHTML='<p class="note">Не удалось загрузить статистику: '+esc(e.message)+'</p>';
   historyHost.innerHTML='<p class="muted">История пока недоступна.</p>';
  }
 }
 async function checkAdmin(){
  const host=$("premiumAdminBody");if(!host)return;
  try{
   const yes=await rpc("arvex_admin_is_admin");
   if(yes!==true){$("premiumAdmin")?.remove();return;}
   host.innerHTML='<div class="card-title">Статистика</div><div id="premiumStats"></div><div class="card-title" style="margin-top:16px">Последние операции <button class="ghost" id="premiumRefresh" type="button">Обновить</button></div><div id="premiumHistory"></div><div class="card-title" style="margin-top:18px">Управление доступом</div><p class="muted">Поиск пользователей по email или UUID. Можно выдать 30, 90, 365 дней или навсегда.</p><div class="chat-input"><input class="field" id="premiumSearch" placeholder="Email или UUID"><button id="premiumFind" type="button">Найти</button></div><div id="premiumResults" class="premium-results"><p class="note">Введи email пользователя.</p></div>';
   await refreshAdminOverview();
  }catch(e){$("premiumAdmin")?.remove();}
 }
 async function search(){
  const q=($("premiumSearch")?.value||"").trim(),out=$("premiumResults");if(!out)return;
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
    const plan=$("premiumAdmin").querySelector('[data-plan="'+CSS.escape(id)+'"]').value;
    await rpc("arvex_admin_set_subscription",{p_user_id:id,p_days:plan==="forever"?30:Number(plan),p_forever:plan==="forever"});
    if(window.showToast)showToast("PREMIUM выдан.");
   }else{
    if(!confirm("Отключить PREMIUM этому пользователю?"))return;
    await rpc("arvex_admin_revoke_subscription",{p_user_id:id});
    if(window.showToast)showToast("Доступ отключён.");
   }
   await Promise.all([search(),loadStatus(),refreshAdminOverview()]);
  }catch(e){alert(e.message);}
  finally{busy=false;}
 }
 document.addEventListener("click",e=>{
  if(e.target.closest("#premiumFind"))search();
  if(e.target.closest("#premiumRefresh"))refreshAdminOverview();
  const g=e.target.closest("[data-grant]");if(g)action("grant",g.dataset.grant);
  const r=e.target.closest("[data-revoke]");if(r)action("revoke",r.dataset.revoke);
  if(e.target.closest("#cloudIn")||e.target.closest("#cloudUp"))setTimeout(()=>{mount();loadStatus();checkAdmin()},900);
 });
 document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="premiumSearch")search();});
 window.addEventListener("DOMContentLoaded",()=>{
  const target=$("profileBody");
  if(target){observer=new MutationObserver(()=>{if(document.getElementById("screen-profile")?.classList.contains("active"))mount();});observer.observe(target,{childList:true});}
  mount();
 });
 window.addEventListener("arvex:cloud-auth",()=>{mount();loadStatus();checkAdmin();});
})();