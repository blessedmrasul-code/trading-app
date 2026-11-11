// Настройки платного доступа. Оба способа оплаты выключены до подключения сервера и проверки оферты.
window.ARVEX_SHOP=window.ARVEX_SHOP||{
  enabled:false,       // legacy one-time request flow; keep disabled
  starsEnabled:false,  // включить только после настройки Supabase Edge Functions и Telegram webhook
  stars:120,           // цена подписки в Telegram Stars
  subscriptionDays:30,
  price:990,
  promoPrice:490,
  telegram:"mrasulv",
  payNote:"",
  lockedFeatures:[]
};
