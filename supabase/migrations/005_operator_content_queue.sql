alter table public.sites
  add column if not exists workflow_mode text not null default 'operator_managed'
  check (workflow_mode in ('operator_managed', 'cloud_api'));

create table if not exists public.operator_content_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  topic text not null,
  customer_summary text not null default '',
  status text not null default 'researching' check (
    status in ('researching', 'brief_ready', 'draft_ready', 'delivered', 'approved', 'rejected', 'changes_requested')
  ),
  brief_payload jsonb not null default '{}'::jsonb,
  draft_payload jsonb,
  customer_feedback text not null default '',
  external_post_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  reviewed_at timestamptz,
  unique (site_id, idempotency_key)
);

create index if not exists operator_content_jobs_site_status_idx
  on public.operator_content_jobs(site_id, status, created_at desc);

create index if not exists operator_content_jobs_status_idx
  on public.operator_content_jobs(status, created_at asc);

alter table public.operator_content_jobs enable row level security;
revoke all on public.operator_content_jobs from anon, authenticated;

comment on table public.operator_content_jobs is
  'Private NeoContent operator queue. Brief and draft payloads must never be returned by customer-facing endpoints.';
