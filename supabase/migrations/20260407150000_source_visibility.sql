alter table public.sources
  add column if not exists is_public_listing_source boolean not null default true;

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
  preferred_image.image_path,
  preferred_image.source_image_url,
  preferred_image.image_width,
  preferred_image.image_height,
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
    and s.is_public_listing_source
  order by s.priority desc, sg.last_seen_at desc, sg.created_at desc
  limit 1
) preferred_source on true
left join lateral (
  select
    sg.mirrored_image_path as image_path,
    sg.source_image_url,
    sg.mirrored_image_width as image_width,
    sg.mirrored_image_height as image_height
  from public.source_gigs sg
  join public.sources s on s.id = sg.source_id
  where sg.gig_id = g.id
    and s.is_public_listing_source
    and (sg.source_image_url is not null or sg.mirrored_image_path is not null)
  order by
    case
      when sg.image_mirror_status = 'ready' and sg.mirrored_image_path is not null then 0
      else 1
    end,
    s.priority desc,
    sg.last_seen_at desc,
    sg.created_at desc
  limit 1
) preferred_image on true
left join lateral (
  select array_agg(a.name order by a.name) as artist_names
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

grant select on public.gig_cards to anon, authenticated;
