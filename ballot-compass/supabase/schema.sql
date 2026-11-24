-- Ballot Compass storage. Use a Supabase project of its own, not PAM AI's.
-- Every table has row-level security on and NO policies, so only the server's
-- service-role key can read or write. The public anon key can see nothing.

-- Anonymous survey responses. Deliberately stores a date, not a timestamp,
-- so a response cannot be matched to an email signup by time.
create table if not exists public.bc_responses (
  submission_id uuid primary key,
  created_on date not null default current_date,
  updated_on date not null default current_date,
  consent_version text not null,
  app_version text,
  answers jsonb not null,          -- { issueId: { "value": 0-4 | null, "importance": 1-4 } }
  leadership jsonb,                -- ordered trait ids, or null
  age text,                        -- bracket value from js/survey.js, 'na', or null
  household text,
  income text
);
alter table public.bc_responses enable row level security;

-- Update-list signups. Never linked to responses.
create table if not exists public.bc_signups (
  id bigint generated always as identity primary key,
  email text not null unique,
  consent_version text not null,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table public.bc_signups enable row level security;

-- Shared rate-limit counters (keys contain a salted hash, never a raw IP).
create table if not exists public.bc_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.bc_rate_limits enable row level security;

create or replace function public.bc_hit_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.bc_rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;

  if random() < 0.01 then
    delete from public.bc_rate_limits where window_start < now() - interval '2 days';
  end if;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.bc_hit_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.bc_hit_limit(text, integer, integer) to service_role;

-- Aggregate view for analysis: how many respondents chose each position on each issue.
-- security_invoker keeps the tables' RLS in force, so this is not exposed publicly either.
create or replace view public.bc_issue_totals with (security_invoker = true) as
select
  a.key as issue,
  nullif(a.value ->> 'value', '')::int as position,
  (a.value ->> 'importance')::int as importance,
  count(*) as respondents
from public.bc_responses r
cross join lateral jsonb_each(r.answers) as a(key, value)
group by 1, 2, 3;
