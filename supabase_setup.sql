-- VR Spoedkoerier - Supabase setup
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  created_at timestamptz not null default now(),
  pickup text not null,
  dropoff text not null,
  distance_km numeric(10,2) not null,
  duration_seconds integer,
  price numeric(10,2) not null,
  status text not null default 'Aangevraagd',
  order_type text not null default 'direct',
  parcel_type text,
  weight_kg numeric(10,2),
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  pickup_time text
);

alter table public.orders enable row level security;

-- Klanten zonder account mogen uitsluitend nieuwe aanvragen toevoegen.
drop policy if exists "anon can create orders" on public.orders;
create policy "anon can create orders"
on public.orders for insert
to anon
with check (true);

-- Ingelogde beheerders mogen alle orders lezen en bijwerken.
drop policy if exists "authenticated can read orders" on public.orders;
create policy "authenticated can read orders"
on public.orders for select
to authenticated
using (true);

drop policy if exists "authenticated can update orders" on public.orders;
create policy "authenticated can update orders"
on public.orders for update
to authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant insert on public.orders to anon;
grant select, update on public.orders to authenticated;
