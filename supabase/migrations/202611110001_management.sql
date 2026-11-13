-- Extend the original Supabase installation in place. Legacy order totals, order lines,
-- restaurant identities and catalog prices are retained. No production fixtures are inserted.
begin;
create schema if not exists mf_private;
revoke all on schema mf_private from public, anon, authenticated;

alter table public.restaurants add column status text not null default 'active'
  check(status in ('active','suspended','archived'));
-- The original migration unconditionally inserted this public demonstration tenant.
update public.restaurants set status='suspended' where slug='demo';

create table public.branches (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  name text not null check(length(btrim(name)) between 1 and 120), currency text not null default 'ETB' check(currency='ETB'),
  timezone text not null default 'Africa/Addis_Ababa', tax_bps integer not null default 0 check(tax_bps between 0 and 10000),
  service_bps integer not null default 0 check(service_bps between 0 and 10000), tipping_enabled boolean not null default true,
  settings jsonb not null default '{}', active boolean not null default true, menu_locator uuid unique default gen_random_uuid(),
  unique(restaurant_id,id)
);
insert into public.branches(restaurant_id,name) select id,'Main branch' from public.restaurants;

create table public.staff_branch_roles (
  restaurant_id uuid not null, branch_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  roles text[] not null check(cardinality(roles)>0 and array_position(roles,null) is null
    and roles <@ array['OWNER','MANAGER','WAITER','KITCHEN','CASHIER']::text[]),
  active boolean not null default true, primary key(branch_id,user_id),
  foreign key(restaurant_id,branch_id) references public.branches(restaurant_id,id)
);
create index mf_user_branches on public.staff_branch_roles(user_id) where active;
-- Legacy membership did not distinguish owners, cashiers or reporting scopes. Keep the
-- old mapping for operator reconciliation and require an explicit grant before use.
create table public.platform_administrators(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, branch_id uuid not null,
  email text not null check(length(email) between 3 and 254), roles text[] not null check(cardinality(roles)>0 and roles <@ array['MANAGER','WAITER','KITCHEN','CASHIER']::text[]),
  token_hash bytea not null unique, invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default(now()+interval '48 hours'), consumed_at timestamptz, revoked_at timestamptz,
  foreign key(restaurant_id,branch_id) references public.branches(restaurant_id,id)
);
create index mf_branch_invites on public.staff_invitations(branch_id,email);
create table public.management_audit (
  id bigint generated always as identity primary key, restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid, actor_id uuid, action text not null, resource_id uuid, created_at timestamptz not null default now(),
  foreign key(restaurant_id,branch_id) references public.branches(restaurant_id,id)
);
create table public.menu_images (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  bytes bytea not null check(octet_length(bytes) between 12 and 614400),
  created_at timestamptz not null default now(), unique(restaurant_id,id)
);
alter table public.restaurants add column logo_id uuid;
alter table public.restaurants add foreign key(id,logo_id) references public.menu_images(restaurant_id,id);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, branch_id uuid not null,
  label text not null check(length(btrim(label)) between 1 and 80), table_number integer not null check(table_number between 1 and 999),
  active boolean not null default true, qr_locator uuid unique default gen_random_uuid(),
  unique(restaurant_id,branch_id,id), foreign key(restaurant_id,branch_id) references public.branches(restaurant_id,id)
);
create unique index mf_active_table_number on public.dining_tables(branch_id,table_number) where active;
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null,branch_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 120), translations jsonb not null default '{}',
  sort_order integer not null default 0 check(sort_order between 0 and 99999),archived boolean not null default false,
  foreign key(restaurant_id,branch_id) references public.branches(restaurant_id,id),unique(restaurant_id,branch_id,id)
);
create unique index mf_active_category_name on public.menu_categories(branch_id,lower(name)) where not archived;
insert into public.menu_categories(restaurant_id,branch_id,name)
 select m.restaurant_id,b.id,min(m.category) from public.menu_items m join public.branches b on b.restaurant_id=m.restaurant_id
 group by m.restaurant_id,b.id,lower(m.category);

alter table public.menu_items add column branch_id uuid, add column category_id uuid,
 add column translations jsonb not null default '{}', add column published boolean not null default false,
 add column archived boolean not null default false, add column version integer not null default 1,
 add column special boolean not null default false, add column special_price_minor bigint check(special_price_minor between 0 and 100000000),
 add column schedule_start time, add column schedule_end time, add column image_id uuid,
 add column variants jsonb not null default '[]', add column modifier_groups jsonb not null default '[]',
 add column price_minor bigint generated always as ((price*100)::bigint) stored;
update public.menu_items m set branch_id=c.branch_id,category_id=c.id,published=(r.slug <> 'demo')
 from public.menu_categories c join public.restaurants r on r.id=c.restaurant_id
 where m.restaurant_id=c.restaurant_id and lower(m.category)=lower(c.name);
