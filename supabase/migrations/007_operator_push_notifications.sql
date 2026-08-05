create table if not exists public.operator_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint_hash text not null unique check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  subscription_encrypted text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.operator_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 1 and 200),
  notification_type text not null check (notification_type in ('brief_ready', 'changes_requested', 'delivery_failed')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  sent_count integer not null default 0 check (sent_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.operator_push_subscriptions enable row level security;
alter table public.operator_notification_outbox enable row level security;
revoke all on public.operator_push_subscriptions from public, anon, authenticated;
revoke all on public.operator_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.operator_push_subscriptions to service_role;
grant select, insert, update on public.operator_notification_outbox to service_role;

comment on table public.operator_push_subscriptions is
  'Private encrypted operator Web Push subscriptions. Never expose through customer endpoints.';
comment on table public.operator_notification_outbox is
  'Idempotent operator notification ledger. Contains event type only, never customer or content data.';
