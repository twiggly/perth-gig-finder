with seasonal_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'seasonal-brewing-co'
),
seasonal_seed as (
  select
    coalesce(max(suburb), 'Maylands') as suburb,
    coalesce(max(address), '175 Guildford Rd, Maylands WA 6051') as address,
    coalesce(max(website_url), 'https://www.seasonalbrewing.beer/') as website_url
  from seasonal_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'the-seasonal-brewing-co',
  'The Seasonal Brewing Co',
  seasonal_seed.suburb,
  seasonal_seed.address,
  seasonal_seed.website_url
from seasonal_seed
where not exists (
  select 1 from public.venues where slug = 'the-seasonal-brewing-co'
);

update public.venues
set
  name = 'The Seasonal Brewing Co',
  suburb = 'Maylands',
  website_url = 'https://www.seasonalbrewing.beer/'
where slug = 'the-seasonal-brewing-co';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'the-seasonal-brewing-co'
)
where venue_id in (
  select id from public.venues where slug = 'seasonal-brewing-co'
);

delete from public.venues as venue
where slug = 'seasonal-brewing-co'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

with court_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'the-court-hotel'
),
court_seed as (
  select
    coalesce(max(suburb), 'Perth') as suburb,
    coalesce(max(address), '50 Beaufort Street, Perth WA 6000') as address,
    coalesce(max(website_url), 'https://thecourt.com.au/') as website_url
  from court_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'the-court',
  'The Court',
  court_seed.suburb,
  court_seed.address,
  court_seed.website_url
from court_seed
where not exists (
  select 1 from public.venues where slug = 'the-court'
);

update public.venues
set
  name = 'The Court',
  suburb = 'Perth',
  address = '50 Beaufort Street, Perth WA 6000',
  website_url = 'https://thecourt.com.au/'
where slug = 'the-court';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'the-court'
)
where venue_id in (
  select id from public.venues where slug = 'the-court-hotel'
);

delete from public.venues as venue
where slug = 'the-court-hotel'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

with old_habits_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'old-habits'
),
old_habits_seed as (
  select
    coalesce(max(suburb), 'West Perth') as suburb,
    coalesce(max(address), '7 Old Aberdeen Pl, West Perth WA 6005, Australia') as address,
    max(website_url) as website_url
  from old_habits_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'old-habits-neighbourhood-bar',
  'Old Habits Neighbourhood Bar',
  old_habits_seed.suburb,
  old_habits_seed.address,
  old_habits_seed.website_url
from old_habits_seed
where not exists (
  select 1 from public.venues where slug = 'old-habits-neighbourhood-bar'
);

update public.venues
set
  name = 'Old Habits Neighbourhood Bar',
  suburb = 'West Perth'
where slug = 'old-habits-neighbourhood-bar';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'old-habits-neighbourhood-bar'
)
where venue_id in (
  select id from public.venues where slug = 'old-habits'
);

delete from public.venues as venue
where slug = 'old-habits'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

with museum_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'stan-perron-wa-treasures-hackett-hall-wa-museum-boola-bardip'
),
museum_seed as (
  select
    coalesce(max(suburb), 'Perth') as suburb,
    coalesce(max(address), 'Perth Cultural Centre, Perth WA 6000, Australia') as address,
    max(website_url) as website_url
  from museum_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'hackett-hall-wa-museum-boola-bardip',
  'Hackett Hall, WA Museum Boola Bardip',
  museum_seed.suburb,
  museum_seed.address,
  museum_seed.website_url
from museum_seed
where not exists (
  select 1 from public.venues where slug = 'hackett-hall-wa-museum-boola-bardip'
);

update public.venues
set
  name = 'Hackett Hall, WA Museum Boola Bardip',
  suburb = 'Perth'
where slug = 'hackett-hall-wa-museum-boola-bardip';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'hackett-hall-wa-museum-boola-bardip'
)
where venue_id in (
  select id
  from public.venues
  where slug = 'stan-perron-wa-treasures-hackett-hall-wa-museum-boola-bardip'
);

delete from public.venues as venue
where slug = 'stan-perron-wa-treasures-hackett-hall-wa-museum-boola-bardip'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

with north_freo_bowlo_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'north-freo-bowlo-hilton-park-bowling-club'
),
north_freo_bowlo_seed as (
  select
    coalesce(max(suburb), 'North Fremantle') as suburb,
    coalesce(max(address), '8 Thompson Road, North Fremantle WA 6159') as address,
    max(website_url) as website_url
  from north_freo_bowlo_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'north-freo-bowlo',
  'North Freo Bowlo',
  north_freo_bowlo_seed.suburb,
  north_freo_bowlo_seed.address,
  north_freo_bowlo_seed.website_url
from north_freo_bowlo_seed
where not exists (
  select 1 from public.venues where slug = 'north-freo-bowlo'
);

update public.venues
set
  name = 'North Freo Bowlo',
  suburb = 'North Fremantle',
  address = '8 Thompson Road, North Fremantle WA 6159'
where slug = 'north-freo-bowlo';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'north-freo-bowlo'
)
where venue_id in (
  select id
  from public.venues
  where slug = 'north-freo-bowlo-hilton-park-bowling-club'
);

delete from public.venues as venue
where slug = 'north-freo-bowlo-hilton-park-bowling-club'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

update public.venues
set suburb = 'Northbridge'
where slug = 'the-bird';

update public.venues
set suburb = 'Northbridge'
where slug = 'the-rechabite';

update public.venues
set address = '135 Duke St, East Fremantle WA 6158'
where slug = 'the-duke-of-george';

update public.venues
set name = 'Music on Murray St'
where slug = 'music-on-murray-st';