alter table public.menu_items alter branch_id set not null, alter category_id set not null,
 add foreign key(restaurant_id,branch_id,category_id) references public.menu_categories(restaurant_id,branch_id,id),
 add foreign key(restaurant_id,image_id) references public.menu_images(restaurant_id,id),
 add unique(restaurant_id,branch_id,id), add check((schedule_start is null)=(schedule_end is null) and schedule_start is distinct from schedule_end or (schedule_start is null and schedule_end is null));
create index mf_menu_lookup on public.menu_items(branch_id,category_id) where not archived;

drop policy if exists "public restaurants" on public.restaurants;
drop policy if exists "public available menu" on public.menu_items;
drop policy if exists "staff menu insert" on public.menu_items;
drop policy if exists "staff menu update" on public.menu_items;
drop policy if exists "own staff memberships" on public.staff_members;
do $$
declare n text;
begin
 foreach n in array array['restaurants','branches','staff_members','staff_branch_roles','staff_invitations','platform_administrators','management_audit','menu_images','dining_tables','menu_categories','menu_items'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public, anon, authenticated',n);
 end loop;
end $$;

create function mf_private.has_role(p_branch uuid,p_roles text[] default null) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_branch_roles g join public.branches b on b.id=g.branch_id
 join public.restaurants r on r.id=b.restaurant_id where g.user_id=auth.uid() and g.branch_id=p_branch
 and g.active and b.active and r.status='active' and (p_roles is null or g.roles && p_roles)) $$;
create function mf_private.require_role(p_branch uuid,p_roles text[] default null) returns void
 language plpgsql stable security definer set search_path='' as $$
begin if not mf_private.has_role(p_branch,p_roles) then raise exception using errcode='42501',message='Permission denied for this branch'; end if;end $$;
create function mf_private.email() returns text language sql stable security definer set search_path='' as $$
 select lower(u.email) from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null $$;
create function mf_private.audit(p_restaurant uuid,p_branch uuid,p_action text,p_resource uuid) returns void
 language sql volatile security definer set search_path='' as $$
 insert into public.management_audit(restaurant_id,branch_id,actor_id,action,resource_id)
 values(p_restaurant,p_branch,auth.uid(),p_action,p_resource) $$;
create function public.mf_item_on_schedule(p_start time,p_end time,p_timezone text)
returns boolean language sql stable set search_path='' as $$
 select case when p_start is null and p_end is null then true
 when p_start<p_end then t >= p_start and t < p_end else t >= p_start or t < p_end end
 from (select (now() at time zone p_timezone)::time as t) clock $$;

create function mf_private.image_path(p_image uuid) returns text language sql immutable set search_path='' as $$
 select '/api/images/' || p_image::text $$;
create function mf_private.item_json(m public.menu_items) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'categoryId',m.category_id,'category',m.category,'name',m.name,'description',m.description,
 'translations',m.translations,'priceMinor',m.price_minor,'available',m.available,'published',m.published,'special',m.special,
 'specialPriceMinor',m.special_price_minor,'scheduleStart',m.schedule_start,'scheduleEnd',m.schedule_end,
 'variants',m.variants,'modifierGroups',m.modifier_groups,'imagePath',mf_private.image_path(m.image_id),'version',m.version) $$;
create function mf_private.category_json(c public.menu_categories) returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('id',c.id,'name',c.name,'translations',c.translations,'sortOrder',c.sort_order) $$;
create function mf_private.branch_json(b public.branches) returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('id',b.id,'name',b.name,'currency',b.currency,'timezone',b.timezone,'taxBps',b.tax_bps,
 'serviceBps',b.service_bps,'tippingEnabled',b.tipping_enabled,'settings',b.settings,'active',b.active,'menuLocator',b.menu_locator) $$;

create function public.mf_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 return jsonb_build_object('userId',auth.uid(),'email',mf_private.email(),'platformAdmin',exists(select from public.platform_administrators where user_id=auth.uid()),
 'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'restaurantId',b.restaurant_id,'restaurantName',r.name,'roles',g.roles) order by r.name,b.name,b.id)
 from public.staff_branch_roles g join public.branches b on b.id=g.branch_id join public.restaurants r on r.id=b.restaurant_id
 where g.user_id=auth.uid() and g.active and b.active and r.status='active'),'[]'::jsonb));
end $$;

