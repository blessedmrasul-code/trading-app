// Self-service account deletion. Only the signed-in non-admin user can delete their own account.
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
function key(name:string,legacy:string){if(Deno.env.get(legacy))return Deno.env.get(legacy)!;try{return JSON.parse(Deno.env.get(name)||"{}").default||""}catch{return ""}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const base=Deno.env.get("SUPABASE_URL")||"",publishable=key("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const auth=req.headers.get("Authorization")||"",jwt=auth.replace(/^Bearer\s+/i,"");
  if(!jwt||jwt===auth)return json({error:"Сначала войди в аккаунт"},401);
  const who=await fetch(base+"/auth/v1/user",{headers:{apikey:publishable,Authorization:"Bearer "+jwt}});
  if(!who.ok)return json({error:"Сессия истекла. Войди снова."},401);
  const user=await who.json();
  const body=await req.json().catch(()=>({}));
  if(body.confirm!=="DELETE")return json({error:"Для удаления аккаунта требуется подтверждение DELETE."},400);
  const admin=await fetch(base+"/rest/v1/arvex_admins?user_id=eq."+encodeURIComponent(user.id)+"&select=user_id",{headers:{apikey:secret,Authorization:"Bearer "+secret}});
  if(!admin.ok)return json({error:"Не удалось проверить права аккаунта"},502);
  if((await admin.json()).length)return json({error:"Аккаунт владельца или администратора нельзя удалить через приложение. Обратись к владельцу проекта."},403);
  const deleted=await fetch(base+"/auth/v1/admin/users/"+encodeURIComponent(user.id),{method:"DELETE",headers:{apikey:secret,Authorization:"Bearer "+secret}});
  if(!deleted.ok){console.error("account-delete auth response",deleted.status);return json({error:"Supabase не смог удалить аккаунт. Попробуй позже."},502)}
  return json({ok:true});
 }catch(e){console.error("account-delete",e);return json({error:"Не удалось удалить аккаунт"},500)}
});
