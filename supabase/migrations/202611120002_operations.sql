-- Preserve historical orders, retire the unrestricted table-number order endpoint,
-- and route operational reads/writes through scoped, transactional RPCs.
begin;
drop function if exists public.place_order(text,integer,jsonb,integer,text);
drop policy if exists "staff orders" on public.orders;
drop policy if exists "staff order updates" on public.orders;
drop policy if exists "staff order lines" on public.order_items;
revoke all on public.orders, public.order_items from public, anon, authenticated;

create table public.dining_sessions (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null, branch_id uuid not null, table_id uuid not null,
 table_label text not null, currency text not null,
 tax_bps int not null check(tax_bps between 0 and 10000),
 service_bps int not null check(service_bps between 0 and 10000), tipping_enabled boolean not null,
 waiter_id uuid references auth.users(id), opened_by uuid not null references auth.users(id),
 status text not null default 'open' check(status in ('open','checkout','settled','void')),
 version int not null default 1, discount_minor bigint not null default 0 check(discount_minor>=0),
 tip_minor bigint not null default 0 check(tip_minor>=0),
 opened_at timestamptz not null default now(), closed_at timestamptz,
 unique(id, restaurant_id), foreign key(restaurant_id,branch_id,table_id) references public.dining_tables(restaurant_id,branch_id,id)
);
create unique index mf_active_table on public.dining_sessions(table_id) where status in ('open','checkout');
create index mf_sessions_branch on public.dining_sessions(branch_id,status,opened_at desc);

create table public.diner_grants (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.dining_sessions(id),
 digest bytea not null unique, is_host boolean not null, expires_at timestamptz not null,
 unique(session_id,id)
);
create unique index mf_one_host on public.diner_grants(session_id) where is_host;
create table public.diner_invites (
 digest bytea primary key, session_id uuid not null references public.dining_sessions(id),
 locator uuid not null, is_host boolean not null, expires_at timestamptz not null, consumed boolean not null default false
);
create index mf_invite_session on public.diner_invites(session_id);
alter table public.orders add column session_id uuid, add column guest_id uuid,
 add constraint mf_order_tenant foreign key(session_id,restaurant_id) references public.dining_sessions(id,restaurant_id),
 add constraint mf_order_guest foreign key(session_id,guest_id) references public.diner_grants(session_id,id);
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('new','accepted','preparing','ready','served','cancelled'));
create index mf_order_session on public.orders(session_id,created_at);
alter table public.order_items add column status text not null default 'new'
 check(status in ('new','accepted','preparing','ready','served','cancelled')),
 add column selection jsonb not null default '{}', add column note text not null default '';
create index mf_items_order on public.order_items(order_id);

