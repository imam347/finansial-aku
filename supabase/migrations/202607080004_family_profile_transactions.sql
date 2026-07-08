-- Stable household invitations, private avatars, and scalable transaction reads/imports.

-- Keep one reusable invitation per household. Existing households keep their newest code.
with ranked_invitations as (
  select id, row_number() over (partition by household_id order by created_at desc, id desc) as position
  from public.invitations
)
delete from public.invitations invitation
using ranked_invitations ranked
where invitation.id = ranked.id and ranked.position > 1;

update public.invitations
set expires_at = 'infinity'::timestamptz,
    used_at = null,
    used_by = null;

create unique index if not exists invitations_household_unique
  on public.invitations(household_id);

drop policy if exists "invitations readable by members" on public.invitations;
drop policy if exists "invitations creatable by members" on public.invitations;

create policy "invitations readable by owner" on public.invitations
  for select using (
    exists (
      select 1 from public.household_members membership
      where membership.household_id = invitations.household_id
        and membership.user_id = auth.uid()
        and membership.role = 'owner'
    )
  );

create or replace function public.create_invitation(target_household uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the household owner can manage invitation codes';
  end if;

  select code into invite_code
  from public.invitations
  where household_id = target_household;

  if invite_code is not null then
    return invite_code;
  end if;

  if (select count(*) from public.household_members where household_id = target_household) >= 2 then
    raise exception 'Household already has two members';
  end if;

  loop
    invite_code := upper(
      substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 1, 4)
      || '-'
      || substr(md5(clock_timestamp()::text || random()::text || target_household::text), 1, 4)
    );
    exit when not exists (select 1 from public.invitations where code = invite_code);
  end loop;

  insert into public.invitations(household_id, code, created_by, expires_at)
  values (target_household, invite_code, auth.uid(), 'infinity'::timestamptz)
  on conflict (household_id) do update set household_id = excluded.household_id
  returning code into invite_code;

  return invite_code;
end
$$;

create or replace function public.reset_invitation(target_household uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the household owner can reset invitation codes';
  end if;

  if (select count(*) from public.household_members where household_id = target_household) >= 2 then
    raise exception 'Household already has two members';
  end if;

  loop
    invite_code := upper(
      substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 1, 4)
      || '-'
      || substr(md5(clock_timestamp()::text || random()::text || target_household::text), 1, 4)
    );
    exit when not exists (select 1 from public.invitations where code = invite_code);
  end loop;

  insert into public.invitations(household_id, code, created_by, expires_at, used_at, used_by, created_at)
  values (target_household, invite_code, auth.uid(), 'infinity'::timestamptz, null, null, now())
  on conflict (household_id) do update
    set code = excluded.code,
        created_by = excluded.created_by,
        expires_at = excluded.expires_at,
        used_at = null,
        used_by = null,
        created_at = now()
  returning code into invite_code;

  return invite_code;
end
$$;

create or replace function public.accept_invitation(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitations;
  member_count integer;
begin
  select * into invitation
  from public.invitations
  where code = upper(trim(invite_code));

  if invitation.id is null then
    raise exception 'Invitation invalid';
  end if;

  perform pg_advisory_xact_lock(hashtext(invitation.household_id::text));

  if exists (
    select 1 from public.household_members
    where household_id = invitation.household_id and user_id = auth.uid()
  ) then
    return invitation.household_id;
  end if;

  select count(*) into member_count
  from public.household_members
  where household_id = invitation.household_id;

  if member_count >= 2 then
    raise exception 'Household already has two members';
  end if;

  insert into public.household_members(household_id, user_id, role)
  values (invitation.household_id, auth.uid(), 'member');

  return invitation.household_id;
end
$$;

grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.reset_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- Private avatar objects. The fixed object name means updates do not accumulate files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "household avatar read" on storage.objects;
drop policy if exists "avatar owner insert" on storage.objects;
drop policy if exists "avatar owner update" on storage.objects;
drop policy if exists "avatar owner delete" on storage.objects;

create policy "household avatar read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.household_members viewer
      join public.household_members avatar_owner using (household_id)
      where viewer.user_id = auth.uid()
        and avatar_owner.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy "avatar owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Add Excel as an idempotent transaction source and scope references per household.
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('app', 'telegram', 'excel'));

