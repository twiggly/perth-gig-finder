alter table public.source_gigs
add column if not exists starts_at_precision text not null default 'exact'
check (starts_at_precision in ('exact', 'date'));
