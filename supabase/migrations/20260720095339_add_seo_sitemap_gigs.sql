create view public.seo_sitemap_gigs as
select
  g.slug,
  g.starts_at,
  g.status,
  g.updated_at as last_modified
from public.gigs g
where exists (
  select 1
  from public.source_gigs sg
  join public.sources s on s.id = sg.source_id
  where sg.gig_id = g.id
    and s.is_public_listing_source
);

alter view public.seo_sitemap_gigs set (security_invoker = true);

comment on view public.seo_sitemap_gigs is
  'Minimal public event update surface used to generate indexable sitemap entries.';

grant select on public.seo_sitemap_gigs to anon, authenticated, service_role;
grant select (updated_at) on public.gigs to anon, authenticated;
