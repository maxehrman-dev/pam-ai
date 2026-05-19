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
  source text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
