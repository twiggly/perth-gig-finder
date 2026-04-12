update public.venues
set website_url = 'https://www.rosemounthotel.com.au/'
where slug in ('rosemount-hotel', 'four5nine-bar-rosemount')
  and coalesce(website_url, '') = '';
