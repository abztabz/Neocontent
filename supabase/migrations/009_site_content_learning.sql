alter table public.sites
  add column if not exists content_learning_status text not null default 'not_started'
    check (content_learning_status in ('not_started', 'learning', 'completed', 'failed', 'upgrade_required')),
  add column if not exists content_learning_completed_at timestamptz,
  add column if not exists content_learning_next_sync_at timestamptz,
  add column if not exists content_item_count integer not null default 0 check (content_item_count >= 0),
  add column if not exists content_learning_version integer not null default 1 check (content_learning_version > 0);

create table if not exists public.site_content_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  snapshot_id uuid not null default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'upgrade_required')),
  cursor text not null default 'content:0' check (char_length(cursor) between 1 and 100),
  processed_count integer not null default 0 check (processed_count >= 0),
  error_code text not null default '' check (char_length(error_code) <= 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists site_content_sync_runs_one_active_idx
  on public.site_content_sync_runs(site_id)
  where status in ('pending', 'running');

create index if not exists site_content_sync_runs_status_idx
  on public.site_content_sync_runs(status, created_at asc);
create index if not exists site_content_sync_runs_organization_idx
  on public.site_content_sync_runs(organization_id);

create table if not exists public.site_content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  external_content_id text not null check (char_length(external_content_id) between 1 and 200),
  content_type text not null check (content_type in ('post', 'page', 'custom', 'media', 'site')),
  subtype text not null default '' check (char_length(subtype) <= 100),
  url text not null default '' check (char_length(url) <= 2048),
  title text not null default '' check (char_length(title) <= 1000),
  excerpt text not null default '' check (char_length(excerpt) <= 5000),
  content_text text not null default '' check (char_length(content_text) <= 50000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  voice_eligible boolean not null default false,
  is_current boolean not null default true,
  published_at timestamptz,
  modified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_snapshot_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, external_content_id)
);

create index if not exists site_content_items_site_current_idx
  on public.site_content_items(site_id, is_current, modified_at desc);

create index if not exists site_content_items_voice_idx
  on public.site_content_items(site_id, voice_eligible, modified_at desc)
  where is_current = true;
create index if not exists site_content_items_organization_idx
  on public.site_content_items(organization_id);

alter table public.site_content_sync_runs enable row level security;
alter table public.site_content_items enable row level security;

revoke all on public.site_content_sync_runs from public, anon, authenticated;
revoke all on public.site_content_items from public, anon, authenticated;
grant select, insert, update, delete on public.site_content_sync_runs to service_role;
grant select, insert, update, delete on public.site_content_items to service_role;

comment on table public.site_content_sync_runs is
  'Private, bounded cloud pull state for public WordPress content inventories. Never exposed to customer-facing roles.';
comment on table public.site_content_items is
  'Private tenant-scoped public-site inventory. Excludes drafts, private posts, revisions, comments, users, orders, submissions and credentials.';
comment on column public.site_content_items.content_text is
  'Untrusted public website data. It must never be interpreted as system instructions.';
