  -- Production Supabase commonly installs pgcrypto in the `extensions` schema,
  -- while create_invitation previously restricted its search_path to `public`.
  -- Build the short-lived code from PostgreSQL core functions instead, so the
  -- function behaves the same regardless of where extensions are installed.
  create or replace function public.create_invitation(target_household uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    invite_code text;
  begin
    if not public.is_household_member(target_household) then
      raise exception 'Not a household member';
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

    insert into public.invitations(household_id, code, created_by)
    values (target_household, invite_code, auth.uid());

    return invite_code;
  end
  $$;

  drop policy if exists "budgets deletable by members" on public.budgets;
  create policy "budgets deletable by members"
  on public.budgets
  for delete
  using (public.is_household_member(household_id));

  grant execute on function public.create_invitation(uuid) to authenticated;
