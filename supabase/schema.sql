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
  phase text check (phase in ('BEFORE', 'AFTER')),
  file_size bigint,
  uploaded_by_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  created_at timestamptz not null
);
-- Keep reruns on existing databases compatible with the current upload metadata.
alter table public.evidence add column if not exists file_size bigint;
alter table public.evidence add column if not exists phase text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.evidence'::regclass and conname = 'evidence_phase_check'
  ) then
    alter table public.evidence add constraint evidence_phase_check check (phase in ('BEFORE', 'AFTER'));
  end if;
end $$;
create table if not exists public.issue_history (
  id text primary key, finding_id text not null references public.findings(id) on delete cascade,
  user_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  action text not null, previous_status text, new_status text, remarks text, created_at timestamptz not null
);

-- Enforce required work photos for every update path, including direct table updates.
create or replace function public.require_finding_work_photos()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'IN_PROGRESS' and new.status = 'PENDING_VERIFICATION' and not (
    exists (select 1 from public.evidence where finding_id = old.id and phase = 'BEFORE')
    and exists (select 1 from public.evidence where finding_id = old.id and phase = 'AFTER')
  ) then
    raise exception 'A before-work photo and an after-work photo are required before verification';
  end if;
  return new;
end;
$$;

drop trigger if exists findings_require_work_photos on public.findings;
create trigger findings_require_work_photos
before update of status on public.findings
for each row execute function public.require_finding_work_photos();

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

-- Evidence uploads are authorized by the RLS policy in inspection-schema.sql.
-- Keep the table privilege in place when this schema is re-run after that file.
grant insert on public.evidence to authenticated;

-- Allow signed-in users to create findings. Inspection-specific columns and
-- nullable GPS are added by inspection-schema.sql.
drop policy if exists "Authenticated users can create findings" on public.findings;
create policy "Authenticated users can create findings"
on public.findings for insert to authenticated with check (true);
grant insert on public.findings to authenticated;

-- Allow authenticated users to change a finding's status and record the change
-- atomically through the update_finding_status RPC.
drop policy if exists "Authenticated users can update finding status" on public.findings;
create policy "Authenticated users can update finding status"
on public.findings for update to authenticated
using (true) with check (true);
grant update (status, updated_at) on public.findings to authenticated;

drop policy if exists "Authenticated users can record own finding history" on public.issue_history;
create policy "Authenticated users can record own finding history"
on public.issue_history for insert to authenticated
with check (
  user_employee_id in (
    select employee_id from public.profiles where id = (select auth.uid())
  )
);
grant insert (id, finding_id, user_employee_id, action, previous_status, new_status, remarks, created_at)
on public.issue_history to authenticated;

create or replace function public.update_finding_status(
  p_finding_id text,
  p_new_status text,
  p_action text,
  p_remarks text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_employee_id text;
  v_previous_status text;
begin
  select employee_id into v_employee_id
  from public.profiles
  where id = (select auth.uid());

  if v_employee_id is null then
    raise exception 'A linked AeroDIMMS profile is required';
  end if;

  select status into v_previous_status
  from public.findings
  where id = p_finding_id
  for update;

  if v_previous_status is null then
    raise exception 'Finding not found';
  end if;

  if not (
    (v_previous_status = 'FINDING' and p_new_status = 'ASSIGNED') or
    (v_previous_status = 'ASSIGNED' and p_new_status = 'WORK_ORDER') or
    (v_previous_status = 'WORK_ORDER' and p_new_status = 'IN_PROGRESS') or
    (v_previous_status = 'IN_PROGRESS' and p_new_status = 'PENDING_VERIFICATION') or
    (v_previous_status = 'PENDING_VERIFICATION' and p_new_status in ('CLOSED', 'IN_PROGRESS'))
  ) then
    raise exception 'Invalid finding status transition';
  end if;

  if v_previous_status = 'IN_PROGRESS' and p_new_status = 'PENDING_VERIFICATION' and not (
    exists (select 1 from public.evidence where finding_id = p_finding_id and phase = 'BEFORE')
    and exists (select 1 from public.evidence where finding_id = p_finding_id and phase = 'AFTER')
  ) then
    raise exception 'A before-work photo and an after-work photo are required before verification';
  end if;

  update public.findings
  set status = p_new_status, updated_at = now()
  where id = p_finding_id;

  insert into public.issue_history (
    id, finding_id, user_employee_id, action, previous_status,
    new_status, remarks, created_at
  ) values (
    gen_random_uuid()::text, p_finding_id, v_employee_id, p_action,
    v_previous_status, p_new_status, p_remarks, now()
  );
end;
$$;

revoke all on function public.update_finding_status(text, text, text, text) from public, anon;
grant execute on function public.update_finding_status(text, text, text, text) to authenticated;

-- Operation Managers assign a responsible team without changing the issue status.
-- SECURITY DEFINER keeps assigned_team writes behind the role check in this function.
create or replace function public.assign_finding_team(
  p_finding_id text,
  p_assigned_team text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id text;
  v_previous_status text;
  v_team text := nullif(btrim(p_assigned_team), '');
begin
  select employee_id into v_employee_id
  from public.profiles
  where id = (select auth.uid()) and role = 'OPERATIONS_MANAGER';

  if v_employee_id is null then
    raise exception 'An Operation Manager profile is required';
  end if;

  select status into v_previous_status
  from public.findings
  where id = p_finding_id
  for update;

  if v_previous_status is null then
    raise exception 'Finding not found';
  end if;

  update public.findings
  set assigned_team = v_team, updated_at = now()
  where id = p_finding_id;

  insert into public.issue_history (
    id, finding_id, user_employee_id, action, previous_status,
    new_status, remarks, created_at
  ) values (
    gen_random_uuid()::text, p_finding_id, v_employee_id,
    case when v_team is null then 'Team assignment cleared' else 'Team assigned' end,
    v_previous_status, v_previous_status, v_team, now()
  );
end;
$$;

revoke all on function public.assign_finding_team(text, text) from public, anon;
grant execute on function public.assign_finding_team(text, text) to authenticated;

notify pgrst, 'reload schema';