create table public.service_requests (
 id uuid primary key default gen_random_uuid(), session_id uuid not null, guest_id uuid not null,
 category text not null check(category in ('water','waiter','other')), note text not null default '',
 status text not null default 'requested' check(status in ('requested','acknowledged','completed')),
 created_at timestamptz not null default now(), updated_by uuid,
 foreign key(session_id,guest_id) references public.diner_grants(session_id,id)
);
create unique index mf_active_request on public.service_requests(guest_id,category) where status <> 'completed';
create index mf_service_session on public.service_requests(session_id,created_at);
create table public.bill_revisions (
 session_id uuid not null references public.dining_sessions(id), version int not null,
 snapshot jsonb not null, host_id uuid not null, created_at timestamptz not null default now(),
 primary key(session_id,version), foreign key(session_id,host_id) references public.diner_grants(session_id,id)
);
create table public.dining_receipts (
 id uuid primary key default gen_random_uuid(), session_id uuid not null unique, version int not null,
 cashier_id uuid not null references auth.users(id), tip_waiter_id uuid references auth.users(id),
 issued_at timestamptz not null default now(), snapshot jsonb not null,
 foreign key(session_id,version) references public.bill_revisions(session_id,version)
);
create table public.cash_payments (
 receipt_id uuid primary key references public.dining_receipts(id), amount_minor bigint not null check(amount_minor>0),
 tender_minor bigint not null, change_minor bigint not null check(change_minor>=0),
 check(tender_minor=amount_minor+change_minor)
);
create table public.operation_keys (
 session_id uuid not null references public.dining_sessions(id), actor_id uuid not null,
 action text not null, key uuid not null, body_hash bytea not null, result jsonb not null,
 primary key(session_id,actor_id,action,key)
);
create table public.operation_events (
 id bigint generated always as identity primary key, session_id uuid not null references public.dining_sessions(id),
 actor_id uuid not null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index mf_events_session on public.operation_events(session_id,created_at desc);
do $relations$
declare t text;
begin
 foreach t in array array['dining_sessions','diner_grants','diner_invites','service_requests','bill_revisions','dining_receipts','cash_payments','operation_keys','operation_events']
 loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $relations$;

create function mf_private.fingerprint(value text) returns bytea language sql immutable strict
set search_path=pg_catalog as $$ select sha256(convert_to(value,'UTF8')) $$;

-- Round tax independently for each line after distributing the discount by
-- largest remainder. A stable line ID breaks equal remainder ties.
create function mf_private.bill(s public.dining_sessions) returns jsonb language sql stable
set search_path=pg_catalog as $$
 with raw as (
  select i.id,i.name,i.selection,i.quantity,(i.unit_price*100)::bigint unit,
    (i.unit_price*100*i.quantity)::bigint gross
  from public.order_items i join public.orders o on o.id=i.order_id
  where o.session_id=s.id and i.status<>'cancelled'
 ), gross as (select coalesce(sum(r.gross),0)::bigint total from raw r),
 distribution as (
  select r.*, least(s.discount_minor,g.total) d,
    coalesce(trunc(r.gross::numeric*least(s.discount_minor,g.total)/nullif(g.total,0)),0)::bigint part,
    row_number() over(order by mod(r.gross::numeric*least(s.discount_minor,g.total),nullif(g.total,0)) desc,r.id) rank
  from raw r cross join gross g
 ), net as (
  select a.*, a.gross-a.part-case when a.rank<=a.d-sum(a.part) over() then 1 else 0 end as net
  from distribution a
 ), taxed as (
  select n.*, round(n.net*s.tax_bps/10000::numeric)::bigint tax from net n
 ), agg as (
  select coalesce(sum(gross),0)::bigint subtotal, coalesce(sum(net),0)::bigint eligible,
   coalesce(sum(tax),0)::bigint taxes,
   coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'selection',selection,'quantity',quantity,
      'unit_minor',unit::text,'subtotal_minor',gross::text,'discount_minor',(gross-net)::text,
      'tax_minor',tax::text,'total_minor',(net+tax)::text) order by id),'[]'::jsonb) lines from taxed
 ), calc as (select a.*,round(a.eligible::numeric*s.service_bps/10000)::bigint charge from agg a)
 select jsonb_build_object('session_id',s.id,'version',s.version,'currency',s.currency,'lines',lines,
   'table_label',s.table_label,'subtotal_minor',subtotal::text,'eligible_minor',eligible::text,
   'discount_minor',(subtotal-eligible)::text,'tax_minor',taxes::text,'tax_bps',s.tax_bps,
   'service_minor',charge::text,'service_bps',s.service_bps,'tipping_enabled',s.tipping_enabled,
   'tip_minor',s.tip_minor::text,'total_minor',(eligible+taxes+charge+s.tip_minor)::text) from calc
$$;

create function mf_private.order_view(o public.orders, s public.dining_sessions) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',o.id,'session_id',s.id,'table_label',s.table_label,'note',o.note,
   'status',case when s.status='settled' and o.status='served' then 'completed' else o.status end,
   'subtotal_minor',(100*o.subtotal)::bigint::text,'created_at',o.created_at,'items',
   coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'quantity',i.quantity,
    'unit_minor',(100*i.unit_price)::bigint::text,'selection',i.selection,'note',i.note,'status',i.status)
    order by i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb))
$$;
create function mf_private.request_view(r public.service_requests,s public.dining_sessions) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',r.id,'session_id',s.id,'table_label',s.table_label,'category',r.category,
 'note',r.note,'status',r.status,'created_at',r.created_at)
$$;
create function mf_private.receipt_view(sid uuid) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',r.id,'issued_at',r.issued_at,'snapshot',r.snapshot,
  'kind',case when c.receipt_id is null then 'zero_balance' else 'cash' end,'tender_minor',c.tender_minor::text,
  'change_minor',c.change_minor::text) from public.dining_receipts r left join public.cash_payments c on c.receipt_id=r.id where r.session_id=sid
$$;

create function mf_private.quote(s public.dining_sessions, basket jsonb) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare l jsonb; m public.menu_items; q integer; price bigint; option_ids jsonb; v jsonb; g jsonb; opt jsonb;
 opts jsonb; selected int; matched int; n text; line jsonb; lines jsonb:='[]'; subtotal bigint:=0; tz text;
