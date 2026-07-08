alter table public.transactions
  add column source text not null default 'app' check (source in ('app', 'telegram')),
  add column source_reference text;

create unique index transactions_source_reference_idx
  on public.transactions(source, source_reference)
  where source_reference is not null;

create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null unique,
  telegram_username text,
  default_account_id uuid not null references public.accounts(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.telegram_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  default_account_id uuid not null references public.accounts(id),
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.telegram_updates (
  update_id bigint primary key,
  telegram_user_id bigint,
  user_id uuid references public.profiles(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  message_text text,
  parser_mode text check (parser_mode is null or parser_mode in ('command', 'template', 'ai', 'callback')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'pending', 'ignored', 'failed')),
  transaction_id uuid references public.transactions(id) on delete set null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.telegram_pending_transactions (
  id uuid primary key default gen_random_uuid(),
  update_id bigint not null unique references public.telegram_updates(update_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  payload jsonb not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index telegram_updates_user_day_idx on public.telegram_updates(user_id, created_at desc);
create index telegram_pending_user_idx on public.telegram_pending_transactions(user_id, status);

create trigger telegram_connections_updated before update on public.telegram_connections
  for each row execute function public.set_updated_at();

alter table public.telegram_connections enable row level security;
alter table public.telegram_pairing_codes enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.telegram_pending_transactions enable row level security;

create policy "connection readable by owner" on public.telegram_connections
  for select using (user_id = auth.uid());
create policy "connection editable by owner" on public.telegram_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "connection removable by owner" on public.telegram_connections
  for delete using (user_id = auth.uid());
create policy "pairing codes readable by owner" on public.telegram_pairing_codes
  for select using (user_id = auth.uid());
create policy "pairing codes removable by owner" on public.telegram_pairing_codes
  for delete using (user_id = auth.uid());

-- telegram_updates and telegram_pending_transactions intentionally have no client
-- policies. Only the service role used by the verified webhook can access them.
