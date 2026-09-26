-- Add inspection execution data to the operational schema.
-- Run after profiles.sql and schema.sql in the Supabase SQL Editor.

create table if not exists public.inspections (
  id text primary key,
  inspector_employee_id text references public.profiles(employee_id) on update cascade on delete set null,
  inspector_name text not null,
  inspection_type text not null,
  area text not null,
  scheduled_date date not null,
  status text not null check (status in ('Scheduled', 'In Progress', 'Completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'Completed') = (completed_at is not null))
);

create table if not exists public.inspection_checklist_answers (
  id text primary key,
  inspection_id text not null references public.inspections(id) on delete cascade,
  checklist_item_id text not null,
  checklist_item_title text not null,
  result text not null check (result in ('Pass', 'Fail', 'N/A')),
  remark text not null default '',
  updated_at timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)
);

-- Inspection findings share the existing findings table so they appear in Issues.
alter table public.findings alter column latitude drop not null;
alter table public.findings alter column longitude drop not null;
alter table public.findings add column if not exists category text;
alter table public.findings add column if not exists inspector_remarks text not null default '';
alter table public.findings add column if not exists gps_captured_at timestamptz;
alter table public.findings add column if not exists source_inspection_id text
  references public.inspections(id) on delete set null;
alter table public.findings add column if not exists source_finding_id text;
alter table public.findings add column if not exists checklist_item_id text;
alter table public.evidence add column if not exists file_size bigint;
create unique index if not exists findings_inspection_source_unique
  on public.findings(source_inspection_id, source_finding_id)
  where source_inspection_id is not null and source_finding_id is not null;

alter table public.inspections enable row level security;
alter table public.inspection_checklist_answers enable row level security;

drop policy if exists "Authenticated users can read inspections" on public.inspections;
create policy "Authenticated users can read inspections"
  on public.inspections for select to authenticated using (true);
drop policy if exists "Authenticated users can manage inspections" on public.inspections;
create policy "Authenticated users can manage inspections"
  on public.inspections for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read inspection checklist answers" on public.inspection_checklist_answers;
create policy "Authenticated users can read inspection checklist answers"
  on public.inspection_checklist_answers for select to authenticated using (true);
drop policy if exists "Authenticated users can manage inspection checklist answers" on public.inspection_checklist_answers;
create policy "Authenticated users can manage inspection checklist answers"
  on public.inspection_checklist_answers for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.inspections to authenticated;
grant select, insert, update, delete on public.inspection_checklist_answers to authenticated;
drop policy if exists "Authenticated users can create findings" on public.findings;
create policy "Authenticated users can create findings"
  on public.findings for insert to authenticated with check (true);
grant insert, update (category, inspector_remarks, gps_captured_at, source_inspection_id, source_finding_id, checklist_item_id, title, description, severity, status, location_name, latitude, longitude, created_at, updated_at)
  on public.findings to authenticated;

-- Private bucket for finding photos. Paths are {auth.uid()}/{finding_id}/{file}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finding-evidence', 'finding-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload own finding evidence" on storage.objects;
create policy "Authenticated users can upload own finding evidence"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'finding-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Authenticated users can update own finding evidence" on storage.objects;
create policy "Authenticated users can update own finding evidence"
  on storage.objects for update to authenticated
  using (bucket_id = 'finding-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'finding-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Authenticated users can read finding evidence" on storage.objects;
create policy "Authenticated users can read finding evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'finding-evidence');
drop policy if exists "Authenticated users can delete own finding evidence" on storage.objects;
create policy "Authenticated users can delete own finding evidence"
  on storage.objects for delete to authenticated
  using (bucket_id = 'finding-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Authenticated users can add finding evidence metadata" on public.evidence;
create policy "Authenticated users can add finding evidence metadata"
  on public.evidence for insert to authenticated with check (
    (storage_path like ((select auth.uid())::text || '/%'))
    and exists (select 1 from public.findings where findings.id = evidence.finding_id)
    and (
      uploaded_by_employee_id is null
      or uploaded_by_employee_id in (
        select employee_id from public.profiles where id = (select auth.uid())
      )
    )
  );
grant insert on public.evidence to authenticated;

notify pgrst, 'reload schema';
