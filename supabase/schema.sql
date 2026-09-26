-- AeroDIMMS operational schema. Run after profiles.sql in Supabase SQL Editor.
-- User references use profiles.employee_id so existing profiles remain authoritative.
create table if not exists public.assets (
  id text primary key, asset_code text not null unique, name text not null,
  asset_type text not null, status text not null, location_name text not null,
  latitude double precision not null, longitude double precision not null
);
create table if not exists public.findings (
  id text primary key, finding_code text not null unique,
  source text not null check (source in ('INTERNAL_INSPECTION', 'REGULATORY')),
  title text not null, description text not null,
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status text not null check (status in ('FINDING', 'ASSIGNED', 'WORK_ORDER', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED')),
  location_name text not null, latitude double precision not null, longitude double precision not null,
  asset_id text references public.assets(id) on delete set null, airport_stand_code text,
  assigned_to_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  assigned_team text, target_completion_date date,
  created_by_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.work_orders (
  id text primary key, work_order_code text not null unique,
  finding_id text not null references public.findings(id) on delete cascade,
  assigned_to_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  assigned_team text, corrective_action text not null, target_completion_date date,
  remarks text, status text not null, created_at timestamptz not null, updated_at timestamptz not null
);
create table if not exists public.evidence (
  id text primary key, finding_id text not null references public.findings(id) on delete cascade,
  file_name text not null, storage_path text not null, mime_type text not null,
  uploaded_by_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  created_at timestamptz not null
);
create table if not exists public.issue_history (
  id text primary key, finding_id text not null references public.findings(id) on delete cascade,
  user_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  action text not null, previous_status text, new_status text, remarks text, created_at timestamptz not null
);
alter table public.assets enable row level security;
alter table public.findings enable row level security;
alter table public.work_orders enable row level security;
alter table public.evidence enable row level security;
alter table public.issue_history enable row level security;
do $$
declare t text;
begin
  foreach t in array array['assets', 'findings', 'work_orders', 'evidence', 'issue_history'] loop
    execute format('drop policy if exists "Authenticated users can read %s" on public.%I', t, t);
    execute format('create policy "Authenticated users can read %s" on public.%I for select to authenticated using (true)', t, t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
