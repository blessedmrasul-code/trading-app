// Admin-only user bans. The service key never leaves this Edge Function.
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const url=()=>Deno.env.get("SUPABASE_URL")||"";
function key(name:string,legacy:string){if(Deno.env.get(legacy))return Deno.env.get(legacy)!;try{return JSON.parse(Deno.env.get(name)||"{}").default||""}catch{return ""}}
async function request(path:string,init:RequestInit={},secret=false){
 const k=secret?key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"):key("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
 const r=await fetch(url()+path,{...init,headers:{apikey:k,Authorization:init.headers instanceof Headers?init.headers.get("Authorization")||"":String((init.headers as Record<string,string>|undefined)?.Authorization||"Bearer "+k),"Content-Type":"application/json",...(init.headers||{})}});
 const body=await r.json().catch(()=>null);return {ok:r.ok,status:r.status,body};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"",jwt=auth.replace(/^Bearer\s+/i,"");
  if(!jwt||jwt===auth)return json({error:"Требуется вход администратора"},401);
  const publishable=key("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const who=await fetch(url()+"/auth/v1/user",{headers:{apikey:publishable,Authorization:"Bearer "+jwt}});
  if(!who.ok)return json({error:"Сессия истекла"},401);
  const actor=await who.json();
  const admin=await fetch(url()+"/rest/v1/arvex_admins?user_id=eq."+encodeURIComponent(actor.id)+"&select=user_id",{headers:{apikey:key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),Authorization:"Bearer "+key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY")}});
  if(!admin.ok||!(await admin.json()).length)return json({error:"Доступ запрещён"},403);
  const body=await req.json(),userId=String(body.user_id||""),action=String(body.action||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))return json({error:"Некорректный ID пользователя"},400);
  const owner=Deno.env.get("ARVEX_OWNER_USER_ID")||"";
  if(userId===actor.id||userId===owner)return json({error:"Нельзя блокировать владельца или самого себя"},403);
  const targetAdmin=await fetch(url()+"/rest/v1/arvex_admins?user_id=eq."+encodeURIComponent(userId)+"&select=user_id",{headers:{apikey:key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),Authorization:"Bearer "+key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY")}});
  if(!targetAdmin.ok)return json({error:"Не удалось проверить права пользователя"},502);
  if((await targetAdmin.json()).length)return json({error:"Нельзя блокировать администратора"},403);
  if(action!=="ban"&&action!=="unban")return json({error:"Неизвестное действие"},400);
  const reason=String(body.reason||"").trim().slice(0,1000);
  if(action==="ban"&&reason.length<5)return json({error:"Причина должна содержать минимум 5 символов"},400);
  if(action==="ban"){
   const authUpdate=await request("/auth/v1/admin/users/"+encodeURIComponent(userId),{method:"PUT",body:JSON.stringify({ban_duration:"876000h"})},true);
   if(!authUpdate.ok)return json({error:"Supabase Auth не применил блокировку"},502);
   const recorded=await fetch(url()+"/rest/v1/rpc/arvex_admin_record_ban",{method:"POST",headers:{apikey:publishable,Authorization:"Bearer "+jwt,"Content-Type":"application/json"},body:JSON.stringify({p_user_id:userId,p_reason:reason,p_action:"ban"})});
   if(!recorded.ok){await request("/auth/v1/admin/users/"+encodeURIComponent(userId),{method:"PUT",body:JSON.stringify({ban_duration:"none"})},true);return json({error:"Не удалось сохранить причину блокировки"},502)}
  }else{
   const authUpdate=await request("/auth/v1/admin/users/"+encodeURIComponent(userId),{method:"PUT",body:JSON.stringify({ban_duration:"none"})},true);
   if(!authUpdate.ok)return json({error:"Supabase Auth не снял блокировку"},502);
   const recorded=await fetch(url()+"/rest/v1/rpc/arvex_admin_record_ban",{method:"POST",headers:{apikey:publishable,Authorization:"Bearer "+jwt,"Content-Type":"application/json"},body:JSON.stringify({p_user_id:userId,p_reason:"",p_action:"unban"})});
   if(!recorded.ok)return json({error:"Auth разблокирован, но запись блокировки не удалена. Повтори снятие блокировки."},502);
  }
  return json({ok:true,action,user_id:userId,administrator:"Mrasulv"});
 }catch(e){console.error("admin-user-ban",e);return json({error:"Внутренняя ошибка управления блокировкой"},500)}
});
