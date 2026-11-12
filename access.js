/* ARVEX Access: заявка на доступ и серверная проверка entitlement. Локальный флаг Premium не используется. */
const Access=(()=>{
 const shop=()=>window.ARVEX_SHOP||{};
 let entitlement=null;
 const price=()=>{const s=shop();return s.promoPrice>0&&s.promoPrice<s.price?s.promoPrice:s.price};
 const isPremium=()=>{
  if(!entitlement)return false;
  const plan=String(entitlement.plan||"").toLowerCase();
  if(plan==="lifetime")return !entitlement.expires_at;
  if(!["monthly","premium"].includes(plan)||!entitlement.expires_at)return false;
  const expiry=Date.parse(entitlement.expires_at);
  return Number.isFinite(expiry)&&expiry>Date.now();
 };
 const locked=f=>!!((shop().enabled||shop().starsEnabled)&&(shop().lockedFeatures||[]).includes(f)&&!isPremium());
 function syncFooterCTA(){
  const link=document.getElementById("subscribeFooterLink"),status=document.getElementById("footerPremiumStatus");
  const active=isPremium();
  if(link)link.hidden=active;
  if(status)status.hidden=!active;
 }
 function contactHTML(){
  return `<div class="btn-row" style="margin-top:12px"><a class="ghost" href="https://t.me/ArvexPremiumBot" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Открыть бота @ArvexPremiumBot</a><a class="ghost" href="https://t.me/mrasulv?text=Здравствуйте!%20Хочу%20оформить%20ARVEX%20Premium." target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Написать @mrasulv</a></div>`;
 }
 function cardHTML(){
  const s=shop();
  if(isPremium()){
   const lifetime=String(entitlement.plan||"").toLowerCase()==="lifetime";
   const until=lifetime?"Пожизненный доступ активирован. Спасибо, что поддерживаешь проект!":`Подписка активна до ${new Date(entitlement.expires_at).toLocaleDateString("ru-RU")}.`;
   const renew=lifetime?"":`<p class="muted" style="margin:6px 0 0">${entitlement.auto_renew===false?"Автопродление отключено.":"Автопродление включено через Telegram Stars."}</p><button class="ghost" id="accStarsToggle" style="margin-top:10px">${entitlement.auto_renew===false?"Включить автопродление":"Отключить автопродление"}</button>`;
   return `<div class="card"><div class="card-title">Доступ <span class="badge">Premium</span></div><p style="margin:0">${until}</p>${renew}<p class="muted" id="accStarsMsg" style="margin:8px 0 0"></p></div>`;
  }
  if(s.starsEnabled){
   if(typeof Cloud==="undefined"||!Cloud.enabled())return `<div class="card"><div class="card-title">ARVEX Premium</div><p class="muted" style="margin:0 0 8px">Автоматическая оплата — через Telegram-бота. Если нужна помощь, напиши владельцу.</p>${contactHTML()}</div>`;
   if(!Cloud.isIn())return `<div class="card"><div class="card-title">ARVEX Premium</div><p class="muted" style="margin:0 0 8px">Войди в аккаунт ARVEX, чтобы получить персональный счёт и привязать Premium к своему профилю. Можно также обратиться напрямую.</p>${contactHTML()}</div>`;
   return `<div class="card"><div class="card-title">ARVEX Premium</div><p style="margin:0 0 8px"><b>${Number(s.stars)||120} ⭐ / 30 дней</b> · автоматическое продление через Telegram Stars. Управляй автопродлением здесь или в Telegram.</p><div class="btn-row"><button class="primary" id="accStarsBuy">Оплатить 120 ⭐</button><button class="ghost" id="accStarsCheck">Проверить доступ</button></div>${contactHTML()}<p class="muted" id="accStarsMsg" style="margin:8px 0 0"></p></div>`;
  }
  if(!s.enabled&&!s.starsEnabled){const stars=Number(s.stars)||120,days=Number(s.subscriptionDays)||30,tg=String(s.telegram||"mrasulv").replace(/^@/,"");return `<div class="card"><div class="card-title">ARVEX Premium</div><p style="margin:0 0 8px"><b>${stars} ⭐ / ${days} дней</b> · оплата Telegram Stars напрямую администратору.</p><button class="primary" id="accManualStars">Купить подписку</button><p class="muted" style="margin:8px 0 0">После подтверждения оплаты доступ будет активирован вручную.</p></div>`;}
  const old=s.promoPrice>0&&s.promoPrice<s.price?` <s class="muted">${s.price} ₽</s>`:"";
  return `<div class="card"><div class="card-title">Premium</div><p style="margin:0 0 8px">Разовая оплата <b>${price()} ₽</b>${old} — доступ навсегда, без подписок и автопродления.</p><div class="btn-row"><button class="primary" id="accBuy">Получить доступ</button><button class="ghost" id="accOffer">Оферта</button></div></div>`;
 }
 function formHTML(){
  const s=shop();
  return `<h3 style="margin:0 0 6px">Заявка на доступ</h3><p class="muted" style="margin:0 0 10px">Цена: <b>${price()} ₽</b> разово, навсегда. Оставь контакты — я свяжусь, отправлю реквизиты и файл приложения.</p>
  <input class="field" id="accTg" placeholder="Telegram (@username)" autocomplete="off"><input class="field" id="accDev" placeholder="Устройство (напр. Redmi Note 12)" style="margin-top:8px"><input class="field" id="accMail" type="email" placeholder="Email (необязательно)" style="margin-top:8px">
  <label class="muted" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px"><input type="checkbox" id="accOk" style="width:auto;margin-top:2px"><span>Я ознакомлен с <a href="offer.html" target="_blank" rel="noopener" style="color:var(--purple2)">офертой</a>. Приложение образовательное, сделки виртуальные, прибыль не гарантируется.</span></label>
  <div class="btn-row" style="margin-top:12px"><button class="primary" id="accSend">Отправить заявку</button>${s.telegram?`<button class="ghost" id="accTgBtn">Написать в Telegram</button>`:""}</div><p class="muted" id="accMsg" style="margin:8px 0 0"></p>`;
 }
 function read(){
  const tg=($("accTg").value||"").trim().replace(/^@/,""),dev=($("accDev").value||"").trim().slice(0,60),mail=($("accMail").value||"").trim().slice(0,100);
  const m=$("accMsg");
  if(!/^[A-Za-z0-9_]{5,32}$/.test(tg)){m.textContent="Telegram: 5–32 символов, латиница, цифры, _";return null}
  if(dev.length<2){m.textContent="Укажи устройство.";return null}
  if(mail&&!/^\S+@\S+\.\S+$/.test(mail)){m.textContent="Проверь email.";return null}
  if(!$("accOk").checked){m.textContent="Подтверди, что ознакомился с офертой.";return null}
  return {tg,dev,mail};
 }
 async function send(){
  const d=read();if(!d)return;const m=$("accMsg");
  const cfg=window.ARVEX_CLOUD||{};
  if(!(cfg.url&&cfg.anonKey)){tgOpen(d);m.textContent="Сервер заявок не подключён. Открываю Telegram с готовым сообщением.";return}
  m.textContent="Отправляю…";
  try{
   const r=await Cloud.insertOrder({tg:d.tg,device:d.dev,email:d.mail||null,price:price()});
   const note=(shop().payNote||"").trim();
   m.innerHTML="✅ Заявка отправлена. Я напишу тебе в Telegram."+(note?`<br><br><b>Как оплатить:</b><br>${esc(note).replace(/\n/g,"<br>")}<br><span class="muted">После оплаты пришлю чек.</span>`:"");
   $("accSend").disabled=true;void r;
  }catch(e){m.textContent="Не удалось отправить: "+e.message+". Можно написать в Telegram."}
 }
 function tgOpen(d){
  const s=shop();if(!s.telegram)return;
  d=d||read();if(!d)return;
  const text=`Здравствуйте! Хочу доступ к ARVEX (${price()} ₽). Мой Telegram: @${d.tg}. Устройство: ${d.dev}.`;
  window.open(`https://t.me/${encodeURIComponent(s.telegram)}?text=${encodeURIComponent(text)}`,"_blank","noopener");
 }
 async function buyStars(){
  const b=document.getElementById("accStarsBuy"),m=document.getElementById("accStarsMsg");
  const paymentWindow=window.open("about:blank","_blank");
  if(b){b.disabled=true;b.textContent="Создаю счёт…"}
  if(m)m.textContent="";
  try{
   if(typeof Cloud==="undefined"||!Cloud.createStarsInvoice)throw new Error("Облачный сервер не подключён.");
   const result=await Cloud.createStarsInvoice();
   if(result.lifetime){if(paymentWindow)paymentWindow.close();await refresh();return}
   if(!result.url)throw new Error("Telegram не вернул ссылку на оплату.");
   if(paymentWindow)paymentWindow.location.href=result.url;else window.location.href=result.url;
   if(m)m.textContent="Счёт открыт в Telegram. После оплаты вернись сюда и нажми «Проверить доступ».";
  }catch(e){if(paymentWindow)paymentWindow.close();if(m)m.textContent=e.message}
  finally{if(b){b.disabled=false;b.textContent="Оформить подписку"}}
 }
 async function toggleStarsRenew(){
  const enabled=entitlement?.auto_renew===false;
  const b=document.getElementById("accStarsToggle"),m=document.getElementById("accStarsMsg");
  if(b){b.disabled=true;b.textContent="Сохраняю…"}
  try{
   if(typeof Cloud==="undefined"||!Cloud.setStarsAutoRenew)throw new Error("Сервер не подключён.");
   const result=await Cloud.setStarsAutoRenew(enabled);
   await refresh();
   if(m)m.textContent=result.message||"Настройка обновлена.";
  }catch(e){if(m)m.textContent=e.message;if(b)b.disabled=false}
 }
 async function refresh(){
  entitlement=null;
  if(typeof Cloud==="undefined"||!Cloud.isIn()){
   syncFooterCTA();
   if(typeof activeScreen!=="undefined"&&activeScreen==="profile")renderProfile();
   return;
  }
  try{
   const row=await Cloud.myEntitlement();
   entitlement=row||null;
  }catch(e){entitlement=null}
  syncFooterCTA();
  if(typeof activeScreen!=="undefined"&&activeScreen==="profile")renderProfile();
 }
 function click(t){
  if(t.closest("#accManualStars")){const s=shop(),tg=String(s.telegram||"mrasulv").replace(/^@/,""),stars=Number(s.stars)||120,days=Number(s.subscriptionDays)||30;const msg=`Здравствуйте! Хочу оформить ARVEX Premium на ${days} дней за ${stars} Telegram Stars. Подскажите, как оплатить. Мой email аккаунта ARVEX: `;window.open(`https://t.me/${encodeURIComponent(tg)}?text=${encodeURIComponent(msg)}`,"_blank","noopener");return true}
  if(t.closest("#accStarsToggle")){toggleStarsRenew();return true}
  if(t.closest("#accStarsBuy")){buyStars();return true}
  if(t.closest("#accStarsCheck")){refresh();const m=document.getElementById("accStarsMsg");if(m)m.textContent="Проверка завершена. Если платёж только что прошёл, подожди несколько секунд и проверь ещё раз.";return true}
  if(t.closest("#accBuy")){openSheet(formHTML());return true}
  if(t.closest("#accOffer")){window.open("offer.html","_blank","noopener");return true}
  if(t.closest("#accSend")){send();return true}
  if(t.closest("#accTgBtn")){tgOpen();return true}
  return false;
 }
 return {cardHTML,click,refresh,isPremium,locked,price};
})();
