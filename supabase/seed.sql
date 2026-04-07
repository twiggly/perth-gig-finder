insert into public.sources (
  slug,
  name,
  base_url,
  priority,
  is_active
)
values (
  'milk-bar',
  'Milk Bar',
  'https://milkbarperth.com.au/gigs/',
  100,
  true
), (
  'oztix-wa',
  'Oztix WA',
  'https://www.oztix.com.au/search?states%5B0%5D=WA&q=',
  10,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  priority = excluded.priority,
  is_active = excluded.is_active;
