create table if not exists public.pending_site_connections (
  id uuid primary key default gen_random_uuid(),
  external_site_id text not null unique
    check (external_site_id ~* '^[0-9a-f-]{36}$'),
  website_url text not null check (char_length(website_url) between 8 and 2048),
  callback_url text not null check (char_length(callback_url) between 8 and 2048),
  business_name text not null check (char_length(business_name) between 1 and 200),
  profile jsonb not null default '{}'::jsonb,
  encrypted_site_secret text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pending_site_connections_status_time_idx
  on public.pending_site_connections(status, requested_at asc);

alter table public.pending_site_connections enable row level security;
revoke all on public.pending_site_connections from public, anon, authenticated;
grant select, insert, update, delete on public.pending_site_connections to service_role;

comment on table public.pending_site_connections is
  'Private keyless onboarding queue. Secrets are encrypted and rows are never exposed to customer-facing Data API roles.';

alter table public.operator_notification_outbox
  drop constraint if exists operator_notification_outbox_notification_type_check;
alter table public.operator_notification_outbox
  add constraint operator_notification_outbox_notification_type_check
  check (notification_type in ('brief_ready', 'changes_requested', 'delivery_failed', 'connection_requested'));
