insert into public.sources (
  slug,
  name,
  base_url,
  priority,
  is_active,
  is_public_listing_source
)
values (
  'milk-bar',
  'Milk Bar',
  'https://milkbarperth.com.au/gigs/',
  100,
  true,
  true
), (
  'oztix-wa',
  'Oztix WA',
  'https://www.oztix.com.au/search?states%5B0%5D=WA&q=',
  10,
  true,
  true
), (
  'moshtix-wa',
  'Moshtix WA',
  'https://www.moshtix.com.au/v2/search',
  10,
  true,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  priority = excluded.priority,
  is_active = excluded.is_active,
  is_public_listing_source = excluded.is_public_listing_source;
