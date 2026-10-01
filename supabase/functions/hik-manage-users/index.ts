import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Método não permitido'},405);
 try{
 const jwt=req.headers.get('Authorization')?.replace(/^Bearer /i,'')||'';
 const {data:{user},error:authError}=await db.auth.getUser(jwt);if(authError||!user)return reply({error:'Sessão inválida'},401);
 const {data:actor}=await db.from('users').select('*').eq('auth_user_id',user.id).eq('status','active').single();if(!actor)return reply({error:'Conta inativa'},403);
 if(actor.admin_id){const {data:parent}=await db.from('users').select('status').eq('id',actor.admin_id).single();if(parent?.status!=='active')return reply({error:'Empresa inativa'},403)}
 const {action,id,data:input={}}=await req.json();
 const isSuper=actor.role==='superadmin',isManager=actor.role==='gestor';
 let target=null;if(id){const result=await db.from('users').select('*').eq('id',id).single();if(result.error)return reply({error:'Utilizador não encontrado'},404);target=result.data}
 const self=target?.id===actor.id;
 const manage=target&&(isSuper||(isManager&&['admin','comercial'].includes(target.role))||(actor.role==='admin'&&target.role==='comercial'&&target.admin_id===actor.id));
 if(action==='create'){
 const role=input.role;if(!((isSuper&&['gestor','admin','comercial'].includes(role))||(isManager&&['admin','comercial'].includes(role))||(actor.role==='admin'&&role==='comercial')))return reply({error:'Sem permissão'},403);
 let parentId=null,company=String(input.company||''),priceMode=input.priceMode==='pvi'?'pvi':'pvp';
 if(role==='comercial'){parentId=actor.role==='admin'?actor.id:input.adminId;const {data:parent}=await db.from('users').select('*').eq('id',parentId).eq('role','admin').single();if(!parent)return reply({error:'Administrador inválido'},400);company=parent.company;priceMode=parent.price_mode}
 if(typeof input.password!=='string'||input.password.length<12)return reply({error:'A password deve ter pelo menos 12 caracteres'},400);
 const {data:created,error}=await db.auth.admin.createUser({email:String(input.email).trim().toLowerCase(),password:input.password,email_confirm:true});if(error)return reply({error:error.message},400);
 const {data:profile,error:err}=await db.from('users').insert({id:input.id||crypto.randomUUID(),auth_user_id:created.user.id,name:input.name,email:created.user.email,role,admin_id:parentId,company,price_mode:priceMode,status:input.status==='suspended'?'suspended':'active'}).select().single();
 if(err){await db.auth.admin.deleteUser(created.user.id);return reply({error:err.message},400)}return reply({user:profile});
 }
 if(!self&&!manage)return reply({error:'Sem permissão'},403);
 if(action==='delete'){
 if(self)return reply({error:'Não pode eliminar a própria conta'},400);
 const {count:children,error:childrenError}=await db.from('users').select('id',{count:'exact',head:true}).eq('admin_id',id);if(childrenError)throw childrenError;if(children)return reply({error:'Esta conta tem comerciais associados. Suspenda a conta ou remova primeiro a equipa.'},409);
 const {count,error:budgetError}=await db.from('budgets').select('id',{count:'exact',head:true}).or(`comercial_id.eq.${id},admin_id.eq.${id}`);
 if(budgetError)throw budgetError;if(count)return reply({error:'Esta conta tem orçamentos. Suspenda-a para preservar os dados.'},409);
 if(target.auth_user_id){const {error}=await db.auth.admin.deleteUser(target.auth_user_id);if(error)throw error}
 const {error}=await db.from('users').delete().eq('id',id);if(error)throw error;return reply({ok:true});
 }
 if(action!=='update')return reply({error:'Ação inválida'},400);
 const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(input.name!==undefined)patch.name=String(input.name).trim();
 if(input.company!==undefined&&(self||manage))patch.company=String(input.company);
 if(input.status!==undefined&&manage&&!self){if(!['active','suspended'].includes(input.status))return reply({error:'Estado inválido'},400);patch.status=input.status}
 if(input.priceMode!==undefined&&(manage||(self&&actor.role==='admin'))){if(!['pvp','pvi'].includes(input.priceMode))return reply({error:'Preço inválido'},400);patch.price_mode=input.priceMode}
 for(const [k,col] of [['lastLogin','last_login'],['lastActivity','last_activity'],['isOnline','is_online']])if(self&&input[k]!==undefined)patch[col]=input[k];
 const authPatch:Record<string,unknown>={};
 if(input.password){if(input.password.length<12)return reply({error:'A password deve ter pelo menos 12 caracteres'},400);authPatch.password=input.password;if(self)authPatch.app_metadata={...user.app_metadata,hik_password_change_required:false}}
 if(input.email&&input.email.toLowerCase()!==target.email.toLowerCase()){if(!manage)return reply({error:'Peça ao administrador para alterar o email'},403);authPatch.email=input.email.trim().toLowerCase();authPatch.email_confirm=true;patch.email=authPatch.email}
 if(Object.keys(authPatch).length){const {error}=await db.auth.admin.updateUserById(target.auth_user_id,authPatch);if(error)throw error}
 const {data:profile,error}=await db.from('users').update(patch).eq('id',id).select().single();if(error)throw error;
 return reply({user:profile});
 }catch(e){return reply({error:e.message||'Erro ao gerir utilizador'},400)}
});
