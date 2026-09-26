-- AeroDIMMS MVP operational schema.
-- Safe to run more than once. This migration does not alter public.profiles.
-- Requires Supabase PostGIS, enabled here in the extensions schema.

create extension if not exists postgis with schema extensions;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null,
  name text not null,
  asset_type text not null,
  area text,
  location extensions.geography(point, 4326) not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_asset_id_key unique (asset_id)
);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  finding_id text not null,
  title text not null,
  description text,
  -- These are the two source values used by the existing frontend.
  source text not null check (source in ('INTERNAL_INSPECTION', 'REGULATORY')),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'FINDING' check (status in (
    'FINDING', 'ASSIGNED', 'WORK_ORDER', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED'
  )),
  location extensions.geography(point, 4326) not null,
  asset_id uuid references public.assets (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint findings_finding_id_key unique (finding_id)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings (id) on delete cascade,
  work_order_number text not null,
  title text not null,
  description text,
  assigned_to uuid references public.profiles (id) on delete set null,
  status text not null default 'ASSIGNED' check (status in (
    'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
  )),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_work_order_number_key unique (work_order_number)
);

-- Migrate values and the prior check constraint if this script was already run.
update public.work_orders
set status = case status
  when 'Assigned' then 'ASSIGNED'
  when 'In Progress' then 'IN_PROGRESS'
  when 'Completed' then 'COMPLETED'
  when 'Cancelled' then 'CANCELLED'
  else status
end
where status in ('Assigned', 'In Progress', 'Completed', 'Cancelled');

alter table public.work_orders
  drop constraint if exists work_orders_status_check;
alter table public.work_orders
  add constraint work_orders_status_check
  check (status in ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));

-- Only indexes needed for MVP identifiers and common filters/relations.
create index if not exists findings_status_idx on public.findings (status);
create index if not exists findings_severity_idx on public.findings (severity);
create index if not exists findings_source_idx on public.findings (source);
create index if not exists findings_assigned_to_idx on public.findings (assigned_to);
create index if not exists findings_asset_id_idx on public.findings (asset_id);
create index if not exists work_orders_finding_id_idx on public.work_orders (finding_id);

create or replace function public.set_operational_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_operational_updated_at();

drop trigger if exists findings_set_updated_at on public.findings;
create trigger findings_set_updated_at
before update on public.findings
for each row execute function public.set_operational_updated_at();

drop trigger if exists work_orders_set_updated_at on public.work_orders;
create trigger work_orders_set_updated_at
before update on public.work_orders
for each row execute function public.set_operational_updated_at();

alter table public.assets enable row level security;
alter table public.findings enable row level security;
alter table public.work_orders enable row level security;

-- Signed-in users can work with operational records. RLS remains the database
-- boundary; role-specific access can be added later without changing profiles.
drop policy if exists "Authenticated users can manage assets" on public.assets;
create policy "Authenticated users can manage assets" on public.assets
for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage findings" on public.findings;
create policy "Authenticated users can manage findings" on public.findings
for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage work orders" on public.work_orders;
create policy "Authenticated users can manage work orders" on public.work_orders
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.findings to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;

-- Map coordinates use longitude, latitude order, for example:
-- ST_SetSRID(ST_MakePoint(100.274163, 5.298179), 4326)::extensions.geography
