-- One-time tokens the Telegram bot issues after a successful register/login,
-- so the site can auto-fill (and only fill) the user's phone number when
-- they tap the link the bot sends them.
-- Only the Edge Functions (service role) touch this table.

create table if not exists public.telegram_login_tokens (
  token uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  phone text not null,
  used boolean not null default false,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

alter table public.telegram_login_tokens enable row level security;

create index if not exists telegram_login_tokens_expires_at_idx
  on public.telegram_login_tokens (expires_at);