begin
 if jsonb_typeof(basket) is distinct from 'array' or jsonb_array_length(basket) not between 1 and 30 then raise exception 'Choose 1–30 items'; end if;
 select timezone into tz from public.branches where id=s.branch_id;
 -- Lock catalog rows in ID order so simultaneous purchases and menu edits agree.
 perform 1 from public.menu_items m0 where m0.branch_id=s.branch_id and m0.id in
  (select (x->>'itemId')::uuid from jsonb_array_elements(basket) x) order by m0.id for share;
 for l in select value from jsonb_array_elements(basket) loop
  q:=(l->>'quantity')::int; n:=coalesce(l->>'note','');
  if q is null or q not between 1 and 20 or length(n)>300 then raise exception 'Invalid quantity or item instructions'; end if;
  select it.* into m from public.menu_items it join public.menu_categories c on c.id=it.category_id and not c.archived
   where it.id=(l->>'itemId')::uuid and it.branch_id=s.branch_id and it.restaurant_id=s.restaurant_id
   and it.available and it.published and not it.archived and public.mf_item_on_schedule(it.schedule_start,it.schedule_end,tz) for share of c;
  if not found then raise exception 'A selected item is unavailable'; end if;
  v:=null; price:=case when m.special then coalesce(m.special_price_minor,m.price_minor) else m.price_minor end;
  if nullif(l->>'variantId','') is not null then
   select value into v from jsonb_array_elements(m.variants) where value->>'id'=l->>'variantId';
   if not found then raise exception 'Choose an available variant'; end if;
   price:=(v->>'priceMinor')::bigint;
  end if;
  option_ids:=coalesce(l->'optionIds','[]'::jsonb); opts:='[]'; matched:=0;
  if jsonb_typeof(option_ids) is distinct from 'array' or jsonb_array_length(option_ids)>40 then raise exception 'Invalid modifier selection'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(option_ids))<>jsonb_array_length(option_ids) then raise exception 'Duplicate modifier'; end if;
  for g in select value from jsonb_array_elements(m.modifier_groups) loop
   selected:=0;
   for opt in select value from jsonb_array_elements(g->'options') where option_ids ? (value->>'id') loop
    opts:=opts||jsonb_build_array(jsonb_build_object('id',opt->>'id','name',opt->>'name','priceMinor',opt->>'priceMinor'));
    price:=price+(opt->>'priceMinor')::bigint; selected:=selected+1;
   end loop;
   if selected not between (g->>'min')::int and (g->>'max')::int then raise exception 'Check required modifiers for %',m.name; end if;
   matched:=matched+selected;
  end loop;
  if matched<>jsonb_array_length(option_ids) then raise exception 'One or more modifiers are unavailable'; end if;
  subtotal:=subtotal+price*q;
  if subtotal>100000000 then raise exception 'Order exceeds maximum amount'; end if;
  line:=jsonb_build_object('item_id',m.id,'name',m.name,'version',m.version,'quantity',q,'unit_minor',price::text,
   'selection',jsonb_build_object('variant',v,'options',opts),'note',n);
  lines:=lines||jsonb_build_array(line);
 end loop;
 return jsonb_build_object('quote_hash',encode(mf_private.fingerprint(s.id::text||lines::text),'hex'),
  'lines',lines,'subtotal_minor',subtotal::text,'currency',s.currency);
end $$;

create function mf_private.guest_state(g public.diner_grants,s public.dining_sessions) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('session',case when g.id is not null then jsonb_build_object('id',s.id,'status',s.status,
 'table_label',s.table_label,'table_id',s.table_id,'restaurant_id',s.restaurant_id,'is_host',g.is_host) end,
 'orders',coalesce((select jsonb_agg(mf_private.order_view(o,s) order by o.created_at desc) from public.orders o
 where o.session_id=s.id and o.guest_id=g.id),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(mf_private.request_view(r,s) order by r.created_at desc) from public.service_requests r
 where r.session_id=s.id and r.guest_id=g.id),'[]'::jsonb),
 'bill',case when g.is_host then mf_private.bill(s) end,
 'receipt',case when g.is_host and s.status='settled' and s.closed_at>now()-interval '1 day' then mf_private.receipt_view(s.id) end)
$$;

