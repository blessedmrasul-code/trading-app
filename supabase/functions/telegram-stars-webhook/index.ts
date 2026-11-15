// Telegram Stars webhook for ARVEX.
// Payment activation is processed atomically by a service-role-only Postgres RPC.
const botToken = () => Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const webhookSecret = () => Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const serviceKey = () => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { return ""; }
};
const dbUrl = () => Deno.env.get("SUPABASE_URL") || "";

async function db(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  if (!key || !dbUrl()) throw new Error("Supabase service credentials are missing");
  const response = await fetch(`${dbUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return body;
}

let webhookConfigured = false;
async function ensureWebhook() {
  if (webhookConfigured) return;
  const base = dbUrl().endsWith("/") ? dbUrl().slice(0, -1) : dbUrl();
  await telegram("setWebhook", {
    url: base + "/functions/v1/telegram-stars-webhook",
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
  });
  webhookConfigured = true;
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram API error: ${method}`);
  return result.result;
}

async function getIntent(payload: string) {
  const rows = await db(
    `telegram_payment_intents?invoice_payload=eq.${encodeURIComponent(payload)}&select=id,user_id,stars_amount,currency,status,period_days&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function answerPreCheckout(query: any) {
  let valid = false;
  try {
    const intent = await getIntent(String(query.invoice_payload || ""));
    let banned = false;
    if (intent?.user_id) {
      const bans = await db(`arvex_user_bans?user_id=eq.${encodeURIComponent(intent.user_id)}&select=user_id&limit=1`);
      banned = Array.isArray(bans) && bans.length > 0;
    }
    valid = !!intent && !banned &&
      intent.status === "pending" &&
      intent.currency === query.currency &&
      Number(intent.stars_amount) === Number(query.total_amount) &&
      query.currency === "XTR";
  } catch (error) {
    console.error("pre-checkout validation failed:", error);
  }
  await telegram("answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id,
    ok: valid,
    ...(!valid ? { error_message: "Счёт недействителен или уже оплачен. Создайте новый платёж в ARVEX." } : {}),
  });
}

async function applySuccessfulPayment(message: any) {
  const payment = message?.successful_payment;
  if (!payment || payment.currency !== "XTR" || !payment.telegram_payment_charge_id) {
    throw new Error("Invalid Telegram Stars payment object");
  }

  const paidAt = new Date((Number(message.date) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const intent = await getIntent(String(payment.invoice_payload || ""));
  const days = Number(intent?.period_days || 30);
  const telegramExpiry = Number(payment.subscription_expiration_date || 0);
  const expiresAt = telegramExpiry > 0 && days === 30
    ? new Date(telegramExpiry * 1000).toISOString()
    : new Date(new Date(paidAt).getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  // Locks the invoice row, validates status/amount, inserts the unique charge,
  // marks the intent paid and grants Premium in one database transaction.
  await db("rpc/arvex_process_stars_payment", {
    method: "POST",
    body: JSON.stringify({
      p_invoice_payload: String(payment.invoice_payload || ""),
      p_charge_id: String(payment.telegram_payment_charge_id),
      p_telegram_user_id: message.from?.id || null,
      p_stars_amount: Number(payment.total_amount),
      p_currency: String(payment.currency),
      p_is_recurring: !!payment.is_recurring,
      p_is_first_recurring: !!payment.is_first_recurring,
      p_expires_at: expiresAt,
      p_paid_at: paidAt,
    }),
  });

  // A longer one-time plan must not leave an older 30-day Telegram renewal running.
  if (intent?.user_id && !(days === 30 && payment.is_recurring)) {
    try {
      const recurring = await db(
        `telegram_star_payments?user_id=eq.${encodeURIComponent(intent.user_id)}&is_first_recurring=eq.true&refunded_at=is.null&select=telegram_user_id,telegram_payment_charge_id&order=created_at.asc&limit=1`,
      );
      if (Array.isArray(recurring) && recurring[0]?.telegram_user_id && recurring[0]?.telegram_payment_charge_id) {
        await telegram("editUserStarSubscription", {
          user_id: recurring[0].telegram_user_id,
          telegram_payment_charge_id: recurring[0].telegram_payment_charge_id,
          is_canceled: true,
        });
      }
    } catch (error) {
      console.error("Could not cancel previous Stars renewal after one-time plan:", error);
    }
  }
}

async function applyRefund(message: any) {
  const refund = message?.refunded_payment;
  if (!refund?.telegram_payment_charge_id) throw new Error("Invalid refunded Stars payment");
  const charge = encodeURIComponent(refund.telegram_payment_charge_id);
  const rows = await db(
    `telegram_star_payments?telegram_payment_charge_id=eq.${charge}&select=id,user_id,intent_id,telegram_user_id`,
  );
  const payment = Array.isArray(rows) ? rows[0] : null;
  if (!payment) throw new Error("Refund does not match a recorded ARVEX payment");

  const intents = await db(
    `telegram_payment_intents?id=eq.${encodeURIComponent(payment.intent_id)}&select=invoice_payload&limit=1`,
  );
  if (!Array.isArray(intents) || intents[0]?.invoice_payload !== refund.invoice_payload) {
    throw new Error("Refund payload does not match the original invoice");
  }

  await db(`telegram_star_payments?id=eq.${encodeURIComponent(payment.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ refunded_at: new Date().toISOString() }),
  });

  const current = await db(
    `arvex_subscriptions?user_id=eq.${encodeURIComponent(payment.user_id)}&select=is_forever&limit=1`,
  );
  if (current?.[0]?.is_forever === true) return;

  const remaining = await db(
    `telegram_star_payments?user_id=eq.${encodeURIComponent(payment.user_id)}&refunded_at=is.null&expires_at=not.is.null&select=expires_at&order=expires_at.desc&limit=1`,
  );
  const expiresAt = Array.isArray(remaining) && remaining[0]?.expires_at
    ? remaining[0].expires_at
    : new Date().toISOString();

  await db(`arvex_subscriptions?user_id=eq.${encodeURIComponent(payment.user_id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      expires_at: expiresAt, is_forever: false, auto_renew: false,
      updated_at: new Date().toISOString(),
    }),
  });

  try {
    const first = await db(
      `telegram_star_payments?user_id=eq.${encodeURIComponent(payment.user_id)}&is_first_recurring=eq.true&select=telegram_user_id,telegram_payment_charge_id&order=created_at.asc&limit=1`,
    );
    if (Array.isArray(first) && first[0]?.telegram_user_id && first[0]?.telegram_payment_charge_id) {
      await telegram("editUserStarSubscription", {
        user_id: first[0].telegram_user_id,
        telegram_payment_charge_id: first[0].telegram_payment_charge_id,
        is_canceled: true,
      });
    }
  } catch (error) {
    console.error("Could not cancel refunded subscription renewal:", error);
  }
}


async function sendMainMenu(chatId:number, userName="") {
  const body = "Добро пожаловать в ARVEX Premium!\n\nВыбери способ оплаты:\n⭐ Telegram Stars — оплата прямо в этом боте.\n💵 USDT TRC20 — безопасное оформление персонального счёта на сайте ARVEX.\n\nПосле подтверждения платежа Premium активируется автоматически.";
  await telegram("sendMessage", { chat_id:chatId, text:body, reply_markup:{inline_keyboard:[
    [{text:"⭐ Купить через Telegram Stars",callback_data:"method_stars" }],
    [{text:"💵 Купить через USDT TRC20",callback_data:"method_usdt"}],
    [{text:"👤 Мой кабинет",callback_data:"my_cabinet"}],
    [{text:"🎁 Пригласить друзей",callback_data:"my_invite"}],
    [{text:"Поддержка · @mrasulv",url:"https://t.me/mrasulv"}]
  ]}});
}
async function linkedAccount(telegramId:number) {
  const rows=await db(`arvex_telegram_accounts?telegram_user_id=eq.${telegramId}&select=user_id&limit=1`);
  return Array.isArray(rows)&&rows[0]?String(rows[0].user_id):null;
}
async function showPlans(chatId:number,method:"stars"|"usdt") {
  const days=[30,90,365];
  const labels=method==="stars"?{30:"120 ⭐ · 30 дней",90:"360 ⭐ · 90 дней",365:"1300 ⭐ · 365 дней"}:{30:"3 USDT · 30 дней",90:"9 USDT · 90 дней",365:"32 USDT · 365 дней"};
  await telegram("sendMessage",{chat_id:chatId,text:method==="stars"?"Выбери срок Premium для оплаты Telegram Stars:":"Выбери срок Premium для оплаты USDT TRC20:",reply_markup:{inline_keyboard:[
    ...days.map(d=>[{text:labels[d as 30|90|365],callback_data:method+"_"+d}]),
    [{text:"⬅️ Назад",callback_data:"main_menu"}]
  ]}});
}
async function createBotStarsInvoice(chatId:number,telegramId:number,days:number) {
  const userId=await linkedAccount(telegramId);
  if(!userId){await telegram("sendMessage",{chat_id:chatId,text:"Чтобы привязать оплату к аккаунту ARVEX, сначала войди в приложение, открой Профиль → Аккаунт → «Привязать Telegram», затем вернись сюда и нажми «Мой кабинет»."});return}
  const ban=await db(`arvex_user_bans?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
  if(Array.isArray(ban)&&ban.length){await telegram("sendMessage",{chat_id:chatId,text:"Этот аккаунт ARVEX ограничен. Обратись в поддержку @mrasulv."});return}
  const plans:Record<number,number>={30:120,90:360,365:1300};const stars=plans[days];if(!stars)throw new Error("Invalid plan");
  const payload="arvex_"+crypto.randomUUID();
  await db("telegram_payment_intents",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:userId,invoice_payload:payload,stars_amount:stars,currency:"XTR",status:"pending",period_days:days})});
  const invoice=await fetch(`https://api.telegram.org/bot${botToken()}/createInvoiceLink`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"ARVEX Premium",description:"Доступ к ARVEX на "+days+" дней.",payload,provider_token:"",currency:"XTR",prices:[{label:"ARVEX Premium · "+days+" дней",amount:stars}],...(days===30?{subscription_period:2592000}:{})})}).then(r=>r.json());
  if(!invoice.ok||typeof invoice.result!=="string")throw new Error("Could not create Stars invoice");
  await telegram("sendMessage",{chat_id:chatId,text:"Персональный счёт готов: "+stars+" ⭐ за "+days+" дней. После успешной оплаты Premium активируется автоматически.",reply_markup:{inline_keyboard:[[{text:"Оплатить "+stars+" ⭐",url:invoice.result}],[{text:"⬅️ В меню",callback_data:"main_menu"}]]}});
}
async function showCabinet(chatId:number,telegramId:number) {
  const userId=await linkedAccount(telegramId);
  if(!userId){await telegram("sendMessage",{chat_id:chatId,text:"Аккаунт ARVEX ещё не привязан. Войди в приложение → Профиль → Аккаунт → «Привязать Telegram», затем нажми здесь «Мой кабинет»."});return}
  const [subs,refs,codes]=await Promise.all([
    db(`arvex_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=is_forever,expires_at&limit=1`),
    db(`arvex_referrals?referrer_user_id=eq.${encodeURIComponent(userId)}&select=status&limit=1000`),
    db(`arvex_referral_codes?user_id=eq.${encodeURIComponent(userId)}&select=code&limit=1`)
  ]);
  const sub=subs?.[0],active=!!sub&&(sub.is_forever===true||(sub.expires_at&&Date.parse(sub.expires_at)>Date.now()));
  const invited=Array.isArray(refs)?refs.length:0;
  const paid=Array.isArray(refs)?refs.filter((x:any)=>x.status==="rewarded").length:0;
  const code=codes?.[0]?.code||"";
  const link="https://blessedmrasul-code.github.io/trading-app/app/?ref="+encodeURIComponent(code);
  const expiry=sub?.is_forever?"Бессрочно":sub?.expires_at?new Date(sub.expires_at).toLocaleDateString("ru-RU"):"—";
  const textBody="👤 Мой кабинет ARVEX\n\nПодписка: "+(active?"✅ Premium активен":"⚪ Premium не оформлена")+"\nДействует до: "+(active?expiry:"—")+"\n\n👥 Приглашено пользователей: "+invited+"\n⭐ Приглашённых с оплатой: "+paid+"\n\n🎁 Реферальная ссылка:\n"+link+"\n\nЗа первую успешную оплату приглашённого начисляется 7 бонусных дней Premium.";
  await telegram("sendMessage",{chat_id:chatId,text:textBody,reply_markup:{inline_keyboard:[[{text:"📋 Скопировать ссылку",copy_text:{text:link}}],[{text:"⬅️ В меню",callback_data:"main_menu"}]]}});
}
async function handleCallback(q:any) {
  const chatId=Number(q.message?.chat?.id),telegramId=Number(q.from?.id),data=String(q.data||"");
  await telegram("answerCallbackQuery",{callback_query_id:q.id});
  if(data==="main_menu"){await sendMainMenu(chatId);return}
  if(data==="method_stars"){await showPlans(chatId,"stars");return}
  if(data==="method_usdt"){await showPlans(chatId,"usdt");return}
  if(data==="my_cabinet"){await showCabinet(chatId,telegramId);return}
  if(data==="my_invite"){await showCabinet(chatId,telegramId);return}
  const plan=data.match(/^(stars|usdt)_(30|90|365)$/);
  if(plan){
    const method=plan[1],days=Number(plan[2]);
    if(method==="stars"){await createBotStarsInvoice(chatId,telegramId,days);return}
    const url="https://blessedmrasul-code.github.io/trading-app/subscribe.html?method=usdt&days="+days;
    await telegram("sendMessage",{chat_id:chatId,text:"Оформление USDT TRC20 на "+days+" дней. Открой персональную страницу оплаты, войди в ARVEX и создай счёт. После подтверждения перевода Premium включится автоматически.",reply_markup:{inline_keyboard:[[{text:"💵 Перейти к оплате USDT",url}],[{text:"⬅️ В меню",callback_data:"main_menu"}]]}});
  }
}
async function handleBotCommand(message:any) {
  const text=String(message?.text||"").trim();
  const match=text.match(/^\/(start|help|premium|support|cabinet)(?:@\w+)?(?:\s+([^\s]+))?/i);
  if(!match||!message?.chat?.id)return;
  const command=match[1].toLowerCase(),payload=command==="start"?String(match[2]||""):"";
  if(payload.startsWith("arvex_")){
    const intent=await getIntent(payload),days=Number(intent?.period_days||30),planStars:Record<number,number>={30:120,90:360,180:680,365:1300};
    if(!intent||intent.status!=="pending"||Number(intent.stars_amount)!==planStars[days]||intent.currency!=="XTR"){await telegram("sendMessage",{chat_id:message.chat.id,text:"Ссылка на оплату недействительна или устарела. Создай новый счёт в ARVEX."});return}
    const invoice=await fetch(`https://api.telegram.org/bot${botToken()}/createInvoiceLink`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"ARVEX Premium",description:"Доступ к ARVEX на "+days+" дней.",payload,provider_token:"",currency:"XTR",prices:[{label:"ARVEX Premium · "+days+" дней",amount:Number(intent.stars_amount)}],...(days===30?{subscription_period:2592000}:{})})}).then(r=>r.json());
    if(!invoice.ok)throw new Error("Could not create invoice");
    await telegram("sendMessage",{chat_id:message.chat.id,text:"Твой персональный счёт готов: "+Number(intent.stars_amount)+" ⭐ за "+days+" дней.",reply_markup:{inline_keyboard:[[{text:"Оплатить "+Number(intent.stars_amount)+" ⭐",url:invoice.result}]]}});return;
  }
  if(payload.startsWith("link_")){
    const token=payload.slice(5),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
    const rows=await db(`arvex_telegram_link_tokens?token_hash=eq.${digest}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`);
    if(!Array.isArray(rows)||!rows[0]){await telegram("sendMessage",{chat_id:message.chat.id,text:"Ссылка привязки истекла или уже использована. Создай новую ссылку в приложении ARVEX."});return}
    const userId=String(rows[0].user_id);
    await db("arvex_telegram_accounts?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,telegram_user_id:message.from.id,telegram_username:message.from.username||null,linked_at:new Date().toISOString()})});
    await db(`arvex_telegram_link_tokens?token_hash=eq.${digest}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({used_at:new Date().toISOString()})});
    await telegram("sendMessage",{chat_id:message.chat.id,text:"✅ Telegram успешно привязан к твоему аккаунту ARVEX. Теперь доступны оплата Stars и раздел «Мой кабинет»."});
    await sendMainMenu(message.chat.id);return;
  }
  if(command==="support"){await telegram("sendMessage",{chat_id:message.chat.id,text:"Нужна помощь с ARVEX? Напиши в поддержку: @mrasulv."});return}
  if(command==="cabinet"){await showCabinet(message.chat.id,message.from.id);return}
  await sendMainMenu(message.chat.id);
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = webhookSecret();
  const received = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!expected || received !== expected) return new Response("Unauthorized", { status: 401 });

  try {
    await ensureWebhook();
    const update = await req.json();
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text) {
      await handleBotCommand(update.message);
    } else if (update.pre_checkout_query) {
      await answerPreCheckout(update.pre_checkout_query);
    } else if (update.message?.successful_payment) {
      await applySuccessfulPayment(update.message);
    } else if (update.message?.refunded_payment) {
      await applyRefund(update.message);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("telegram-stars-webhook:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
});
