alter table public.source_gigs
add column if not exists artist_names text[] not null default array[]::text[];

alter table public.source_gigs
add column if not exists artist_extraction_kind text not null default 'unknown'
check (artist_extraction_kind in ('structured', 'explicit_lineup', 'parsed_text', 'unknown'));