create function mf_private.staff_state(bid uuid,rid uuid,date_from date,date_to date) returns jsonb
language plpgsql stable set search_path=pg_catalog as $$
declare b public.branches; finance boolean; report boolean; all_tables boolean; a timestamptz; z timestamptz; stats jsonb;
begin
 perform mf_private.require_role(bid);
 select * into strict b from public.branches where id=bid and restaurant_id=rid;
 date_from:=coalesce(date_from,(now() at time zone b.timezone)::date); date_to:=coalesce(date_to,date_from);
 if date_to<date_from or date_to-date_from>366 then raise exception 'Select a date range of at most one year'; end if;
 a:=date_from::timestamp at time zone b.timezone; z:=(date_to+1)::timestamp at time zone b.timezone;
 report:=mf_private.has_role(bid,array['OWNER','MANAGER']);
 finance:=report or mf_private.has_role(bid,array['CASHIER']);
 all_tables:=finance or mf_private.has_role(bid,array['KITCHEN']);
 if report then
  with settled as (
   select r.snapshot snap,r.session_id from public.dining_receipts r join public.dining_sessions s on s.id=r.session_id
   where s.branch_id=bid and r.issued_at>=a and r.issued_at<z
  ), revenue as (
   select coalesce(sum((snap->>'eligible_minor')::bigint),0) sales,
   coalesce(sum((snap->>'tip_minor')::bigint),0) tips from settled
  ), completed as (select count(*) qty from public.orders o join settled on settled.session_id=o.session_id where o.status='served')
  select jsonb_build_object('revenue_minor',sales::text,'tips_minor',tips::text,
    'average_order_minor',coalesce(round(sales/nullif(qty,0)),0)::text,'completed_orders',qty,
    'order_count',(select count(*) from public.orders o join public.dining_sessions s on s.id=o.session_id
      where s.branch_id=bid and o.created_at>=a and o.created_at<z),
    'active_tables',(select count(*) from public.dining_sessions s where s.branch_id=bid and s.status in ('open','checkout')),
    'best_sellers',coalesce((select jsonb_agg(to_jsonb(pop) order by pop.quantity desc,pop.name) from
     (select l->>'name' name,sum((l->>'quantity')::int)::integer quantity from settled cross join lateral jsonb_array_elements(snap->'lines') l
      group by 1 order by 2 desc,1 limit 10) pop),'[]'::jsonb)) into stats from revenue,completed;
 end if;
 return jsonb_build_object('sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'table_id',s.table_id,
  'table_label',s.table_label,'status',s.status,'version',s.version,'waiter_id',s.waiter_id,
  'bill',case when finance or (s.waiter_id=auth.uid() and mf_private.has_role(bid,array['WAITER'])) then mf_private.bill(s) end)
  order by s.opened_at) from public.dining_sessions s where s.branch_id=bid and s.status in ('open','checkout')
  and (all_tables or s.waiter_id=auth.uid())),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(v order by created_at desc) from
   (select mf_private.order_view(o,s) v,o.created_at from public.orders o join public.dining_sessions s on s.id=o.session_id
    where s.branch_id=bid and (all_tables or s.waiter_id=auth.uid()) and (s.status in ('open','checkout') or (o.created_at>=a and o.created_at<z))
    order by (s.status in ('open','checkout')) desc,o.created_at desc limit 500) recent),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(mf_private.request_view(r,s) order by r.created_at desc)
    from public.service_requests r join public.dining_sessions s on s.id=r.session_id
    where s.branch_id=bid and (report or (s.waiter_id=auth.uid() and mf_private.has_role(bid,array['WAITER'])))
    and s.status in ('open','checkout')),'[]'::jsonb),
  'payments',case when finance then coalesce((select jsonb_agg(v order by issued_at desc) from
    (select mf_private.receipt_view(s.id) v,r.issued_at from public.dining_receipts r join public.dining_sessions s on s.id=r.session_id
    where s.branch_id=bid and r.issued_at>=a and r.issued_at<z order by r.issued_at desc limit 500) paid),'[]'::jsonb) else '[]'::jsonb end,
  'metrics',stats);
end $$;

create function mf_private.active_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.active and not new.active and exists(select from public.dining_sessions s where
  (case when tg_table_name='branches' then s.branch_id else s.table_id end)=old.id and s.status in ('open','checkout'))
 then raise exception 'Close active dining sessions before archiving'; end if;
 return new;
end $$;
create trigger mf_table_active before update of active on public.dining_tables for each row execute function mf_private.active_guard();
create trigger mf_branch_active before update of active on public.branches for each row execute function mf_private.active_guard();

create table public.admission_limits(table_id uuid primary key references public.dining_tables(id),window_at timestamptz not null,attempts int not null);
alter table public.admission_limits enable row level security;
revoke all on public.admission_limits from public,anon,authenticated;

create function mf_private.replay(sid uuid, actor uuid, op text, b jsonb) returns jsonb
language plpgsql stable set search_path=pg_catalog as $$
declare prev public.operation_keys;k uuid:=(b->>'key')::uuid;
begin
 if k is null then raise exception 'A request identifier is required'; end if;
 select * into prev from public.operation_keys where session_id=sid and actor_id=actor and action=op and key=k;
 if found then
  if prev.body_hash<>mf_private.fingerprint(b::text) then raise exception using errcode='40001',message='Request identifier already used'; end if;
  return prev.result;
 end if;
 return null;
end $$;
create function mf_private.remember(sid uuid, actor uuid, op text, b jsonb, res jsonb) returns void
language sql volatile set search_path=pg_catalog as $$
 insert into public.operation_keys values(sid,actor,op,(b->>'key')::uuid,mf_private.fingerprint(b::text),res)
$$;
create function mf_private.record_event(sid uuid, actor uuid, op text, facts jsonb default '{}') returns void
language sql volatile set search_path=pg_catalog as $$
 insert into public.operation_events(session_id,actor_id,action,details) values(sid,actor,op,facts)
