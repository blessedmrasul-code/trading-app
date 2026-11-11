// Настройки платного доступа. Пока enabled:false — в приложении показывается только «скоро».
// Включай (enabled:true) только после оформления самозанятости/ИП и заполнения оферты (offer.html).
window.ARVEX_SHOP=window.ARVEX_SHOP||{
  enabled:false,
  starsEnabled:false, // включить только после настройки Supabase Edge Functions и Telegram webhook
  stars:120,          // цена подписки в Telegram Stars
  subscriptionDays:30,
  price:990,          // обычная цена, ₽, разовый платёж навсегда
  promoPrice:490,     // цена по акции для первых покупателей (0 — без акции)
  telegram:"mrasulv",  // твой Telegram без @, например "mrasulv"
  payNote:"",         // как платить: показывается покупателю ПОСЛЕ заявки. Например: "СБП по номеру +7 900 000-00-00 (Т-Банк), получатель Имя Ф.
В комментарии укажи свой Telegram." Никогда не проси CVV и коды из СМС.
  lockedFeatures:[]   // что закрыто без доступа: например ["exam-advanced"]. Пусто = ничего не закрыто
};