drop index if exists public.transactions_source_reference_idx;
create unique index transactions_household_source_reference_idx
  on public.transactions(household_id, source, source_reference)
  where source_reference is not null;

create index if not exists transactions_household_type_date_idx
  on public.transactions(household_id, type, transaction_date desc)
  where deleted_at is null;
create index if not exists transactions_household_account_date_idx
  on public.transactions(household_id, account_id, transaction_date desc)
  where deleted_at is null;
create index if not exists transactions_household_destination_date_idx
  on public.transactions(household_id, destination_account_id, transaction_date desc)
  where deleted_at is null and destination_account_id is not null;
create index if not exists transactions_household_category_date_idx
  on public.transactions(household_id, category_id, transaction_date desc)
  where deleted_at is null and category_id is not null;
create index if not exists transactions_household_creator_date_idx
  on public.transactions(household_id, created_by, transaction_date desc)
  where deleted_at is null;

create or replace function public.list_transactions(
  p_household_id uuid,
  p_search text default null,
  p_types public.transaction_type[] default null,
  p_account_ids uuid[] default null,
  p_category_ids uuid[] default null,
  p_created_by_ids uuid[] default null,
  p_date_from date default null,
  p_date_to date default null,
  p_amount_min bigint default null,
  p_amount_max bigint default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  type public.transaction_type,
  amount bigint,
  account_id uuid,
  destination_account_id uuid,
  category_id uuid,
  note text,
  transaction_date date,
  created_by uuid,
  created_by_name text,
  created_by_avatar_path text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;
  if p_sort not in ('newest', 'oldest', 'amount_desc', 'amount_asc') then
    raise exception 'Invalid sort';
  end if;

  return query
  select
    transaction.id,
    transaction.type,
    transaction.amount,
    transaction.account_id,
    transaction.destination_account_id,
    transaction.category_id,
    transaction.note,
    transaction.transaction_date,
    transaction.created_by,
    profile.full_name,
    profile.avatar_url,
    transaction.created_at,
    count(*) over() as total_count
  from public.transactions transaction
  join public.accounts source_account on source_account.id = transaction.account_id
  left join public.accounts destination_account on destination_account.id = transaction.destination_account_id
  left join public.categories category on category.id = transaction.category_id
  join public.profiles profile on profile.id = transaction.created_by
  where transaction.household_id = p_household_id
    and transaction.deleted_at is null
    and (p_types is null or transaction.type = any(p_types))
    and (p_account_ids is null or transaction.account_id = any(p_account_ids) or transaction.destination_account_id = any(p_account_ids))
    and (p_category_ids is null or transaction.category_id = any(p_category_ids))
    and (p_created_by_ids is null or transaction.created_by = any(p_created_by_ids))
    and (p_date_from is null or transaction.transaction_date >= p_date_from)
    and (p_date_to is null or transaction.transaction_date <= p_date_to)
    and (p_amount_min is null or transaction.amount >= p_amount_min)
    and (p_amount_max is null or transaction.amount <= p_amount_max)
    and (
      nullif(trim(p_search), '') is null
      or transaction.note ilike '%' || trim(p_search) || '%'
      or source_account.name ilike '%' || trim(p_search) || '%'
      or coalesce(destination_account.name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(category.name, '') ilike '%' || trim(p_search) || '%'
      or profile.full_name ilike '%' || trim(p_search) || '%'
    )
  order by
    case when p_sort = 'newest' then transaction.transaction_date end desc,
    case when p_sort = 'newest' then transaction.created_at end desc,
    case when p_sort = 'oldest' then transaction.transaction_date end asc,
    case when p_sort = 'oldest' then transaction.created_at end asc,
    case when p_sort = 'amount_desc' then transaction.amount end desc,
    case when p_sort = 'amount_asc' then transaction.amount end asc,
    transaction.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;

grant execute on function public.list_transactions(uuid, text, public.transaction_type[], uuid[], uuid[], uuid[], date, date, bigint, bigint, text, integer, integer) to authenticated;

create or replace function public.get_finance_overview(
  p_household_id uuid,
  p_as_of date,
  p_activity_from date,
  p_activity_to date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
  month_start date := date_trunc('month', p_as_of)::date;
  month_end date := (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;

  select jsonb_build_object(
    'total_balance',
      coalesce((select sum(initial_balance) from public.accounts where household_id = p_household_id and archived_at is null), 0)
      + coalesce((select sum(case when type = 'income' then amount when type = 'expense' then -amount else 0 end)
                  from public.transactions where household_id = p_household_id and deleted_at is null), 0),
    'monthly_income',
      coalesce((select sum(amount) from public.transactions
                where household_id = p_household_id and deleted_at is null and type = 'income'
                  and transaction_date between month_start and month_end), 0),
    'monthly_expense',
      coalesce((select sum(amount) from public.transactions
                where household_id = p_household_id and deleted_at is null and type = 'expense'
                  and transaction_date between month_start and month_end), 0),
    'budget_total',
      coalesce((select sum(amount) from public.budgets where household_id = p_household_id and month = month_start), 0),
    'account_summaries',
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', account.id,
        'balance', account.initial_balance + coalesce((
          select sum(case
            when transaction.type = 'income' and transaction.account_id = account.id then transaction.amount
            when transaction.type = 'expense' and transaction.account_id = account.id then -transaction.amount
            when transaction.type = 'transfer' and transaction.account_id = account.id then -transaction.amount
            when transaction.type = 'transfer' and transaction.destination_account_id = account.id then transaction.amount
            else 0 end)
          from public.transactions transaction
          where transaction.household_id = p_household_id and transaction.deleted_at is null
            and (transaction.account_id = account.id or transaction.destination_account_id = account.id)
        ), 0),
        'transaction_count', (select count(*) from public.transactions transaction
          where transaction.household_id = p_household_id and transaction.deleted_at is null
            and (transaction.account_id = account.id or transaction.destination_account_id = account.id))
      )) from public.accounts account where account.household_id = p_household_id and account.archived_at is null), '[]'::jsonb),
    'budget_spent',
      coalesce((select jsonb_agg(jsonb_build_object('category_id', category.id, 'spent', coalesce((
        select sum(transaction.amount) from public.transactions transaction
        where transaction.household_id = p_household_id and transaction.deleted_at is null
          and transaction.type = 'expense' and transaction.category_id = category.id
          and transaction.transaction_date between month_start and month_end
      ), 0))) from public.categories category
        where category.household_id = p_household_id and category.archived_at is null and category.type = 'expense'), '[]'::jsonb),
    'category_expenses',
      coalesce((select jsonb_agg(category_row order by (category_row->>'value')::bigint desc) from (
        select jsonb_build_object('category_id', category.id, 'value', sum(transaction.amount)) category_row
        from public.transactions transaction
        join public.categories category on category.id = transaction.category_id
        where transaction.household_id = p_household_id and transaction.deleted_at is null
          and transaction.type = 'expense' and transaction.transaction_date between month_start and month_end
        group by category.id
      ) expense_rows), '[]'::jsonb),
    'activity',
      coalesce((select jsonb_agg(jsonb_build_object('date', day::date, 'expense', coalesce((
        select sum(transaction.amount) from public.transactions transaction
        where transaction.household_id = p_household_id and transaction.deleted_at is null
          and transaction.type = 'expense' and transaction.transaction_date = day::date
      ), 0)) order by day)
      from generate_series(p_activity_from::timestamp, p_activity_to::timestamp, interval '1 day') day), '[]'::jsonb),
    'recent_transactions',
      coalesce((select jsonb_agg(recent_row order by (recent_row->>'transaction_date')::date desc, (recent_row->>'created_at')::timestamptz desc)
        from (
          select jsonb_build_object(
            'id', transaction.id, 'type', transaction.type, 'amount', transaction.amount,
            'account_id', transaction.account_id, 'destination_account_id', transaction.destination_account_id,
            'category_id', transaction.category_id, 'note', transaction.note,
            'transaction_date', transaction.transaction_date, 'created_by', transaction.created_by,
            'created_by_name', profile.full_name, 'created_by_avatar_path', profile.avatar_url,
            'created_at', transaction.created_at
          ) recent_row
          from public.transactions transaction
          join public.profiles profile on profile.id = transaction.created_by
          where transaction.household_id = p_household_id and transaction.deleted_at is null
          order by transaction.transaction_date desc, transaction.created_at desc
          limit 5
        ) recent_rows), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

grant execute on function public.get_finance_overview(uuid, date, date, date) to authenticated;

create or replace function public.import_transactions(p_household_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  inserted_count integer := 0;
  duplicate_count integer := 0;
  affected integer;
  errors jsonb := '[]'::jsonb;
  row_number integer;
  transaction_type public.transaction_type;
  account_id uuid;
  destination_id uuid;
  category_id uuid;
  amount_value bigint;
  transaction_day date;
  note_value text;
  source_reference_value text;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import must contain at most 5000 rows';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    row_number := coalesce((item->>'rowNumber')::integer, 0);
    begin
      transaction_type := (item->>'type')::public.transaction_type;
      amount_value := (item->>'amount')::bigint;
      account_id := (item->>'accountId')::uuid;
      destination_id := nullif(item->>'destinationAccountId', '')::uuid;
      category_id := nullif(item->>'categoryId', '')::uuid;
      transaction_day := (item->>'date')::date;
      note_value := left(coalesce(item->>'note', ''), 100);
      source_reference_value := nullif(item->>'sourceReference', '');

      if amount_value <= 0 or amount_value > 100000000000 then
        raise exception 'Nominal tidak valid';
      end if;
      if source_reference_value is null then
        raise exception 'Referensi impor tidak valid';
      end if;
      if not exists (select 1 from public.accounts where id = account_id and household_id = p_household_id and archived_at is null) then
        raise exception 'Akun tidak ditemukan';
      end if;

      if transaction_type = 'transfer' then
        if destination_id is null or destination_id = account_id
          or not exists (select 1 from public.accounts where id = destination_id and household_id = p_household_id and archived_at is null) then
          raise exception 'Akun tujuan transfer tidak valid';
        end if;
        category_id := null;
      else
        destination_id := null;
        if category_id is null or not exists (
          select 1 from public.categories
          where id = category_id and household_id = p_household_id and archived_at is null and type = transaction_type
        ) then
          raise exception 'Kategori tidak valid';
        end if;
      end if;

      insert into public.transactions(
        household_id, type, amount, account_id, destination_account_id, category_id,
        note, transaction_date, created_by, source, source_reference
      ) values (
        p_household_id, transaction_type, amount_value, account_id, destination_id, category_id,
        note_value, transaction_day, auth.uid(), 'excel', source_reference_value
      )
      on conflict (household_id, source, source_reference) where source_reference is not null do nothing;

      get diagnostics affected = row_count;
      if affected = 1 then inserted_count := inserted_count + 1;
      else duplicate_count := duplicate_count + 1;
      end if;
    exception when others then
      errors := errors || jsonb_build_array(jsonb_build_object('row', row_number, 'message', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'duplicates', duplicate_count, 'errors', errors);
end
$$;

grant execute on function public.import_transactions(uuid, jsonb) to authenticated;
