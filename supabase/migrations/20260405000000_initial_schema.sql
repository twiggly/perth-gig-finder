create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  base_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  suburb text,
  address text,
  website_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.gigs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  venue_id uuid not null references public.venues(id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_url text,
  source_url text not null,
  status text not null default 'active' check (status in ('active', 'cancelled', 'postponed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index gigs_starts_at_idx on public.gigs (starts_at);

create table public.gig_artists (
  gig_id uuid not null references public.gigs(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (gig_id, artist_id)
);

create table public.source_gigs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  external_id text,
  source_url text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  checksum text not null,
  identity_key text generated always as (coalesce(external_id, checksum)) stored,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index source_gigs_source_identity_key
  on public.source_gigs (source_id, identity_key);

create index source_gigs_last_seen_at_idx on public.source_gigs (last_seen_at);

create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_sources_updated_at
before update on public.sources
for each row
execute function public.set_updated_at();

create trigger set_venues_updated_at
before update on public.venues
for each row
execute function public.set_updated_at();

create trigger set_artists_updated_at
before update on public.artists
for each row
execute function public.set_updated_at();

create trigger set_gigs_updated_at
before update on public.gigs
for each row
execute function public.set_updated_at();

create trigger set_source_gigs_updated_at
before update on public.source_gigs
for each row
execute function public.set_updated_at();

create trigger set_scrape_runs_updated_at
before update on public.scrape_runs
for each row
execute function public.set_updated_at();

create or replace view public.gig_cards as
select
  g.id,
  g.slug,
  g.title,
  g.starts_at,
  g.ends_at,
  g.ticket_url,
  coalesce(sg.source_url, g.source_url) as source_url,
  s.name as source_name,
  v.name as venue_name,
  v.suburb as venue_suburb,
  g.status
from public.gigs g
join public.venues v on v.id = g.venue_id
left join lateral (
  select source_gigs.source_url, source_gigs.source_id
  from public.source_gigs
  where source_gigs.gig_id = g.id
  order by source_gigs.last_seen_at desc, source_gigs.created_at desc
  limit 1
) sg on true
left join public.sources s on s.id = sg.source_id;

grant usage on schema public to anon, authenticated;
grant select on public.gig_cards to anon, authenticated;
