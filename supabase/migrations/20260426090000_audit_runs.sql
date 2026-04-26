create table public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  audit_name text not null default 'public_gig_cards',
  result text not null check (result in ('pass', 'warning', 'fail')),
  target_kind text not null,
  target_label text not null,
  strict boolean not null default false,
  reconcile_sources boolean not null default false,
  github_run_id text,
  github_run_attempt text,
  github_workflow text,
  github_event_name text,
  github_repository text,
  github_ref text,
  github_ref_name text,
  git_sha text,
  payload_gig_count integer not null check (payload_gig_count >= 0),
  payload_day_count integer not null check (payload_day_count >= 0),
  initial_active_date_key text,
  error_count integer not null default 0 check (error_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  check_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(check_counts) = 'object'),
  source_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(source_counts) = 'object'),
  image_stats jsonb not null default '{}'::jsonb check (jsonb_typeof(image_stats) = 'object'),
  source_reconciliation_totals jsonb check (
    source_reconciliation_totals is null
    or jsonb_typeof(source_reconciliation_totals) = 'object'
  ),
  error_examples jsonb not null default '[]'::jsonb check (jsonb_typeof(error_examples) = 'array'),
  warning_examples jsonb not null default '[]'::jsonb check (jsonb_typeof(warning_examples) = 'array'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index audit_runs_created_at_idx
  on public.audit_runs (created_at desc);

create index audit_runs_result_idx
  on public.audit_runs (result);

create index audit_runs_github_run_id_idx
  on public.audit_runs (github_run_id)
  where github_run_id is not null;

create trigger set_audit_runs_updated_at
before update on public.audit_runs
for each row
execute function public.set_updated_at();
