alter table public.operator_content_jobs
  add column if not exists operator_note text not null default ''
  check (char_length(operator_note) <= 5000);

create table if not exists public.operator_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  job_id uuid not null references public.operator_content_jobs(id) on delete cascade,
  event_type text not null check (event_type in (
    'content_job_created',
    'operator_note_updated',
    'draft_delivered',
    'customer_approved',
    'customer_rejected',
    'customer_changes_requested'
  )),
  actor_type text not null check (actor_type in ('system', 'operator', 'customer')),
  outcome text not null default 'success' check (outcome in ('success', 'blocked', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists operator_audit_events_job_time_idx
  on public.operator_audit_events(job_id, occurred_at desc);

create index if not exists operator_audit_events_site_time_idx
  on public.operator_audit_events(site_id, occurred_at desc);

alter table public.operator_audit_events enable row level security;
revoke all on public.operator_audit_events from public, anon, authenticated;
revoke update, delete, truncate on public.operator_audit_events from service_role;
grant select, insert on public.operator_audit_events to service_role;

comment on table public.operator_audit_events is
  'Append-only operator security history. Never store credentials, briefs, drafts, feedback bodies, or other sensitive content.';

comment on column public.operator_content_jobs.operator_note is
  'Private operator-only note. Never return through customer-facing endpoints.';
