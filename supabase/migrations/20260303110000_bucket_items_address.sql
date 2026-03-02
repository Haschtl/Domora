alter table bucket_items
add column if not exists address text not null default '';
