-- Tracks each Telegram chat's step through the register/login flow.
-- Only the Edge Function (service role) touches this table.

create table if not exists public.telegram_sessions (
  chat_id bigint primary key,
  state text not null default 'idle',
  phone text,
  pending_password text,
  updated_at timestamptz not null default now()
);

alter table public.telegram_sessions enable row level security;
