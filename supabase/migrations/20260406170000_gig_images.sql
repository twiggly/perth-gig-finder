alter table public.source_gigs
add column if not exists image_url text;

update public.source_gigs
set image_url = nullif(coalesce(raw_payload->>'HomepageImage', raw_payload->>'EventImage1'), '')
where image_url is null
  and nullif(coalesce(raw_payload->>'HomepageImage', raw_payload->>'EventImage1'), '') is not null;

drop view if exists public.gig_cards;

create view public.gig_cards as
select
  g.id,
  g.slug,
  g.title,
  g.starts_at,
  g.ends_at,
  g.ticket_url,
  coalesce(preferred_source.source_url, g.source_url) as source_url,
  preferred_source.source_name,
  preferred_image.image_url,
  v.slug as venue_slug,
  v.name as venue_name,
  v.suburb as venue_suburb,
  coalesce(artists.artist_names, array[]::text[]) as artist_names,
  g.status
from public.gigs g
join public.venues v on v.id = g.venue_id
left join lateral (
  select
    sg.source_url,
    s.name as source_name
  from public.source_gigs sg
  join public.sources s on s.id = sg.source_id
  where sg.gig_id = g.id
  order by s.priority desc, sg.last_seen_at desc, sg.created_at desc
  limit 1
) preferred_source on true
left join lateral (
  select sg.image_url
  from public.source_gigs sg
  join public.sources s on s.id = sg.source_id
  where sg.gig_id = g.id
    and sg.image_url is not null
  order by s.priority desc, sg.last_seen_at desc, sg.created_at desc
  limit 1
) preferred_image on true
left join lateral (
  select array_agg(a.name order by a.name) as artist_names
  from public.gig_artists ga
  join public.artists a on a.id = ga.artist_id
  where ga.gig_id = g.id
) artists on true;

grant select on public.gig_cards to anon, authenticated;
