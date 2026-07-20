-- Emergency rollback for supabase/migrations/*_harden_public_rls_and_views.sql.
-- Prefer fixing forward. Use this only if the RLS hardening must be reversed
-- before a replacement migration is available.

alter view public.gig_cards reset (security_invoker);
alter view public.homepage_gig_dates reset (security_invoker);
alter view public.seo_sitemap_gigs reset (security_invoker);

drop policy if exists "public read public gigs" on public.gigs;
drop policy if exists "public read public gig venues" on public.venues;
drop policy if exists "public read public gig artists" on public.artists;
drop policy if exists "public read public gig artist links" on public.gig_artists;
drop policy if exists "public read public gig sources" on public.sources;
drop policy if exists "public read public source gigs" on public.source_gigs;

alter table public.gigs disable row level security;
alter table public.artists disable row level security;
alter table public.venues disable row level security;
alter table public.gig_artists disable row level security;
alter table public.sources disable row level security;
alter table public.scrape_runs disable row level security;
alter table public.source_gigs disable row level security;
alter table public.audit_runs disable row level security;

drop function if exists app_private.is_public_gig(uuid);
drop schema if exists app_private;

grant all on
  public.gigs,
  public.artists,
  public.venues,
  public.gig_artists,
  public.sources,
  public.scrape_runs,
  public.source_gigs,
  public.audit_runs,
  public.gig_cards,
  public.homepage_gig_dates,
  public.seo_sitemap_gigs
to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.set_updated_at() to public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to public, anon, authenticated;

do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public grant all on tables to anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public grant all on sequences to anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public grant execute on functions to public, anon, authenticated';
exception
  when insufficient_privilege or undefined_object then
    null;
end;
$$;
