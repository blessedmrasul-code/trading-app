// Настройки платного доступа ARVEX.
// Telegram Stars checkout is enabled: invoice creation requires a signed-in
// Supabase account; Premium is granted only by the verified Telegram webhook.
window.ARVEX_SHOP=window.ARVEX_SHOP||{
  enabled:false,
  starsEnabled:true,
  cryptoEnabled:true,
  cryptoPrice:3,
  cryptoWallet:"TH6guxXKMXgXYdgincWowjTGLjLdPuijtK",
  cryptoNetwork:"TRON",
  stars:120,
  subscriptionDays:30,
  plans:[{days:30,stars:120,usdt:3},{days:90,stars:360,usdt:9},{days:365,stars:1300,usdt:32}],
  price:990,
  promoPrice:490,
  telegram:"mrasulv",
  payNote:"",
  lockedFeatures:["pro_analytics","pro_risk_lab","pro_journal","pro_watchlist","pro_market_review"]
};
