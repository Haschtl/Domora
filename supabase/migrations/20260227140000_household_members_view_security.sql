create or replace view household_members_with_profiles as
select
  hm.household_id,
  hm.user_id,
  hm.role,
  hm.room_size_sqm,
  hm.common_area_factor,
  hm.task_laziness_factor,
  hm.vacation_mode,
  hm.created_at,
  up.display_name,
  up.avatar_url,
  up.user_color,
  up.paypal_name,
  up.revolut_name,
  up.wero_name
from household_members hm
left join user_profiles up
  on up.user_id = hm.user_id;
