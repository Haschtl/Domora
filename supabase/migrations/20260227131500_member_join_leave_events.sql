alter table household_events
  drop constraint if exists household_events_event_type_allowed_check;

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
      'cash_audit_requested',
      'admin_hint',
      'pimpers_reset',
      'vacation_mode_enabled',
      'vacation_mode_disabled'
    )
  );
