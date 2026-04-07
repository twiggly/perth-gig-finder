alter table public.sources
add column if not exists priority integer not null default 0;

update public.sources
set priority = 100
where slug = 'milk-bar';

update public.sources
set priority = 10
where slug = 'oztix-wa';

create or replace view public.gig_cards as
select
  g.id,
  g.slug,
  g.title,
  g.starts_at,
  g.ends_at,
  g.ticket_url,
  coalesce(preferred_source.source_url, g.source_url) as source_url,
  preferred_source.source_name,
  v.name as venue_name,
  v.suburb as venue_suburb,
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
) preferred_source on true;

grant select on public.gig_cards to anon, authenticated;