$$;
create function mf_private.make_invite(sid uuid, loc uuid, host boolean) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare code text:=upper(left(replace(gen_random_uuid()::text,'-',''),12));
begin
 if loc is null then raise exception 'Generate a current table QR first'; end if;
 if (select count(*) from public.diner_invites where session_id=sid and expires_at>now())>=40 then raise exception 'Too many recent admission codes'; end if;
 if host then update public.diner_invites set consumed=true where session_id=sid and is_host and not consumed; end if;
 insert into public.diner_invites values(mf_private.fingerprint(code),sid,loc,host,now()+interval '5 minutes',false);
 return jsonb_build_object('sessionId',sid,'code',code,'expiresIn',300);
end $$;
create function mf_private.join_table(b jsonb, device text) returns jsonb language plpgsql set search_path=pg_catalog as $$
declare tab public.dining_tables;s public.dining_sessions;iv public.diner_invites;gid uuid;n int;
begin
 if device is null or length(device) not between 32 and 128 then raise exception 'Invalid device credential'; end if;
 select t.* into tab from public.dining_tables t join public.branches br on br.id=t.branch_id and br.active
 join public.restaurants r on r.id=t.restaurant_id and r.status='active' where t.qr_locator=(b->>'locator')::uuid and t.active for share of t,br,r;
 if not found then return jsonb_build_object('admissionError',true); end if;
 insert into public.admission_limits values(tab.id,date_trunc('minute',now()),1) on conflict(table_id) do update set
 attempts=case when public.admission_limits.window_at=excluded.window_at then least(1000,public.admission_limits.attempts+1) else 1 end,
 window_at=excluded.window_at returning attempts into n;
 if n>80 then return jsonb_build_object('rateLimited',true); end if;
 select * into s from public.dining_sessions where table_id=tab.id and status='open' for update;
 if not found then return jsonb_build_object('admissionError',true); end if;
 select * into iv from public.diner_invites where session_id=s.id and locator=tab.qr_locator
 and digest=mf_private.fingerprint(upper(btrim(b->>'code'))) and not consumed and expires_at>clock_timestamp() for update;
 if not found then return jsonb_build_object('admissionError',true); end if;
 update public.diner_invites set consumed=true where digest=iv.digest;
 if iv.is_host then
  update public.diner_grants set is_host=false where session_id=s.id and is_host;
  update public.diner_invites set consumed=true where session_id=s.id and is_host and not consumed;
 end if;
 insert into public.diner_grants(session_id,digest,is_host,expires_at) values(s.id,mf_private.fingerprint(device),iv.is_host,now()+interval '48 hours') returning id into gid;
 perform mf_private.record_event(s.id,gid,'join',jsonb_build_object('host',iv.is_host));
 return jsonb_build_object('sessionId',s.id);
end $$;

create function mf_private.guest_action(op text,b jsonb,device text) returns jsonb language plpgsql set search_path=pg_catalog as $$
declare g public.diner_grants;s public.dining_sessions;o public.orders; qt jsonb; l jsonb; result jsonb; cash jsonb;
 rid uuid; num int; note text:=coalesce(b->>'note',''); pct int; tip bigint;
