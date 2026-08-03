create table if not exists public.request_replay_guard (
  signature_hash text primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists request_replay_guard_expiry_idx
  on public.request_replay_guard(expires_at);

alter table public.request_replay_guard enable row level security;
revoke all on public.request_replay_guard from anon, authenticated;
