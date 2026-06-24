create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create or replace function app_private.is_public_gig(target_gig_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.source_gigs sg
    join public.sources s on s.id = sg.source_id
    where sg.gig_id = target_gig_id
      and s.is_public_listing_source
  );
$$;

revoke all on function app_private.is_public_gig(uuid) from public, anon, authenticated;
grant execute on function app_private.is_public_gig(uuid) to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

alter view public.gig_cards set (security_invoker = true);
alter view public.homepage_gig_dates set (security_invoker = true);

alter table public.gigs enable row level security;
alter table public.artists enable row level security;
alter table public.venues enable row level security;
alter table public.gig_artists enable row level security;
alter table public.sources enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.source_gigs enable row level security;
alter table public.audit_runs enable row level security;

drop policy if exists "public read public gigs" on public.gigs;
drop policy if exists "public read public gig venues" on public.venues;
drop policy if exists "public read public gig artists" on public.artists;
drop policy if exists "public read public gig artist links" on public.gig_artists;
drop policy if exists "public read public gig sources" on public.sources;
drop policy if exists "public read public source gigs" on public.source_gigs;

revoke all on
  public.gigs,
  public.artists,
  public.venues,
  public.gig_artists,
  public.sources,
  public.scrape_runs,
  public.source_gigs,
  public.audit_runs,
  public.gig_cards,
  public.homepage_gig_dates
from public, anon, authenticated;

grant all on
  public.gigs,
  public.artists,
  public.venues,
  public.gig_artists,
  public.sources,
  public.scrape_runs,
  public.source_gigs,
  public.audit_runs
to service_role;

grant select on
  public.gig_cards,
  public.homepage_gig_dates
to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
exception
  when insufficient_privilege or undefined_object then
    null;
end;
$$;

grant select on public.gig_cards to anon, authenticated;
grant select on public.homepage_gig_dates to anon, authenticated;

grant select (
  id,
  slug,
  title,
  starts_at,
  ends_at,
  ticket_url,
  source_url,
  venue_id,
  status
) on public.gigs to anon, authenticated;

grant select (
  id,
  slug,
  name,
  suburb,
  address,
  website_url
) on public.venues to anon, authenticated;

grant select (
  id,
  name
) on public.artists to anon, authenticated;

grant select (
  gig_id,
  artist_id,
  sort_order
) on public.gig_artists to anon, authenticated;

grant select (
  id,
  name,
  priority,
  is_public_listing_source
) on public.sources to anon, authenticated;

grant select (
  gig_id,
  source_id,
  source_url,
  source_image_url,
  mirrored_image_path,
  mirrored_image_width,
  mirrored_image_height,
  image_mirror_status,
  image_mirrored_at,
  last_seen_at,
  created_at
) on public.source_gigs to anon, authenticated;

create policy "public read public gigs"
on public.gigs
for select
to anon, authenticated
using (app_private.is_public_gig(id));

create policy "public read public gig venues"
on public.venues
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.gigs g
    where g.venue_id = venues.id
      and app_private.is_public_gig(g.id)
  )
);

create policy "public read public gig artists"
on public.artists
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.gig_artists ga
    where ga.artist_id = artists.id
      and app_private.is_public_gig(ga.gig_id)
  )
);

create policy "public read public gig artist links"
on public.gig_artists
for select
to anon, authenticated
using (app_private.is_public_gig(gig_id));

create policy "public read public gig sources"
on public.sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.source_gigs sg
    where sg.source_id = sources.id
      and app_private.is_public_gig(sg.gig_id)
  )
);

create policy "public read public source gigs"
on public.source_gigs
for select
to anon, authenticated
using (app_private.is_public_gig(gig_id));
