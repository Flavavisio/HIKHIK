begin;
create schema if not exists hik_private;
revoke all on schema hik_private from public, anon;
grant usage on schema hik_private to authenticated;
alter table public.users add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.users drop column if exists password;
create or replace function hik_private.actor() returns table(profile_id uuid, profile_role text, parent_id uuid)
language sql stable security definer set search_path='' as $$
 select u.id,u.role,u.admin_id from public.users u
 where auth.uid() is not null and u.auth_user_id=auth.uid() and u.status='active'
 and (u.admin_id is null or exists(select 1 from public.users parent where parent.id=u.admin_id and parent.status='active'))
$$;
revoke all on function hik_private.actor() from public,anon;
grant execute on function hik_private.actor() to authenticated;
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('users','products','budgets','activity_log') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.budgets enable row level security;
alter table public.activity_log enable row level security;
revoke all on public.users,public.products,public.budgets,public.activity_log from anon;
revoke all on public.users from authenticated;
grant select on public.users to authenticated;
grant select,insert,update,delete on public.products,public.budgets to authenticated;
grant select,insert on public.activity_log to authenticated;
create policy users_scope on public.users for select to authenticated using (exists(select 1 from hik_private.actor() a where a.profile_id=id or a.profile_role in ('superadmin','gestor') or (a.profile_role='admin' and admin_id=a.profile_id)));
create policy products_read on public.products for select to authenticated using (exists(select 1 from hik_private.actor()));
create policy products_staff on public.products for all to authenticated using (exists(select 1 from hik_private.actor() where profile_role='superadmin')) with check (exists(select 1 from hik_private.actor() where profile_role='superadmin'));
create policy budgets_scope on public.budgets for select to authenticated using (exists(select 1 from hik_private.actor() a where a.profile_role in ('superadmin','gestor') or comercial_id=a.profile_id or (a.profile_role='admin' and admin_id=a.profile_id)));
create policy budgets_insert on public.budgets for insert to authenticated with check (exists(select 1 from hik_private.actor() a where comercial_id=a.profile_id and admin_id=coalesce(a.parent_id,a.profile_id)));
create policy budgets_update on public.budgets for update to authenticated using (exists(select 1 from hik_private.actor() a where a.profile_role in ('superadmin','gestor') or comercial_id=a.profile_id or (a.profile_role='admin' and admin_id=a.profile_id))) with check (exists(select 1 from hik_private.actor() a where a.profile_role in ('superadmin','gestor') or (comercial_id=a.profile_id and admin_id=coalesce(a.parent_id,a.profile_id)) or (a.profile_role='admin' and admin_id=a.profile_id and exists(select 1 from public.users u where u.id=comercial_id and u.admin_id=a.profile_id))));
create policy budgets_delete on public.budgets for delete to authenticated using (exists(select 1 from hik_private.actor() a where a.profile_role in ('superadmin','gestor') or comercial_id=a.profile_id or (a.profile_role='admin' and admin_id=a.profile_id)));
create policy activity_read on public.activity_log for select to authenticated using (exists(select 1 from hik_private.actor() a where a.profile_role in ('superadmin','gestor') or user_id=a.profile_id or (a.profile_role='admin' and exists(select 1 from public.users u where u.id=user_id and u.admin_id=a.profile_id))));
create policy activity_insert on public.activity_log for insert to authenticated with check (exists(select 1 from hik_private.actor() where profile_id=user_id));
commit;

alter function public.update_updated_at() set search_path='';
alter policy users_scope on public.users using (exists(select 1 from hik_private.actor() a where a.profile_id=id or a.parent_id=id or a.profile_role in ('superadmin','gestor') or (a.profile_role='admin' and admin_id=a.profile_id)));
