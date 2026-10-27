create extension if not exists pgcrypto;

create table if not exists public.pam_accounts (
  id text primary key,
  first_name text not null,
  email_address text not null unique,
  age integer,
  employment_status text not null default 'Not sure yet',
  state_code text not null default 'OTHER',
  created_at timestamptz not null default now(),
  password_algorithm text not null,
  password_salt text not null,
  password_hash text not null
);

create table if not exists public.pam_sessions (
  session_token text primary key,
  account_id text not null references public.pam_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pam_waitlist (
  email_address text primary key,
  full_name text,
  age integer,
  stage text,
  goal text,
  source text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pam_waitlist add column if not exists full_name text;
alter table public.pam_waitlist add column if not exists age integer;
alter table public.pam_waitlist add column if not exists stage text;
alter table public.pam_waitlist add column if not exists goal text;

create table if not exists public.pam_verification_requests (
  request_id text primary key,
  email_address text not null,
  purpose text not null default 'signup',
  code_hash text not null,
  code_salt text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pam_baselines (
  account_id text primary key references public.pam_accounts(id) on delete cascade,
  baseline jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pam_scenario_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text references public.pam_accounts(id) on delete set null,
  question text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pam_plaid_items (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.pam_accounts(id) on delete cascade,
  plaid_item_id text,
  institution_name text,
  access_token_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pam_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_name text not null,
  session_id text,
  page text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pam_feedback (
  id uuid primary key default gen_random_uuid(),
  account_id text references public.pam_accounts(id) on delete set null,
  email_address text,
  page text,
  rating integer check (rating between 1 and 5),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pam_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  account_id text references public.pam_accounts(id) on delete cascade,
  email_address text,
  accepted_advisor_disclaimer boolean not null,
  accepted_terms_privacy boolean not null,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Clerk is the production identity provider. These records may be keyed by a
-- Clerk user ID that does not exist in the retired pam_accounts table.
alter table public.pam_baselines drop constraint if exists pam_baselines_account_id_fkey;
alter table public.pam_scenario_runs drop constraint if exists pam_scenario_runs_account_id_fkey;
alter table public.pam_plaid_items drop constraint if exists pam_plaid_items_account_id_fkey;
alter table public.pam_feedback drop constraint if exists pam_feedback_account_id_fkey;
alter table public.pam_legal_acceptances drop constraint if exists pam_legal_acceptances_account_id_fkey;

alter table public.pam_accounts enable row level security;
alter table public.pam_sessions enable row level security;
alter table public.pam_waitlist enable row level security;
alter table public.pam_verification_requests enable row level security;
alter table public.pam_baselines enable row level security;
alter table public.pam_scenario_runs enable row level security;
alter table public.pam_plaid_items enable row level security;
alter table public.pam_events enable row level security;
alter table public.pam_feedback enable row level security;
alter table public.pam_legal_acceptances enable row level security;

create index if not exists pam_sessions_account_id_idx on public.pam_sessions(account_id);
create index if not exists pam_verification_requests_email_purpose_idx on public.pam_verification_requests(email_address, purpose);
create index if not exists pam_verification_requests_expires_at_idx on public.pam_verification_requests(expires_at);
create index if not exists pam_scenario_runs_account_id_idx on public.pam_scenario_runs(account_id);
create index if not exists pam_plaid_items_account_id_idx on public.pam_plaid_items(account_id);
create index if not exists pam_events_created_at_idx on public.pam_events(created_at);
create index if not exists pam_events_event_name_idx on public.pam_events(event_name);
create index if not exists pam_feedback_created_at_idx on public.pam_feedback(created_at);
create index if not exists pam_feedback_account_id_idx on public.pam_feedback(account_id);
create index if not exists pam_legal_acceptances_account_id_idx on public.pam_legal_acceptances(account_id);
create index if not exists pam_legal_acceptances_accepted_at_idx on public.pam_legal_acceptances(accepted_at);

-- Stripe subscriptions
create table if not exists public.pam_subscriptions (
  clerk_user_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  price_id text,
  is_founding_member boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.pam_subscriptions enable row level security;
create index if not exists pam_subscriptions_status_idx on public.pam_subscriptions(status);
create index if not exists pam_subscriptions_customer_id_idx on public.pam_subscriptions(stripe_customer_id);

-- Indexes for the reads the app makes on every page load and in /admin.
create index if not exists pam_events_name_created_idx on public.pam_events(event_name, created_at desc);
create index if not exists pam_scenario_runs_created_at_idx on public.pam_scenario_runs(created_at desc);

-- Shared rate limits. Serverless instances each keep their own memory, so
-- in-memory counters multiply under load. This table is one counter per key
-- for every instance; pam_hit_limit increments it atomically and says whether
-- the caller is still under the limit. Server-only: RLS on, no policies, and
-- only the service role may call the function.
create table if not exists public.pam_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.pam_rate_limits enable row level security;
create index if not exists pam_rate_limits_window_start_idx on public.pam_rate_limits(window_start);

create or replace function public.pam_hit_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.pam_rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;

  -- Occasional cleanup so the table stays small.
  if random() < 0.01 then
    delete from public.pam_rate_limits where window_start < now() - interval '2 days';
  end if;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.pam_hit_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.pam_hit_limit(text, integer, integer) to service_role;