create function public.mf_onboard(p_name text,p_branch_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=gen_random_uuid();bid uuid;
begin
 if mf_private.email() is null then raise exception using errcode='42501',message='Verify your email before onboarding';end if;
 if nullif(btrim(p_name),'') is null or length(p_name)>120 or nullif(btrim(p_branch_name),'') is null or length(p_branch_name)>120 then raise exception 'Enter a restaurant and branch name (1–120 characters)';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,11));
 if exists(select from public.staff_branch_roles where user_id=auth.uid()) then raise exception 'This account already belongs to a restaurant'; end if;
 insert into public.restaurants(id,slug,name) values(rid,'r-'||replace(rid::text,'-',''),btrim(p_name));
 insert into public.branches(restaurant_id,name) values(rid,btrim(p_branch_name)) returning id into bid;
 insert into public.staff_branch_roles values(rid,bid,auth.uid(),array['OWNER','MANAGER','WAITER','KITCHEN','CASHIER'],true);
 perform mf_private.audit(rid,bid,'restaurant.onboard',rid);
 return public.mf_context();
end $$;

create function public.mf_workspace(p_branch uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean; result jsonb;
begin
 perform mf_private.require_role(p_branch); manager:=mf_private.has_role(p_branch,array['OWNER','MANAGER']);
 select jsonb_build_object('profile',jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'logoPath',mf_private.image_path(r.logo_id)),
 'branch',mf_private.branch_json(b),
 'categories',coalesce((select jsonb_agg(mf_private.category_json(c) order by c.sort_order,c.name) from public.menu_categories c where c.branch_id=b.id and not c.archived),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(mf_private.item_json(m) order by m.name,m.id) from public.menu_items m where m.branch_id=b.id and not m.archived),'[]'::jsonb),
 'tables',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'tableNumber',t.table_number,'active',t.active,'qrLocator',case when manager then t.qr_locator end) order by t.table_number) from public.dining_tables t where t.branch_id=b.id and t.active),'[]'::jsonb),
 'staff',case when manager then coalesce((select jsonb_agg(jsonb_build_object('userId',g.user_id,'email',u.email,'roles',g.roles,'active',g.active) order by u.email) from public.staff_branch_roles g join auth.users u on u.id=g.user_id where g.branch_id=b.id),'[]'::jsonb) else '[]'::jsonb end,
 'invitations',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'roles',i.roles,'expiresAt',i.expires_at) order by i.expires_at) from public.staff_invitations i where i.branch_id=b.id and i.consumed_at is null and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.branches b join public.restaurants r on r.id=b.restaurant_id where b.id=p_branch;
 return result;
end $$;

create function public.mf_public_menu(p_locator uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.branches;t public.dining_tables;r public.restaurants;tab jsonb;
begin
 select * into t from public.dining_tables where qr_locator=p_locator and active;
 if found then select * into b from public.branches where id=t.branch_id and active;
  tab:=jsonb_build_object('id',t.id,'label',t.label,'tableNumber',t.table_number);
 else select * into b from public.branches where menu_locator=p_locator and active; end if;
 select * into r from public.restaurants where id=b.restaurant_id and status='active';
 if not found then raise exception using errcode='P0002',message='This menu code is unavailable';end if;
 return jsonb_build_object('restaurant',jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'logoPath',mf_private.image_path(r.logo_id)),
 'branch',jsonb_build_object('id',b.id,'name',b.name,'currency',b.currency),'table',tab,
 'categories',coalesce((select jsonb_agg(mf_private.category_json(c) order by c.sort_order,c.name) from public.menu_categories c where c.branch_id=b.id and not c.archived),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(mf_private.item_json(m) order by m.name,m.id) from public.menu_items m where m.branch_id=b.id and m.published and not m.archived
 and public.mf_item_on_schedule(m.schedule_start,m.schedule_end,b.timezone)),'[]'::jsonb));
end $$;