begin
 if length(device) between 32 and 128 then
  select * into g from public.diner_grants where digest=mf_private.fingerprint(device) and expires_at>now();
 end if;
 if g.id is not null then
  if op='guestState' then
   select ss.* into s from public.dining_sessions ss join public.branches br on br.id=ss.branch_id and br.active
    join public.restaurants rr on rr.id=ss.restaurant_id and rr.status='active' where ss.id=g.session_id
    and (ss.status in ('open','checkout') or (ss.status='settled' and ss.closed_at>now()-interval '1 day'));
  else
   select ss.* into s from public.dining_sessions ss join public.branches br on br.id=ss.branch_id and br.active
    join public.restaurants rr on rr.id=ss.restaurant_id and rr.status='active' where ss.id=g.session_id
    and (ss.status in ('open','checkout') or (ss.status='settled' and ss.closed_at>now()-interval '1 day')) for update of ss;
   -- Recheck grants after acquiring the session lock, including a concurrent host transfer.
   select * into g from public.diner_grants where id=g.id and expires_at>clock_timestamp();
  end if;
 end if;
 if s.id is null then g:=null; end if;
 if op='guestState' then return mf_private.guest_state(g,s); end if;
 if g.id is null then raise exception using errcode='42501',message='Admission required'; end if;
 if op='order' then result:=mf_private.replay(s.id,g.id,op,b); if result is not null then return result; end if; end if;
 if s.status<>'open' and not(op='checkout' and s.status='checkout') then raise exception using errcode='40001',message='Session is closed for ordering'; end if;
 case op
 when 'quote','order' then
  qt:=mf_private.quote(s,b->'items'); if op='quote' then return qt; end if;
  if (b->>'quoteHash') is distinct from (qt->>'quote_hash') then raise exception using errcode='40001',message='Menu changed; review your quote'; end if;
  if length(note)>500 then raise exception 'Instructions are too long'; end if;
  if (select count(*) from public.orders where guest_id=g.id and created_at>now()-interval '1 minute')>=6 then raise exception 'Too many recent orders; please wait'; end if;
  select table_number into num from public.dining_tables where id=s.table_id;
  insert into public.orders(restaurant_id,table_number,session_id,guest_id,subtotal,total,note)
   values(s.restaurant_id,num,s.id,g.id,(qt->>'subtotal_minor')::numeric/100,(qt->>'subtotal_minor')::numeric/100,note) returning * into o;
  for l in select value from jsonb_array_elements(qt->'lines') loop
   insert into public.order_items(order_id,menu_item_id,name,quantity,unit_price,selection,note)
    values(o.id,(l->>'item_id')::uuid,l->>'name',(l->>'quantity')::int,(l->>'unit_minor')::numeric/100,l->'selection',l->>'note');
  end loop;
  update public.dining_sessions set version=version+1,tip_minor=0 where id=s.id;
  result:=jsonb_build_object('id',o.id); perform mf_private.remember(s.id,g.id,op,b,result);
 when 'cancel' then
  select * into o from public.orders where id=(b->>'orderId')::uuid and session_id=s.id and guest_id=g.id;
  if not found then raise no_data_found; end if;
  if exists(select from public.order_items where order_id=o.id and status<>'new') then raise exception 'Only a newly submitted order can be cancelled'; end if;
  update public.order_items set status='cancelled' where order_id=o.id;
  update public.orders set status='cancelled' where id=o.id;
  update public.dining_sessions set version=version+1,tip_minor=0 where id=s.id;
  result:=jsonb_build_object('id',o.id);
 when 'request' then
  if length(note)>300 or coalesce(b->>'category','') not in ('water','waiter','other') then raise exception 'Invalid service request'; end if;
  select id into rid from public.service_requests where guest_id=g.id and category=b->>'category' and status<>'completed';
  if rid is null then
   if (select count(*) from public.service_requests where guest_id=g.id and created_at>now()-interval '1 minute')>=5 then raise exception 'Too many recent requests'; end if;
   insert into public.service_requests(session_id,guest_id,category,note) values(s.id,g.id,b->>'category',note) returning id into rid;
  end if;
  result:=jsonb_build_object('id',rid);
 when 'checkout' then
  if not g.is_host then raise exception using errcode='42501',message='Bill host required'; end if;
  if (b->>'version')::int is distinct from s.version then raise exception using errcode='40001',message='Bill changed'; end if;
  if exists(select from public.order_items i join public.orders h on h.id=i.order_id where h.session_id=s.id and i.status not in ('served','cancelled')) then raise exception 'Please wait for all items to be served'; end if;
  cash:=mf_private.bill(s);
  if b ? 'tipPercent' and b ? 'tipMinor' then raise exception 'Choose only one tip option'; end if;
  if b ? 'tipMinor' then
   if coalesce(b->>'tipMinor','')!~'^[0-9]{1,10}$' then raise exception 'Invalid tip'; end if;
   tip:=(b->>'tipMinor')::bigint;
  else
   pct:=coalesce((b->>'tipPercent')::int,0);
   if pct not in (0,5,10,15) then raise exception 'Invalid tip percentage'; end if;
   tip:=round((cash->>'eligible_minor')::numeric*pct/100);
  end if;
  if (tip>0 and not s.tipping_enabled) or tip>least(100000000,(cash->>'eligible_minor')::bigint) then raise exception 'Tip exceeds the allowed amount'; end if;
  update public.dining_sessions set version=version+1,status='checkout',tip_minor=tip where id=s.id returning * into s;
  result:=mf_private.bill(s);
  insert into public.bill_revisions(session_id,version,snapshot,host_id) values(s.id,s.version,result,g.id);
  update public.diner_invites set consumed=true where session_id=s.id and not consumed;
 else raise exception 'Invalid guest action';
 end case;
 perform mf_private.record_event(s.id,g.id,op,case when op='checkout' then jsonb_build_object('version',s.version,'tipMinor',tip) else result end);
 return result;
end $$;

