drop view if exists public.homepage_gig_dates;

create view public.homepage_gig_dates as
select
  g.id,
  g.title,
  g.starts_at,
  v.slug as venue_slug,
  v.name as venue_name,
  v.suburb as venue_suburb,
  coalesce(artists.artist_names, array[]::text[]) as artist_names,
  g.status
from public.gigs g
join public.venues v on v.id = g.venue_id
left join lateral (
  select array_agg(a.name order by ga.sort_order, a.name) as artist_names
  from public.gig_artists ga
  join public.artists a on a.id = ga.artist_id
  where ga.gig_id = g.id
) artists on true
where exists (
  select 1
  from public.source_gigs sg
  join public.sources s on s.id = sg.source_id
  where sg.gig_id = g.id
    and s.is_public_listing_source
);

grant select on public.homepage_gig_dates to anon, authenticated;