create function mf_private.check_keys(j jsonb,allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(j) is distinct from 'object' or (j-allowed)<>'{}'::jsonb then raise exception 'Unexpected object field';end if;
end $$;
create function mf_private.checked_text(value text,max_size integer) returns text language plpgsql immutable set search_path='' as $$
begin if value is null or length(btrim(value)) not between 1 and max_size then raise exception 'Invalid text length';end if;return btrim(value);end $$;
create function mf_private.integer_value(j jsonb,lo int,hi int) returns integer language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(j) is distinct from 'number' then raise exception 'Expected integer';end if;
 n:=(j::text)::numeric;if n<>trunc(n) or n not between lo and hi then raise exception 'Integer out of range';end if;return n::integer;
end $$;
create function mf_private.bool_value(j jsonb,fallback boolean) returns boolean language plpgsql immutable set search_path='' as $$
begin if j is null then return fallback;end if;if jsonb_typeof(j)<>'boolean' then raise exception 'Expected true or false';end if;return (j::text)::boolean;end $$;
create function mf_private.translations(j jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare lang record;
begin
 perform mf_private.check_keys(j,array['en','am','ti']);
 for lang in select * from jsonb_each(j) loop
  perform mf_private.check_keys(lang.value,array['name','description']);
  if (lang.value ? 'name' and (jsonb_typeof(lang.value->'name')<>'string' or length(lang.value->>'name')>120))
    or (lang.value ? 'description' and (jsonb_typeof(lang.value->'description')<>'string' or length(lang.value->>'description')>2000)) then raise exception 'Invalid translated menu text';end if;
 end loop;return j;
end $$;
create function mf_private.validate_choices(v jsonb,g jsonb) returns void language plpgsql immutable set search_path='' as $$
declare a jsonb;op jsonb;groups text[]:='{}';opts text[]:='{}';vs text[]:='{}';lo int;hi int;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(v)>30 or jsonb_array_length(g)>12 then raise exception 'Too many variants or modifier groups';end if;
 for a in select value from jsonb_array_elements(v) loop
  perform mf_private.check_keys(a,array['id','name','priceMinor']);perform mf_private.checked_text(a->>'name',120);
  if coalesce(a->>'id','')!~'^[A-Za-z0-9_-]{1,64}$' or a->>'id'=any(vs) then raise exception 'Invalid or duplicate variant ID';end if;
  vs:=array_append(vs,a->>'id');perform mf_private.integer_value(a->'priceMinor',0,100000000);
 end loop;
 for a in select value from jsonb_array_elements(g) loop
  perform mf_private.check_keys(a,array['id','name','min','max','options']);perform mf_private.checked_text(a->>'name',120);
  if coalesce(a->>'id','')!~'^[A-Za-z0-9_-]{1,64}$' or a->>'id'=any(groups) then raise exception 'Invalid or duplicate group ID';end if;groups:=array_append(groups,a->>'id');
  if jsonb_typeof(a->'options') is distinct from 'array' or jsonb_array_length(a->'options') not between 1 and 30 then raise exception 'Provide 1–30 modifier options';end if;
  hi:=mf_private.integer_value(a->'max',1,jsonb_array_length(a->'options'));lo:=mf_private.integer_value(a->'min',0,hi);
  for op in select value from jsonb_array_elements(a->'options') loop
   perform mf_private.check_keys(op,array['id','name','priceMinor']);perform mf_private.checked_text(op->>'name',120);
   if coalesce(op->>'id','')!~'^[A-Za-z0-9_-]{1,64}$' or op->>'id'=any(opts) then raise exception 'Invalid or duplicate option ID';end if;
   opts:=array_append(opts,op->>'id');perform mf_private.integer_value(op->'priceMinor',0,100000000);
  end loop;
 end loop;
end $$;
create function mf_private.check_settings(j jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare row_value jsonb;days integer[]:='{}';day_number integer;
begin
 perform mf_private.check_keys(j,array['hours','address','phone']);
 if coalesce(length(j->>'address'),0)>300 or coalesce(length(j->>'phone'),0)>40 then raise exception 'Address or phone is too long';end if;
 if j ? 'hours' then
  if jsonb_typeof(j->'hours') is distinct from 'array' or jsonb_array_length(j->'hours')>7 then raise exception 'Provide at most seven opening periods';end if;
  for row_value in select value from jsonb_array_elements(j->'hours') loop
   perform mf_private.check_keys(row_value,array['day','open','close']);day_number:=mf_private.integer_value(row_value->'day',0,6);
   if day_number=any(days) or coalesce(row_value->>'open','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(row_value->>'close','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or row_value->>'open'=row_value->>'close' then raise exception 'Invalid or duplicate opening period';end if;
   days:=array_append(days,day_number);
  end loop;
 end if;return j;
end $$;

create function mf_private.image_id(rid uuid,j jsonb) returns uuid language plpgsql stable set search_path='' as $$
declare path text:=j#>>'{}';asset uuid;
begin
 if path is null or path='' then return null;end if;
 if path !~ '^/api/images/[0-9a-f-]{36}$' then raise exception 'Select an uploaded image';end if;
 select id into asset from public.menu_images where restaurant_id=rid and id=split_part(path,'/',4)::uuid;
 if not found then raise exception 'Image not found';end if;return asset;
end $$;
create function public.mf_store_image(p_branch uuid,p_data text) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;image uuid;content bytea;
begin
 perform mf_private.require_role(p_branch,array['OWNER','MANAGER']);
 if p_data is null or length(p_data)>819200 then raise exception 'Image exceeds 600 KiB';end if;
 content:=decode(p_data,'base64');
 if octet_length(content) not between 12 and 614400 or substring(content from 1 for 4)<>decode('52494646','hex') or substring(content from 9 for 4)<>decode('57454250','hex') then raise exception 'Expected a WebP image';end if;
 select restaurant_id into rid from public.branches where id=p_branch;
 -- Rate and bound unreferenced uploads independently of the HTTP transport.
 perform pg_advisory_xact_lock(hashtextextended(rid::text,12));
 if (select count(*) from public.menu_images where restaurant_id=rid and created_at>now()-interval '1 hour')>=100 then raise exception 'Hourly upload limit reached';end if;
 insert into public.menu_images(restaurant_id,bytes) values(rid,content) returning id into image;return image;
end $$;
create function public.mf_get_image(p_id uuid) returns text language sql stable security definer set search_path='' as $$
select encode(i.bytes,'base64') from public.menu_images i join public.restaurants r on r.id=i.restaurant_id and r.status='active'
 where i.id=p_id and (r.logo_id=i.id or exists(select from public.menu_items m join public.branches b on b.id=m.branch_id
 where m.image_id=i.id and b.active and m.published and not m.archived) or exists(select from public.branches b where b.restaurant_id=i.restaurant_id and mf_private.has_role(b.id,array['OWNER','MANAGER']))) $$;

create function mf_private.save_item(b public.branches,j jsonb) returns uuid language plpgsql set search_path='' as $$
declare iid uuid:=nullif(j->>'id','')::uuid;cat public.menu_categories;m public.menu_items;
 vs jsonb:=coalesce(j->'variants','[]'::jsonb);groups_data jsonb:=coalesce(j->'modifierGroups','[]'::jsonb);
 s1 time:=nullif(j->>'scheduleStart','')::time;s2 time:=nullif(j->>'scheduleEnd','')::time;
 pri integer;sp integer;label text;descr text:=coalesce(j->>'description','');img uuid;tr jsonb;
 avail boolean;pub boolean;is_special boolean;
begin
 perform mf_private.check_keys(j,array['id','categoryId','category','name','description','priceMinor','available','published','translations','special','specialPriceMinor','scheduleStart','scheduleEnd','imagePath','variants','modifierGroups','version']);
 label:=mf_private.checked_text(j->>'name',120);pri:=mf_private.integer_value(j->'priceMinor',0,100000000);
 if length(descr)>2000 then raise exception 'Description exceeds 2000 characters';end if;
 select * into cat from public.menu_categories where branch_id=b.id and id=(j->>'categoryId')::uuid and not archived for share;
 if not found then raise exception 'Choose an active category in this branch';end if;
 perform mf_private.validate_choices(vs,groups_data);tr:=mf_private.translations(coalesce(j->'translations','{}'::jsonb));
 img:=mf_private.image_id(b.restaurant_id,j->'imagePath');avail:=mf_private.bool_value(j->'available',true);pub:=mf_private.bool_value(j->'published',false);is_special:=mf_private.bool_value(j->'special',false);
 if j->>'specialPriceMinor' is not null then sp:=mf_private.integer_value(j->'specialPriceMinor',0,100000000);end if;
 if (s1 is null)<>(s2 is null) or (s1 is not null and s1=s2) then raise exception 'Set both schedule times with different values';end if;
 if iid is null then
  insert into public.menu_items(restaurant_id,branch_id,category_id,name,category,description,price,available,published,translations,special,special_price_minor,schedule_start,schedule_end,image_id,variants,modifier_groups)
  values(b.restaurant_id,b.id,cat.id,label,cat.name,descr,pri/100.0,avail,pub,tr,is_special,sp,s1,s2,img,vs,groups_data) returning id into iid;
 else
  select * into m from public.menu_items where id=iid and branch_id=b.id and not archived for update;
  if not found then raise exception using errcode='P0002',message='Menu item not found';end if;
  if (j->>'version')::integer is distinct from m.version then raise exception using errcode='40001',message='Menu item changed. Refresh before saving';end if;
  update public.menu_items set category_id=cat.id,name=label,category=cat.name,description=descr,price=pri/100.0,available=avail,published=pub,translations=tr,special=is_special,special_price_minor=sp,schedule_start=s1,schedule_end=s2,image_id=img,variants=vs,modifier_groups=groups_data,version=version+1 where id=iid;
 end if;return iid;
end $$;

create function mf_private.roles(j jsonb,is_owner boolean) returns text[] language plpgsql immutable set search_path='' as $$
declare rs text[];permitted text[]:=array['WAITER','KITCHEN','CASHIER'];
begin
 if is_owner then permitted:=array_append(permitted,'MANAGER');end if;
 if jsonb_typeof(j) is distinct from 'array' or jsonb_array_length(j) not between 1 and 4 then raise exception 'Choose one or more staff roles';end if;
 select array_agg(value order by value) into rs from (select distinct value from jsonb_array_elements_text(j)) x;
 if array_position(rs,null) is not null or not rs <@ permitted then raise exception using errcode='42501',message='You cannot grant these roles';end if;return rs;
end $$;

create function public.mf_manage(p_branch uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.branches; rid uuid;target uuid;input_id uuid;owner_role boolean;label text;cat public.menu_categories;
 token text;email_address text;rs text[];target_roles text[];result jsonb:='{}';changed int;new_settings jsonb;
begin
 if p_action='item.availability' then perform mf_private.require_role(p_branch,array['OWNER','MANAGER','KITCHEN']);
 else perform mf_private.require_role(p_branch,array['OWNER','MANAGER']);end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>64000 then raise exception 'Invalid management payload';end if;
 input_id:=nullif(p_data->>'id','')::uuid;target:=input_id;owner_role:=mf_private.has_role(p_branch,array['OWNER']);
 select * into strict b from public.branches where id=p_branch;rid:=b.restaurant_id;
 case p_action
 when 'item.save' then target:=mf_private.save_item(b,p_data);
 when 'item.archive','item.delete','item.availability' then
  -- Protect the dashboard's observed version across archive and availability edits.
  perform 1 from public.menu_items where id=target and branch_id=p_branch and not archived for update;
  if not found then raise exception using errcode='P0002',message='Menu item not found';end if;
  if p_data ? 'version' and not exists(select from public.menu_items where id=target and version=mf_private.integer_value(p_data->'version',1,2147483647)) then
   raise exception using errcode='40001',message='Menu item changed. Refresh before saving';end if;
  if p_action='item.availability' then
   perform mf_private.check_keys(p_data,array['id','available','version']);if not p_data ? 'available' then raise exception 'Choose an availability state';end if;
   update public.menu_items set available=mf_private.bool_value(p_data->'available',false),version=version+1 where id=target and branch_id=p_branch and not archived;
  elsif p_action='item.delete' then
   perform mf_private.check_keys(p_data,array['id','version']);
   delete from public.menu_items m where m.id=target and m.branch_id=p_branch and not m.published and not exists(select from public.order_items oi where oi.menu_item_id=m.id);
   if not found then
    update public.menu_items set archived=true,published=false,available=false,version=version+1 where id=target and branch_id=p_branch and not archived;
   end if;
  else update public.menu_items set archived=true,published=false,available=false,version=version+1 where id=target and branch_id=p_branch and not archived;
  end if;
  if not found then raise exception using errcode='P0002',message='Menu item not found';end if;
 when 'category.save' then
  perform mf_private.check_keys(p_data,array['id','name','translations','sortOrder']);label:=mf_private.checked_text(p_data->>'name',120);
  if target is null then
   insert into public.menu_categories(restaurant_id,branch_id,name,translations,sort_order) values(rid,p_branch,label,mf_private.translations(coalesce(p_data->'translations','{}'::jsonb)),mf_private.integer_value(coalesce(p_data->'sortOrder','0'::jsonb),0,99999)) returning id into target;
  else
   update public.menu_categories set name=label,translations=mf_private.translations(coalesce(p_data->'translations',translations)),sort_order=mf_private.integer_value(coalesce(p_data->'sortOrder',to_jsonb(sort_order)),0,99999) where id=target and branch_id=p_branch and not archived;
   if not found then raise exception using errcode='P0002',message='Category not found';end if;
   update public.menu_items set category=label,version=version+1 where category_id=target;
  end if;
 when 'category.archive','category.delete' then
  select * into cat from public.menu_categories where id=target and branch_id=p_branch and not archived for update;
  if not found then raise exception using errcode='P0002',message='Category not found';end if;
  if exists(select from public.menu_items where category_id=target and not archived) then raise exception 'Move or archive category items first';end if;
  if p_action='category.delete' and not exists(select from public.menu_items where category_id=target) then delete from public.menu_categories where id=target;
  else update public.menu_categories set archived=true where id=target;end if;
 when 'profile.update' then
  if not owner_role then raise exception using errcode='42501',message='Only the owner can update the shared restaurant profile';end if;
  perform mf_private.check_keys(p_data,array['name','slug','logoPath']);
  if p_data ? 'slug' and coalesce(p_data->>'slug','')!~'^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'Invalid restaurant slug';end if;
  update public.restaurants set name=mf_private.checked_text(coalesce(p_data->>'name',name),120),slug=coalesce(p_data->>'slug',slug),
    logo_id=case when p_data ? 'logoPath' then mf_private.image_id(rid,p_data->'logoPath') else logo_id end where id=rid;target:=rid;
 when 'branch.create' then
  if not owner_role then raise exception using errcode='42501',message='Owner permission required';end if;
  perform mf_private.check_keys(p_data,array['name']);label:=mf_private.checked_text(p_data->>'name',120);
  insert into public.branches(restaurant_id,name) values(rid,label) returning id into target;
  insert into public.staff_branch_roles select rid,target,g.user_id,g.roles,true from public.staff_branch_roles g where g.branch_id=p_branch and g.active and 'OWNER'=any(g.roles);
 when 'branch.update' then
  perform mf_private.check_keys(p_data,array['id','name','currency','timezone','taxBps','serviceBps','tippingEnabled','settings']);
  if input_id is not null and input_id<>p_branch then raise exception 'Switch to the target branch first';end if;
  if coalesce(p_data->>'currency','ETB')<>'ETB' then raise exception 'Only ETB is enabled';end if;
  if not owner_role and (p_data ? 'taxBps' or p_data ? 'serviceBps' or p_data ? 'tippingEnabled') then raise exception using errcode='42501',message='Owner permission required to change billing rules';end if;
  if p_data ? 'timezone' and not exists(select from pg_timezone_names where name=p_data->>'timezone') then raise exception 'Invalid IANA timezone';end if;
  new_settings:=mf_private.check_settings(coalesce(p_data->'settings',b.settings));
  update public.branches set name=mf_private.checked_text(coalesce(p_data->>'name',name),120),timezone=coalesce(p_data->>'timezone',timezone),
   tax_bps=mf_private.integer_value(coalesce(p_data->'taxBps',to_jsonb(tax_bps)),0,10000),service_bps=mf_private.integer_value(coalesce(p_data->'serviceBps',to_jsonb(service_bps)),0,10000),
   tipping_enabled=mf_private.bool_value(p_data->'tippingEnabled',tipping_enabled),settings=new_settings where id=p_branch;target:=p_branch;
 when 'branch.menuRotate','branch.menuRevoke','branch.archive' then
  if not owner_role then raise exception using errcode='42501',message='Owner permission required';end if;
  if input_id is not null and input_id<>p_branch then raise exception 'Switch to the target branch first';end if;
  if p_action='branch.archive' then
   perform 1 from public.restaurants where id=rid for update;
   if not exists(select from public.branches where restaurant_id=rid and id<>p_branch and active) then raise exception 'Keep at least one active branch';end if;
   update public.branches set active=false,menu_locator=null where id=p_branch;
  else update public.branches set menu_locator=case when p_action='branch.menuRotate' then gen_random_uuid() end where id=p_branch;end if;target:=p_branch;
 when 'table.save' then
  perform mf_private.check_keys(p_data,array['id','label','tableNumber']);
  label:=mf_private.checked_text(p_data->>'label',80);
  if target is null then insert into public.dining_tables(restaurant_id,branch_id,label,table_number) values(rid,p_branch,label,mf_private.integer_value(p_data->'tableNumber',1,999)) returning id into target;
  else update public.dining_tables set label=mf_private.checked_text(p_data->>'label',80),table_number=mf_private.integer_value(p_data->'tableNumber',1,999) where id=target and branch_id=p_branch and active;
   if not found then raise exception using errcode='P0002',message='Table not found';end if;
  end if;
 when 'table.archive','table.revoke','table.rotate' then
  update public.dining_tables set active=(p_action<>'table.archive'),qr_locator=case when p_action='table.rotate' then gen_random_uuid() end where id=target and branch_id=p_branch and active;
  if not found then raise exception using errcode='P0002',message='Table not found';end if;
 when 'staff.invite' then
  perform mf_private.check_keys(p_data,array['email','roles']);email_address:=lower(btrim(p_data->>'email'));
  if email_address is null or length(email_address)>254 or email_address!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address';end if;
  rs:=mf_private.roles(p_data->'roles',owner_role);
  if exists(select from public.staff_branch_roles g join auth.users u on u.id=g.user_id where branch_id=p_branch and g.active and lower(u.email)=email_address) then raise exception 'Staff member already has branch access';end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  update public.staff_invitations set revoked_at=now() where branch_id=p_branch and email=email_address and consumed_at is null and revoked_at is null;
  insert into public.staff_invitations(restaurant_id,branch_id,email,roles,token_hash,invited_by) values(rid,p_branch,email_address,rs,sha256(convert_to(token,'UTF8')),auth.uid()) returning id into target;
  result:=jsonb_build_object('token',token);
 when 'staff.inviteRevoke' then
  update public.staff_invitations set revoked_at=now() where id=target and branch_id=p_branch and revoked_at is null and consumed_at is null and (owner_role or not ('MANAGER'=any(roles)));
  if not found then raise exception using errcode='P0002',message='Invitation not found or not revocable';end if;
 when 'staff.update','staff.revoke' then
  perform mf_private.check_keys(p_data,array['id','roles']);
  select roles into target_roles from public.staff_branch_roles where branch_id=p_branch and user_id=target and active for update;
  if not found then raise exception using errcode='P0002',message='Staff member not found';end if;
  if 'OWNER'=any(target_roles) or (not owner_role and 'MANAGER'=any(target_roles)) or target=auth.uid() then raise exception using errcode='42501',message='Cannot change this membership';end if;
  if p_action='staff.update' then rs:=mf_private.roles(p_data->'roles',owner_role);update public.staff_branch_roles set roles=rs where branch_id=p_branch and user_id=target;
  else update public.staff_branch_roles set active=false where branch_id=p_branch and user_id=target;end if;
 else raise exception 'Unknown management action';
 end case;
 perform mf_private.audit(rid,p_branch,p_action,target);return result||jsonb_build_object('id',target);
end $$;

create function public.mf_accept_invite(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.staff_invitations;verified_email text:=mf_private.email();
begin
 if verified_email is null then raise exception using errcode='42501',message='Sign in with a verified email to accept this invitation';end if;
 select * into i from public.staff_invitations where token_hash=sha256(convert_to(p_token,'UTF8')) and email=verified_email and consumed_at is null and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Invitation is unavailable for this account';end if;
 if not exists(select from public.branches b join public.restaurants r on r.id=b.restaurant_id where b.id=i.branch_id and b.active and r.status='active') then raise exception 'This branch is unavailable';end if;
 if not exists(select from public.staff_branch_roles g where g.user_id=i.invited_by and g.branch_id=i.branch_id and g.active and
  ('OWNER'=any(g.roles) or ('MANAGER'=any(g.roles) and not ('MANAGER'=any(i.roles))))) then raise exception 'Invitation is no longer authorized';end if;
 insert into public.staff_branch_roles(restaurant_id,branch_id,user_id,roles,active) values(i.restaurant_id,i.branch_id,auth.uid(),i.roles,true)
 on conflict(branch_id,user_id) do update set roles=excluded.roles,active=true where not public.staff_branch_roles.active;
 if not found then raise exception 'An active membership already exists';end if;
 update public.staff_invitations set consumed_at=now() where id=i.id;perform mf_private.audit(i.restaurant_id,i.branch_id,'staff.accept',auth.uid());return public.mf_context();
end $$;

create table public.tenant_subscriptions (
 restaurant_id uuid primary key references public.restaurants(id),plan text not null default 'pilot',
 status text not null default 'trial' check(status in ('trial','active','paused','cancelled')),
 updated_at timestamptz not null default now()
);
alter table public.tenant_subscriptions enable row level security;
revoke all on public.tenant_subscriptions from public,anon,authenticated;
create function public.mf_platform(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not exists(select from public.platform_administrators where user_id=auth.uid()) then raise exception using errcode='42501',message='Platform administrator required';end if;
 if p_action='update' then
  perform mf_private.check_keys(p_data,array['id','status','plan','subscriptionStatus']);target:=(p_data->>'id')::uuid;
  update public.restaurants set status=coalesce(p_data->>'status',status) where id=target;
  if not found then raise exception using errcode='P0002',message='Restaurant not found';end if;
  insert into public.tenant_subscriptions(restaurant_id,plan,status) values(target,mf_private.checked_text(coalesce(p_data->>'plan','pilot'),64),coalesce(p_data->>'subscriptionStatus','trial'))
  on conflict(restaurant_id) do update set plan=coalesce(p_data->>'plan',public.tenant_subscriptions.plan),status=coalesce(p_data->>'subscriptionStatus',public.tenant_subscriptions.status),updated_at=now();
  perform mf_private.audit(target,null,'platform.update',target);
 elsif p_action<>'list' or p_action is null then raise exception 'Unknown platform action';end if;
 return jsonb_build_object('tenants',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'status',r.status,'plan',s.plan,'subscriptionStatus',s.status) order by r.name,r.id) from public.restaurants r left join public.tenant_subscriptions s on s.restaurant_id=r.id),'[]'::jsonb));
end $$;

-- Supabase commonly grants functions to both web roles by default. Explicitly narrow
-- every new entry point even when default privileges differ between installations.
revoke all on all functions in schema mf_private from public,anon,authenticated;
do $$
declare f regprocedure;
begin
 foreach f in array array['public.mf_item_on_schedule(time,time,text)'::regprocedure,'public.mf_context()'::regprocedure,'public.mf_onboard(text,text)'::regprocedure,
  'public.mf_workspace(uuid)'::regprocedure,'public.mf_public_menu(uuid)'::regprocedure,'public.mf_manage(uuid,text,jsonb)'::regprocedure,
  'public.mf_accept_invite(text)'::regprocedure,'public.mf_store_image(uuid,text)'::regprocedure,'public.mf_get_image(uuid)'::regprocedure,'public.mf_platform(text,jsonb)'::regprocedure] loop
  execute format('revoke all on function %s from public, anon, authenticated',f);
 end loop;
end $$;
grant execute on function public.mf_context(), public.mf_onboard(text,text), public.mf_workspace(uuid),
 public.mf_manage(uuid,text,jsonb),public.mf_accept_invite(text),public.mf_store_image(uuid,text),public.mf_platform(text,jsonb) to authenticated;
grant execute on function public.mf_public_menu(uuid),public.mf_get_image(uuid) to anon,authenticated;
commit;