create function mf_private.staff_action(op text,b jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
declare rid uuid:=(b->>'restaurantId')::uuid;bid uuid:=(b->>'branchId')::uuid;sid uuid;actor uuid:=auth.uid();
 tab public.dining_tables;br public.branches;s public.dining_sessions;o public.orders;req public.service_requests;
 target text:=b->>'status';result jsonb;cash jsonb;tender bigint;payable bigint;rcid uuid;line_id uuid;oldstate text;
 count_lines int;next_order_state text; discounted bigint; waiter uuid; change_reason text:=btrim(coalesce(b->>'reason',''));
begin
 if actor is null then raise exception using errcode='42501',message='Sign in required'; end if;
 if op='staffState' then return mf_private.staff_state(bid,rid,(b->>'from')::date,(b->>'to')::date); end if;
 if op='open' then
  select t.* into tab from public.dining_tables t where t.id=(b->>'tableId')::uuid and t.restaurant_id=rid and t.active
   and (bid is null or t.branch_id=bid) and mf_private.has_role(t.branch_id,array['OWNER','MANAGER','WAITER']) for update;
  if tab.id is null then raise no_data_found; end if;
  select * into strict br from public.branches where id=tab.branch_id and active for share;
  if tab.qr_locator is null then raise exception 'Generate a table QR before opening this table'; end if;
  if exists(select from public.dining_sessions where table_id=tab.id and status in ('open','checkout')) then raise exception using errcode='40001',message='Table already occupied'; end if;
  insert into public.dining_sessions(restaurant_id,branch_id,table_id,table_label,currency,tax_bps,service_bps,tipping_enabled,waiter_id,opened_by)
  values(rid,br.id,tab.id,tab.label,br.currency,br.tax_bps,br.service_bps,br.tipping_enabled,
   case when mf_private.has_role(br.id,array['WAITER']) then actor end,actor) returning * into s;
  result:=mf_private.make_invite(s.id,tab.qr_locator,true); perform mf_private.record_event(s.id,actor,op); return result;
 end if;
 if op='transition' then select session_id into sid from public.orders where id=(b->>'orderId')::uuid;
 elsif op='requestStatus' then select session_id into sid from public.service_requests where id=(b->>'id')::uuid;
 else sid:=(b->>'sessionId')::uuid; end if;
 select ss.* into s from public.dining_sessions ss where ss.id=sid and ss.restaurant_id=rid and (bid is null or bid=ss.branch_id)
  and mf_private.has_role(ss.branch_id) for update;
 if not found then raise no_data_found; end if;
 bid:=s.branch_id;
 if op in ('issueCode','requestStatus') or (op='transition' and target='served') then
  if not mf_private.has_role(bid,array['OWNER','MANAGER']) and not(s.waiter_id is not distinct from actor and mf_private.has_role(bid,array['WAITER'])) then
   raise exception using errcode='42501',message='Assigned waiter required';
  end if;
 end if;
 if op='settle' then
  perform mf_private.require_role(bid,array['CASHIER']);
  result:=mf_private.replay(s.id,actor,op,b); if result is not null then return result; end if;
 end if;
 if s.status in ('settled','void') then raise exception using errcode='40001',message='Session already closed'; end if;
 case op
 when 'issueCode' then
  if s.status<>'open' then raise exception 'Reopen the session before issuing a code'; end if;
  select * into tab from public.dining_tables where id=s.table_id and active;
  result:=mf_private.make_invite(s.id,tab.qr_locator,coalesce((b->>'host')::boolean,false));
 when 'assign' then
  perform mf_private.require_role(bid,array['OWNER','MANAGER']);
  if s.status<>'open' then raise exception 'Waiter assignment is frozen during checkout'; end if;
  waiter:=(b->>'waiterId')::uuid;
  if not exists(select from public.staff_branch_roles where user_id=waiter and branch_id=bid and active and 'WAITER'=any(roles)) then raise exception 'Choose an active branch waiter'; end if;
  update public.dining_sessions set waiter_id=waiter where id=s.id; result:=jsonb_build_object('waiterId',waiter);
 when 'transition' then
  if s.status<>'open' then raise exception 'Session is frozen'; end if;
  select * into strict o from public.orders where id=(b->>'orderId')::uuid and session_id=s.id;
  line_id:=(b->>'itemId')::uuid;
  case target
   when 'accepted' then oldstate:='new'; perform mf_private.require_role(bid,array['KITCHEN']);
   when 'preparing' then oldstate:='accepted'; perform mf_private.require_role(bid,array['KITCHEN']);
   when 'ready' then oldstate:='preparing'; perform mf_private.require_role(bid,array['KITCHEN']);
   when 'served' then oldstate:='ready'; perform mf_private.require_role(bid,array['WAITER']);
   when 'cancelled' then
    perform mf_private.require_role(bid,array['MANAGER','OWNER']);
    if length(change_reason) not between 1 and 250 then raise exception 'Cancellation requires a reason'; end if;
   else raise exception 'Unknown transition';
  end case;
  -- A bulk transition advances all currently eligible lines, never skipping a step.
  update public.order_items set status=target where order_id=o.id and (line_id is null or id=line_id)
   and (status=oldstate or (target='cancelled' and status not in ('cancelled','served')));
  get diagnostics count_lines=row_count; if count_lines=0 then raise exception using errcode='40001',message='Order state changed'; end if;
  select status into next_order_state from public.order_items where order_id=o.id and status<>'cancelled'
   order by array_position(array['new','accepted','preparing','ready','served'],status) limit 1;
  update public.orders set status=coalesce(next_order_state,'cancelled') where id=o.id;
  update public.dining_sessions set version=version+1,tip_minor=0 where id=s.id;
  result:=jsonb_build_object('id',o.id,'status',coalesce(next_order_state,'cancelled'),'itemId',line_id,'target',target,'reason',change_reason);
 when 'requestStatus' then
  select * into strict req from public.service_requests where id=(b->>'id')::uuid and session_id=s.id;
  if target is null or not ((target='acknowledged' and req.status='requested') or (target='completed' and req.status='acknowledged')) then raise exception 'Invalid service request transition'; end if;
  update public.service_requests set status=target,updated_by=actor where id=req.id;
  result:=jsonb_build_object('id',req.id,'status',target);
 when 'discount' then
  perform mf_private.require_role(bid,array['OWNER','MANAGER']);
  if s.status<>'open' then raise exception 'Reopen the bill before adjusting it'; end if;
  if coalesce(b->>'amountMinor','')!~'^[0-9]{1,12}$' or length(change_reason) not between 1 and 250 then raise exception 'Provide a valid discount and reason'; end if;
  discounted:=(b->>'amountMinor')::bigint; cash:=mf_private.bill(s);
  if discounted>(cash->>'subtotal_minor')::bigint then raise exception 'Discount exceeds the subtotal'; end if;
  update public.dining_sessions set discount_minor=discounted,version=version+1,tip_minor=0 where id=s.id returning * into s;
  result:=jsonb_build_object('version',s.version,'discount_minor',discounted::text,'reason',change_reason);
 when 'reopen' then
  perform mf_private.require_role(bid,array['OWNER','MANAGER']);
  if s.status<>'checkout' then raise exception 'Only a bill in checkout can be reopened'; end if;
  update public.dining_sessions set status='open',version=version+1,tip_minor=0 where id=s.id returning * into s;
  result:=jsonb_build_object('version',s.version);
 when 'void' then
  perform mf_private.require_role(bid,array['OWNER','MANAGER']);
  if exists(select from public.order_items i join public.orders h on h.id=i.order_id where h.session_id=s.id and i.status<>'cancelled')
   then raise exception 'Only an empty or fully cancelled session can be voided'; end if;
  update public.dining_sessions set status='void',version=version+1,closed_at=now() where id=s.id;
  result:=jsonb_build_object('id',s.id);
 when 'settle' then
  if s.status<>'checkout' or (b->>'version')::int is distinct from s.version then raise exception using errcode='40001',message='Current checkout revision required'; end if;
  if exists(select from public.order_items i join public.orders h on h.id=i.order_id where h.session_id=s.id and i.status not in ('served','cancelled')) then raise exception 'All chargeable items must be served'; end if;
  select snapshot into strict cash from public.bill_revisions where session_id=s.id and version=s.version;
  payable:=(cash->>'total_minor')::bigint;
  if coalesce(b->>'tenderMinor','')!~'^[0-9]{1,13}$' then raise exception 'Enter received cash in minor units'; end if;
  tender:=(b->>'tenderMinor')::bigint;
  if tender<payable or (payable=0 and tender<>0) then raise exception 'Received cash does not cover the bill'; end if;
  cash:=cash||jsonb_build_object('restaurant_name',(select name from public.restaurants where id=rid),
   'branch_name',(select name from public.branches where id=bid),'table_label',s.table_label,'tip_waiter_id',s.waiter_id);
  insert into public.dining_receipts(session_id,version,cashier_id,tip_waiter_id,snapshot) values(s.id,s.version,actor,s.waiter_id,cash) returning id into rcid;
  if payable>0 then insert into public.cash_payments values(rcid,payable,tender,tender-payable); end if;
  update public.dining_sessions set status='settled',closed_at=now() where id=s.id;
  result:=mf_private.receipt_view(s.id); perform mf_private.remember(s.id,actor,op,b,result);
 else raise exception 'Unknown staff operation';
 end case;
 perform mf_private.record_event(s.id,actor,op,case when op='issueCode' then jsonb_build_object('host',coalesce((b->>'host')::boolean,false))
  when op='settle' then jsonb_build_object('receiptId',rcid,'version',s.version,'amountMinor',payable) else result end);
 return result;
end $$;

create function public.mf_operations(p_action text,p_body jsonb,p_device text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>131072 then raise exception 'Invalid operations request'; end if;
 if p_action='join' then return mf_private.join_table(p_body,p_device); end if;
 if p_action in ('guestState','quote','order','cancel','request','checkout') then
  return mf_private.guest_action(p_action,p_body,p_device);
 end if;
 return mf_private.staff_action(p_action,p_body);
end $$;
revoke all on function public.mf_operations(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.mf_operations(text,jsonb,text) to anon,authenticated;
revoke all on all functions in schema mf_private from public,anon,authenticated;
commit;
