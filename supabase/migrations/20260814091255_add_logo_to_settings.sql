/*
# Add logo_url to store_settings

1. Modified tables
- store_settings: add nullable logo_url text column for store logo.
*/
alter table public.store_settings add column if not exists logo_url text not null default '';
