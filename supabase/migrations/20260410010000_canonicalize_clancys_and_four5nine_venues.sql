with clancys_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug in ('clancys-fish-pub-freemantle', 'clancys-fish-pub-fremantle')
),
clancys_seed as (
  select
    max(suburb) as suburb,
    max(address) as address,
    max(website_url) as website_url
  from clancys_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'clancys-fish-pub',
  'Clancy''s Fish Pub',
  clancys_seed.suburb,
  clancys_seed.address,
  clancys_seed.website_url
from clancys_seed
where not exists (
  select 1 from public.venues where slug = 'clancys-fish-pub'
);

update public.venues
set
  name = 'Clancy''s Fish Pub',
  suburb = coalesce(public.venues.suburb, clancys_seed.suburb),
  address = coalesce(public.venues.address, clancys_seed.address),
  website_url = coalesce(public.venues.website_url, clancys_seed.website_url)
from (
  select
    max(suburb) as suburb,
    max(address) as address,
    max(website_url) as website_url
  from public.venues
  where slug in ('clancys-fish-pub-freemantle', 'clancys-fish-pub-fremantle')
) as clancys_seed
where public.venues.slug = 'clancys-fish-pub';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'clancys-fish-pub'
)
where venue_id in (
  select id
  from public.venues
  where slug in ('clancys-fish-pub-freemantle', 'clancys-fish-pub-fremantle')
);

delete from public.venues as venue
where slug in ('clancys-fish-pub-freemantle', 'clancys-fish-pub-fremantle')
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );

with four5nine_legacy as (
  select suburb, address, website_url
  from public.venues
  where slug = 'four5nine-bar'
),
four5nine_seed as (
  select
    max(suburb) as suburb,
    max(address) as address,
    max(website_url) as website_url
  from four5nine_legacy
)
insert into public.venues (slug, name, suburb, address, website_url)
select
  'four5nine-bar-rosemount',
  'Four5Nine Bar @ Rosemount',
  four5nine_seed.suburb,
  four5nine_seed.address,
  four5nine_seed.website_url
from four5nine_seed
where not exists (
  select 1 from public.venues where slug = 'four5nine-bar-rosemount'
);

update public.venues
set
  name = 'Four5Nine Bar @ Rosemount',
  suburb = coalesce(public.venues.suburb, four5nine_seed.suburb),
  address = coalesce(public.venues.address, four5nine_seed.address),
  website_url = coalesce(public.venues.website_url, four5nine_seed.website_url)
from (
  select
    max(suburb) as suburb,
    max(address) as address,
    max(website_url) as website_url
  from public.venues
  where slug = 'four5nine-bar'
) as four5nine_seed
where public.venues.slug = 'four5nine-bar-rosemount';

update public.gigs
set venue_id = (
  select id from public.venues where slug = 'four5nine-bar-rosemount'
)
where venue_id in (
  select id
  from public.venues
  where slug = 'four5nine-bar'
);

delete from public.venues as venue
where slug = 'four5nine-bar'
  and not exists (
    select 1
    from public.gigs as gig
    where gig.venue_id = venue.id
  );
