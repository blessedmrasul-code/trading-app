// Настройки платного доступа ARVEX.
// Telegram Stars checkout is enabled: invoice creation requires a signed-in
// Supabase account; Premium is granted only by the verified Telegram webhook.
window.ARVEX_SHOP=window.ARVEX_SHOP||{
  enabled:false,
  starsEnabled:true,
  stars:120,
  subscriptionDays:30,
  price:990,
  promoPrice:490,
  telegram:"mrasulv",
  payNote:"",
  lockedFeatures:["pro_analytics","pro_risk_lab","pro_journal","pro_watchlist","pro_market_review"]
};
