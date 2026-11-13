begin;
create table public.gateway_payments (
  tx_ref uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dining_sessions(id),
  version int not null, amount_minor bigint not null check (amount_minor>0), currency text not null,
  state text not null default 'pending' check(state in ('pending','paid','failed')),
  checkout_url text, provider_reference text unique, created_at timestamptz not null default now(),
  verified_at timestamptz, foreign key(session_id,version) references public.bill_revisions(session_id,version)
);
create unique index mf_one_gateway_payment on public.gateway_payments(session_id) where state in ('pending','paid');
alter table public.gateway_payments enable row level security;
revoke all on public.gateway_payments from public,anon,authenticated;
alter table public.dining_receipts alter column cashier_id drop not null;
alter table public.dining_receipts add column gateway_reference uuid unique references public.gateway_payments(tx_ref);
alter table public.dining_receipts add constraint mf_receipt_authority check(num_nonnulls(cashier_id,gateway_reference)=1);

create function mf_private.gateway_freeze() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if exists(select from public.gateway_payments where session_id=old.id and state='pending') then
    raise exception using errcode='40001',message='A gateway payment is awaiting verification';
  end if;
  return new;
end $$;
create trigger mf_gateway_checkout_guard before update on public.dining_sessions
  for each row execute function mf_private.gateway_freeze();

-- Only the configured merchant's trusted server may call the gateway functions.
-- Session locks are acquired before payment locks in every settlement path.
create function public.mf_gateway_begin(p_session uuid,p_version int,p_device text,p_merchant uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.dining_sessions; g public.diner_grants; p public.gateway_payments; snap jsonb;
begin
  select * into strict s from public.dining_sessions where id=p_session and restaurant_id=p_merchant for update;
  select * into strict g from public.diner_grants where session_id=s.id and digest=mf_private.fingerprint(p_device)
    and is_host and expires_at>now();
  if s.status<>'checkout' or s.version is distinct from p_version or s.currency<>'ETB'
     or not exists(select from public.restaurants r join public.branches b on b.restaurant_id=r.id
        where r.id=p_merchant and r.status='active' and b.id=s.branch_id and b.active) then
    raise exception using errcode='40001',message='Current checkout required';
  end if;
  select snapshot into strict snap from public.bill_revisions where session_id=s.id and version=s.version and host_id=g.id;
  if (snap->>'total_minor')::bigint<=0 then raise exception 'Positive balance required'; end if;
  select * into p from public.gateway_payments where session_id=s.id and state='pending';
  if p.tx_ref is null then
    insert into public.gateway_payments(session_id,version,amount_minor,currency) values(s.id,s.version,(snap->>'total_minor')::bigint,s.currency) returning * into p;
  end if;
  return jsonb_build_object('txRef',p.tx_ref,'amountMinor',p.amount_minor::text,'currency',p.currency,'checkoutUrl',p.checkout_url);
end $$;

create function public.mf_gateway_verify(p_ref uuid,p_merchant uuid,p_reference text,p_amount bigint,p_currency text,p_success boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare s public.dining_sessions; p public.gateway_payments; snap jsonb; receipt uuid;
begin
  select ds.* into strict s from public.dining_sessions ds join public.gateway_payments gp on gp.session_id=ds.id
    where ds.restaurant_id=p_merchant and gp.tx_ref=p_ref for update of ds;
  select * into strict p from public.gateway_payments where tx_ref=p_ref for update;
  if p_amount is distinct from p.amount_minor or p_currency is distinct from p.currency then raise exception 'Verification mismatch'; end if;
  if p.state='paid' then
    if p_success is distinct from true or p_reference is distinct from p.provider_reference then raise exception 'Conflicting provider result'; end if;
    select id into strict receipt from public.dining_receipts where gateway_reference=p_ref; return receipt;
  end if;
  if p_success is false then
    update public.gateway_payments set state='failed',verified_at=now() where tx_ref=p_ref; return null;
  end if;
  if p_success is distinct from true or coalesce(length(p_reference),0) not between 1 and 160 or p.state<>'pending'
     or s.status<>'checkout' or s.version<>p.version then raise exception 'Settlement requires reconciliation'; end if;
  select snapshot into strict snap from public.bill_revisions where session_id=s.id and version=p.version;
  if (snap->>'total_minor')::bigint is distinct from p_amount then raise exception 'Invoice amount changed'; end if;
  update public.gateway_payments set state='paid',verified_at=now(),provider_reference=p_reference where tx_ref=p_ref;
  snap:=snap||jsonb_build_object('restaurant_name',(select name from public.restaurants where id=s.restaurant_id),
    'branch_name',(select name from public.branches where id=s.branch_id),'table_label',s.table_label,'tip_waiter_id',s.waiter_id);
  insert into public.dining_receipts(session_id,version,tip_waiter_id,snapshot,gateway_reference)
    values(s.id,s.version,s.waiter_id,snap,p_ref) returning id into receipt;
  update public.dining_sessions set status='settled',closed_at=now() where id=s.id;
  insert into public.operation_events(session_id,actor_id,action,details)
    values(s.id,p_ref,'chapa.verified',jsonb_build_object('receiptId',receipt,'providerReference',p_reference));
  return receipt;
end $$;

create or replace function mf_private.receipt_view(sid uuid) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',r.id,'issued_at',r.issued_at,'snapshot',r.snapshot,
  'kind',case when r.gateway_reference is not null then 'chapa' when c.receipt_id is not null then 'cash' else 'zero_balance' end,
  'tender_minor',c.tender_minor::text,'change_minor',c.change_minor::text)
 from public.dining_receipts r left join public.cash_payments c on c.receipt_id=r.id where r.session_id=sid
$$;
revoke all on function public.mf_gateway_begin(uuid,int,text,uuid),public.mf_gateway_verify(uuid,uuid,text,bigint,text,boolean)
  from public,anon,authenticated;
grant execute on function public.mf_gateway_begin(uuid,int,text,uuid),public.mf_gateway_verify(uuid,uuid,text,bigint,text,boolean) to service_role;
grant select,update(checkout_url) on public.gateway_payments to service_role;
commit;
