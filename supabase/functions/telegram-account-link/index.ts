const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
function key(name:string,legacy:string){const old=Deno.env.get(legacy);if(old)return old;try{return JSON.parse(Deno.env.get(name)||"{}").default||""}catch{return ""}}
async function admin(path:string,init:RequestInit={}){const base=Deno.env.get("SUPABASE_URL")!,secret=key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");const r=await fetch(base+"/rest/v1/"+path,{...init,headers:{apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json",...(init.headers||{})}});if(!r.ok)throw new Error("Database request failed");return r.status===204?null:await r.json()}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);try{
 const auth=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!auth)return json({error:"Войди в ARVEX."},401);
 const base=Deno.env.get("SUPABASE_URL")!,pub=key("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
 const u=await fetch(base+"/auth/v1/user",{headers:{apikey:pub,Authorization:"Bearer "+auth}});if(!u.ok)return json({error:"Сессия истекла."},401);const user=await u.json();if(!user.id)return json({error:"Не удалось подтвердить аккаунт."},401);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
 await admin("arvex_telegram_link_tokens",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({token_hash:digest,user_id:user.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()})});
 return json({url:"https://t.me/ArvexPremiumBot?start=link_"+token,expires_in_minutes:10});
}catch(e){console.error(e);return json({error:"Не удалось создать ссылку привязки."},500)}});