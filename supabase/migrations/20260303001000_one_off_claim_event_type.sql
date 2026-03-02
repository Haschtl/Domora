do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'household_events_event_type_allowed_check'
  ) then
    alter table household_events
      drop constraint household_events_event_type_allowed_check;
  end if;

  alter table household_events
    add constraint household_events_event_type_allowed_check
    check (
      event_type in (
        'task_completed',
        'task_skipped',
        'task_rated',
        'shopping_completed',
        'finance_created',
        'role_changed',
        'member_joined',
        'member_left',
        'rent_updated',
        'contract_created',
        'contract_updated',
        'contract_deleted',
        'cash_audit_requested',
        'admin_hint',
        'pimpers_reset',
        'vacation_mode_enabled',
        'vacation_mode_disabled',
        'live_location_started',
        'one_off_claim_created'
      )
    );
end;
$$;
