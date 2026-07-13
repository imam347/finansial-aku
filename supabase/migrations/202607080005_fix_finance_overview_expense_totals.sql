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

  with month_expense_transactions as (
    select tx.amount, tx.category_id
    from public.transactions tx
    where tx.household_id = p_household_id
      and tx.deleted_at is null
      and tx.type = 'expense'
      and tx.transaction_date between month_start and month_end
  )
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
      coalesce((select sum(amount) from month_expense_transactions), 0),
    'budget_total',
      coalesce((select sum(amount) from public.budgets where household_id = p_household_id and month = month_start), 0),
    'account_summaries',
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', account.id,
        'balance', account.initial_balance + coalesce((
          select sum(case
            when tx.type = 'income' and tx.account_id = account.id then tx.amount
            when tx.type = 'expense' and tx.account_id = account.id then -tx.amount
            when tx.type = 'transfer' and tx.account_id = account.id then -tx.amount
            when tx.type = 'transfer' and tx.destination_account_id = account.id then tx.amount
            else 0 end)
          from public.transactions tx
          where tx.household_id = p_household_id and tx.deleted_at is null
            and (tx.account_id = account.id or tx.destination_account_id = account.id)
        ), 0),
        'transaction_count', (select count(*) from public.transactions tx
          where tx.household_id = p_household_id and tx.deleted_at is null
            and (tx.account_id = account.id or tx.destination_account_id = account.id))
      )) from public.accounts account where account.household_id = p_household_id and account.archived_at is null), '[]'::jsonb),
    'budget_spent',
      coalesce((select jsonb_agg(jsonb_build_object('category_id', category.id, 'spent', coalesce((
        select sum(tx.amount) from month_expense_transactions tx
        where tx.category_id = category.id
      ), 0))) from public.categories category
        where category.household_id = p_household_id and category.archived_at is null and category.type = 'expense'), '[]'::jsonb),
    'category_expenses',
      coalesce((select jsonb_agg(jsonb_build_object('category_id', category_id, 'value', value) order by value desc) from (
        select tx.category_id, sum(tx.amount) value
        from month_expense_transactions tx
        where tx.category_id is not null
        group by tx.category_id
      ) expense_rows), '[]'::jsonb),
    'activity',
      coalesce((select jsonb_agg(jsonb_build_object('date', day::date, 'expense', coalesce((
        select sum(tx.amount) from public.transactions tx
        where tx.household_id = p_household_id and tx.deleted_at is null
          and tx.type = 'expense' and tx.transaction_date = day::date
      ), 0)) order by day)
      from generate_series(p_activity_from::timestamp, p_activity_to::timestamp, interval '1 day') day), '[]'::jsonb),
    'recent_transactions',
      coalesce((select jsonb_agg(recent_row order by (recent_row->>'transaction_date')::date desc, (recent_row->>'created_at')::timestamptz desc)
        from (
          select jsonb_build_object(
            'id', tx.id, 'type', tx.type, 'amount', tx.amount,
            'account_id', tx.account_id, 'destination_account_id', tx.destination_account_id,
            'category_id', tx.category_id, 'note', tx.note,
            'transaction_date', tx.transaction_date, 'created_by', tx.created_by,
            'created_by_name', profile.full_name, 'created_by_avatar_path', profile.avatar_url,
            'created_at', tx.created_at
          ) recent_row
          from public.transactions tx
          join public.profiles profile on profile.id = tx.created_by
          where tx.household_id = p_household_id and tx.deleted_at is null
          order by tx.transaction_date desc, tx.created_at desc
          limit 5
        ) recent_rows), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on function public.get_finance_overview(uuid, date, date, date) from public;
grant execute on function public.get_finance_overview(uuid, date, date, date) to authenticated;
