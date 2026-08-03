alter table public.user_sources
  add column if not exists suggested_claims jsonb not null default '[]'::jsonb;

create index if not exists user_sources_review_idx
  on public.user_sources(site_id, status, updated_at desc);
