create extension if not exists pgcrypto;

create type public.transaction_type as enum ('expense', 'income', 'transfer');
create type public.account_kind as enum ('bank', 'cash', 'ewallet');
create type public.member_role as enum ('owner', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.account_kind not null,
  initial_balance bigint not null default 0,
  color text not null default '#116149' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  last_four text check (last_four is null or last_four ~ '^\d{4}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  type public.transaction_type not null check (type in ('expense', 'income')),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'wallet',
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, name, type)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type public.transaction_type not null,
  amount bigint not null check (amount > 0 and amount <= 100000000000),
  account_id uuid not null references public.accounts(id),
  destination_account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  note text not null default '' check (char_length(note) <= 100),
  transaction_date date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transaction_shape check (
    (type = 'transfer' and destination_account_id is not null and destination_account_id <> account_id and category_id is null)
    or (type in ('expense', 'income') and destination_account_id is null and category_id is not null)
  )
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  month date not null check (month = date_trunc('month', month)::date),
  amount bigint not null check (amount > 0 and amount <= 100000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category_id, month)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_household_date_idx on public.transactions(household_id, transaction_date desc) where deleted_at is null;
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index budgets_household_month_idx on public.budgets(household_id, month);

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.household_members where household_id = target_household and user_id = auth.uid()) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.seed_new_household()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.household_members(household_id, user_id, role) values (new.id, new.created_by, 'owner');
  insert into public.categories(household_id, name, type, color, icon, is_default) values
    (new.id, 'Makan & minum', 'expense', '#EF765F', 'utensils', true),
    (new.id, 'Transportasi', 'expense', '#4C82F7', 'car', true),
    (new.id, 'Belanja', 'expense', '#A879E1', 'shopping', true),
    (new.id, 'Rumah tangga', 'expense', '#E5A63B', 'home', true),
    (new.id, 'Kesehatan', 'expense', '#49A784', 'heart', true),
    (new.id, 'Hiburan', 'expense', '#DE6D9E', 'sparkles', true),
    (new.id, 'Gaji', 'income', '#178461', 'wallet', true),
    (new.id, 'Bonus & lainnya', 'income', '#43A87F', 'gift', true);
  insert into public.accounts(household_id, name, kind, initial_balance, color) values
    (new.id, 'Rekening utama', 'bank', 0, '#116149'),
    (new.id, 'Uang tunai', 'cash', 0, '#A879E1');
  return new;
end $$;
create trigger household_created after insert on public.households for each row execute function public.seed_new_household();

create or replace function public.create_invitation(target_household uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare invite_code text;
begin
  if not public.is_household_member(target_household) then raise exception 'Not a household member'; end if;
  if (select count(*) from public.household_members where household_id = target_household) >= 2 then raise exception 'Household already has two members'; end if;
  invite_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
  insert into public.invitations(household_id, code, created_by) values (target_household, invite_code, auth.uid());
  return invite_code;
end $$;

create or replace function public.accept_invitation(invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invitation public.invitations; member_count integer;
begin
  select * into invitation from public.invitations where code = upper(invite_code) and used_at is null and expires_at > now() for update;
  if invitation.id is null then raise exception 'Invitation invalid or expired'; end if;
  select count(*) into member_count from public.household_members where household_id = invitation.household_id;
  if member_count >= 2 then raise exception 'Household already has two members'; end if;
  insert into public.household_members(household_id, user_id, role) values (invitation.household_id, auth.uid(), 'member');
  update public.invitations set used_at = now(), used_by = auth.uid() where id = invitation.id;
  return invitation.household_id;
end $$;

create or replace function public.notify_partner_transaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare actor_name text; category_name text; target uuid; label text;
begin
  if new.deleted_at is not null then return new; end if;
  select full_name into actor_name from public.profiles where id = new.created_by;
  select name into category_name from public.categories where id = new.category_id;
  label := case new.type when 'income' then 'Pemasukan' when 'expense' then 'Pengeluaran' else 'Transfer' end;
  for target in select user_id from public.household_members where household_id = new.household_id and user_id <> new.created_by loop
    insert into public.notifications(household_id, user_id, actor_id, transaction_id, title, body)
    values (new.household_id, target, new.created_by, new.id, label || ' baru dari ' || actor_name,
      'Rp' || trim(to_char(new.amount, 'FM999G999G999G999')) || coalesce(' · ' || category_name, ' · Transfer'));
  end loop;
  return new;
end $$;
create trigger transaction_created_notification after insert on public.transactions for each row execute function public.notify_partner_transaction();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_updated before update on public.accounts for each row execute function public.set_updated_at();
create trigger transactions_updated before update on public.transactions for each row execute function public.set_updated_at();
create trigger budgets_updated before update on public.budgets for each row execute function public.set_updated_at();
create trigger push_subscriptions_updated before update on public.push_subscriptions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invitations enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profile readable by self and household" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.household_members mine join public.household_members theirs using (household_id)
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy "profile editable by self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "household readable by members" on public.households for select using (public.is_household_member(id));
create policy "authenticated user creates household" on public.households for insert with check (created_by = auth.uid());
create policy "owner updates household" on public.households for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "members readable by members" on public.household_members for select using (public.is_household_member(household_id));
create policy "invitations readable by members" on public.invitations for select using (public.is_household_member(household_id));
create policy "invitations creatable by members" on public.invitations for insert with check (public.is_household_member(household_id) and created_by = auth.uid());

create policy "accounts selectable by members" on public.accounts for select using (public.is_household_member(household_id));
create policy "accounts insertable by members" on public.accounts for insert with check (public.is_household_member(household_id));
create policy "accounts editable by members" on public.accounts for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "categories selectable by members" on public.categories for select using (public.is_household_member(household_id));
create policy "categories insertable by members" on public.categories for insert with check (public.is_household_member(household_id));
create policy "categories editable by members" on public.categories for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "transactions selectable by members" on public.transactions for select using (public.is_household_member(household_id));
create policy "transactions insertable by members" on public.transactions for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "transactions editable by members" on public.transactions for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "budgets selectable by members" on public.budgets for select using (public.is_household_member(household_id));
create policy "budgets insertable by members" on public.budgets for insert with check (public.is_household_member(household_id));
create policy "budgets editable by members" on public.budgets for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "notifications readable by recipient" on public.notifications for select using (user_id = auth.uid());
create policy "notifications editable by recipient" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions owned by user" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "subscriptions inserted by user" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "subscriptions edited by user" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions deleted by user" on public.push_subscriptions for delete using (user_id = auth.uid());

grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
