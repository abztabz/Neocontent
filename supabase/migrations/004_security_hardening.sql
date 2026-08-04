-- Aegis V1.1 tenant-integrity and denial-of-service hardening.

alter table public.sites
  add constraint sites_id_organization_id_key unique (id, organization_id);

create unique index sites_external_site_id_unique on public.sites(external_site_id);

alter table public.runs drop constraint if exists runs_idempotency_key_key;
alter table public.runs
  add constraint runs_site_idempotency_key_key unique (site_id, idempotency_key);

alter table public.articles drop constraint if exists articles_idempotency_key_key;
alter table public.articles
  add constraint articles_site_idempotency_key_key unique (site_id, idempotency_key);

alter table public.knowledge_items
  add constraint knowledge_items_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.knowledge_candidates
  add constraint knowledge_candidates_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.user_sources
  add constraint user_sources_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.content_opportunities
  add constraint content_opportunities_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.articles
  add constraint articles_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.runs
  add constraint runs_site_organization_fkey
  foreign key (site_id, organization_id)
  references public.sites(id, organization_id) on delete cascade;

alter table public.sites
  add constraint sites_external_id_length_check check (char_length(external_site_id) between 1 and 64),
  add constraint sites_profile_length_check check (
    char_length(business_name) <= 200
    and char_length(business_description) <= 5000
    and char_length(industry) <= 300
    and char_length(target_audience) <= 2000
    and char_length(tone) <= 500
  );

alter table public.user_sources
  add constraint user_sources_length_check check (
    char_length(url) <= 2048
    and char_length(label) <= 200
    and coalesce(char_length(extracted_text), 0) <= 2000000
  );

create index if not exists articles_opportunity_idx on public.articles(opportunity_id);
create index if not exists articles_organization_idx on public.articles(organization_id);
create index if not exists content_opportunities_organization_idx on public.content_opportunities(organization_id);
create index if not exists knowledge_candidates_organization_idx on public.knowledge_candidates(organization_id);
create index if not exists knowledge_items_organization_idx on public.knowledge_items(organization_id);
create index if not exists request_replay_guard_site_idx on public.request_replay_guard(site_id);
create index if not exists runs_article_idx on public.runs(article_id);
create index if not exists runs_opportunity_idx on public.runs(opportunity_id);
create index if not exists runs_organization_idx on public.runs(organization_id);
create index if not exists user_sources_organization_idx on public.user_sources(organization_id);

revoke all on all tables in schema public from anon, authenticated;
