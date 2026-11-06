-- Run in Supabase SQL Editor. One demo restaurant, real shared orders, staff-only operations.
create extension if not exists pgcrypto;
create table if not exists public.restaurants(id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,created_at timestamptz not null default now());
create table if not exists public.menu_items(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id),name text not null,category text not null,description text not null default '',price numeric(12,2) not null check(price>=0),emoji text not null default '🍽️',available boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.staff_members(user_id uuid not null references auth.users(id) on delete cascade,restaurant_id uuid not null references public.restaurants(id),primary key(user_id,restaurant_id));
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id),table_number integer not null check(table_number between 1 and 999),status text not null default 'new' check(status in ('new','preparing','ready','served','cancelled')),subtotal numeric(12,2) not null,tip numeric(12,2) not null default 0,total numeric(12,2) not null,note text not null default '',created_at timestamptz not null default now());
create table if not exists public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,menu_item_id uuid not null references public.menu_items(id),name text not null,quantity integer not null check(quantity between 1 and 20),unit_price numeric(12,2) not null);
create index if not exists menu_items_restaurant_idx on public.menu_items(restaurant_id);
create index if not exists orders_restaurant_created_idx on public.orders(restaurant_id,created_at desc);
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.staff_members enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "public restaurants" on public.restaurants;
create policy "public restaurants" on public.restaurants for select to anon,authenticated using(true);
drop policy if exists "public available menu" on public.menu_items;
create policy "public available menu" on public.menu_items for select to anon,authenticated using(available or exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id));
drop policy if exists "staff menu insert" on public.menu_items;
create policy "staff menu insert" on public.menu_items for insert to authenticated with check(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id));
drop policy if exists "staff menu update" on public.menu_items;
create policy "staff menu update" on public.menu_items for update to authenticated using(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id)) with check(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id));
drop policy if exists "own staff memberships" on public.staff_members;
create policy "own staff memberships" on public.staff_members for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "staff orders" on public.orders;
create policy "staff orders" on public.orders for select to authenticated using(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id));
drop policy if exists "staff order updates" on public.orders;
create policy "staff order updates" on public.orders for update to authenticated using(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id)) with check(exists(select 1 from public.staff_members s where s.user_id=(select auth.uid()) and s.restaurant_id=restaurant_id));
drop policy if exists "staff order lines" on public.order_items;
create policy "staff order lines" on public.order_items for select to authenticated using(exists(select 1 from public.orders o join public.staff_members s on s.restaurant_id=o.restaurant_id where o.id=order_id and s.user_id=(select auth.uid())));
insert into public.restaurants(slug,name) values('demo','MenuFlow Demo Café') on conflict(slug) do nothing;
insert into public.menu_items(restaurant_id,name,category,description,price,emoji)
select r.id,x.name,x.category,x.description,x.price,x.emoji from public.restaurants r cross join (values
('Shiro Tegamino','Ethiopian','Chickpea stew with injera',240,'🍲'),
('Tibs','Ethiopian','Sizzling beef and peppers',460,'🥘'),
('Vegetable Combo','Ethiopian','Vegetables with injera',310,'🥗'),
('Chicken Sandwich','Lunch','Grilled chicken sandwich',330,'🥪'),
('Macchiato','Drinks','Espresso and steamed milk',95,'☕'),
('Fresh Mango Juice','Drinks','Blended mango',150,'🥭')) x(name,category,description,price,emoji)
where r.slug='demo' and not exists(select 1 from public.menu_items m where m.restaurant_id=r.id and m.name=x.name);
-- Anonymous order creation happens only through this SECURITY DEFINER function.
create or replace function public.place_order(p_slug text,p_table integer,p_items jsonb,p_tip_percent integer default 0,p_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; oid uuid; line jsonb; mid uuid; qty integer; price numeric; item_name text; amount numeric:=0; gratuity numeric; n integer:=0;
begin
 if p_table not between 1 and 999 or p_tip_percent not in (0,5,10,15) or length(coalesce(p_note,''))>500 then raise exception 'Invalid order input'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Invalid order items'; end if;
 select id into rid from public.restaurants where slug=p_slug;
 if rid is null then raise exception 'Restaurant not found'; end if;
 for line in select value from jsonb_array_elements(p_items) loop
  mid:=(line->>'id')::uuid; qty:=(line->>'qty')::integer;
  if qty not between 1 and 20 then raise exception 'Invalid quantity'; end if;
  select m.price,m.name into price,item_name from public.menu_items m where m.id=mid and m.restaurant_id=rid and m.available;
  if not found then raise exception 'Item unavailable'; end if;
  amount:=amount+price*qty; n:=n+1;
 end loop;
 if amount>1000000 then raise exception 'Order limit exceeded'; end if;
 gratuity:=round(amount*p_tip_percent/100,2);
 insert into public.orders(restaurant_id,table_number,subtotal,tip,total,note) values(rid,p_table,amount,gratuity,amount+gratuity,coalesce(p_note,'')) returning id into oid;
 for line in select value from jsonb_array_elements(p_items) loop
  mid:=(line->>'id')::uuid; qty:=(line->>'qty')::integer;
  select m.price,m.name into price,item_name from public.menu_items m where m.id=mid;
  insert into public.order_items(order_id,menu_item_id,name,quantity,unit_price) values(oid,mid,item_name,qty,price);
 end loop;
 return oid;
end $$;
revoke all on function public.place_order(text,integer,jsonb,integer,text) from public;
grant execute on function public.place_order(text,integer,jsonb,integer,text) to anon,authenticated;
-- Assign staff manually after inviting an account in Supabase Auth:
-- insert into public.staff_members(user_id,restaurant_id)
-- select 'AUTH_USER_UUID'::uuid,id from public.restaurants where slug='demo';
