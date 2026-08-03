create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_site_id text not null,
  website_url text not null,
  platform text not null default 'wordpress' check (platform = 'wordpress'),
  callback_url text not null,
  encrypted_site_secret text not null,
  business_name text not null default '',
  business_description text not null default '',
  industry text not null default '',
  target_audience text not null default '',
  tone text not null default '',
  services jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  content_mode text not null default 'balanced' check (content_mode in ('business_focused', 'balanced', 'industry_authority')),
  publish_mode text not null default 'approval_required' check (publish_mode in ('auto', 'approval_required')),
  cadence text not null default 'weekly' check (cadence in ('daily', 'weekly', 'biweekly', 'monthly')),
  knowledge_review_required boolean not null default true,
  enabled boolean not null default true,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_site_id)
);

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  external_id text,
  title text not null,
  content text not null,
  source_url text,
  source_type text not null default 'website',
  status text not null default 'approved' check (status in ('approved', 'archived', 'superseded')),
  confidence integer not null default 0 check (confidence between 0 and 100),
  fingerprint text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  external_id text,
  title text not null,
  summary text not null,
  source_url text,
  source_type text not null default 'website',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  risk_level text not null default 'normal' check (risk_level in ('low', 'normal', 'high')),
  confidence integer not null default 0 check (confidence between 0 and 100),
  fingerprint text not null,
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (site_id, fingerprint)
);

create table if not exists public.user_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  url text not null,
  label text not null default '',
  purpose text not null check (purpose in ('business_knowledge', 'industry_research', 'preferred_research', 'topic_discovery_only')),
  status text not null default 'pending_fetch' check (status in ('pending_fetch', 'pending_review', 'approved', 'rejected', 'fetch_failed')),
  publisher text,
  published_at timestamptz,
  retrieved_at timestamptz,
  trust_score integer check (trust_score between 0 and 100),
  freshness_status text check (freshness_status in ('current', 'aging', 'stale', 'unknown')),
  extracted_text text,
  approved_claims jsonb not null default '[]'::jsonb,
  content_fingerprint text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, url)
);

create table if not exists public.content_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  stream text not null check (stream in ('business', 'customer_demand', 'industry', 'timely_industry')),
  title text not null,
  rationale text not null,
  search_intent text not null default '',
  scores jsonb not null default '{}'::jsonb,
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  status text not null default 'candidate' check (status in ('candidate', 'selected', 'rejected', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  opportunity_id uuid references public.content_opportunities(id) on delete set null,
  title text not null,
  excerpt text not null default '',
  body_html text not null,
  rationale text not null default '',
  authority_score integer not null default 0 check (authority_score between 0 and 100),
  business_alignment_score integer not null default 0 check (business_alignment_score between 0 and 100),
  verification_score integer not null default 0 check (verification_score between 0 and 100),
  source_manifest jsonb not null default '[]'::jsonb,
  claim_map jsonb not null default '[]'::jsonb,
  status text not null default 'generated',
  idempotency_key text not null unique,
  external_id text,
  external_url text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled')),
  status text not null,
  reason text not null default '',
  opportunity_id uuid references public.content_opportunities(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  idempotency_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists sites_due_idx on public.sites(enabled, next_run_at);
create index if not exists knowledge_items_site_idx on public.knowledge_items(site_id, approved_at desc);
create index if not exists knowledge_candidates_site_idx on public.knowledge_candidates(site_id, status, detected_at desc);
create index if not exists user_sources_site_idx on public.user_sources(site_id, status, purpose);
create index if not exists articles_site_idx on public.articles(site_id, created_at desc);
create index if not exists runs_site_idx on public.runs(site_id, started_at desc);

alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.knowledge_candidates enable row level security;
alter table public.user_sources enable row level security;
alter table public.content_opportunities enable row level security;
alter table public.articles enable row level security;
alter table public.runs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
