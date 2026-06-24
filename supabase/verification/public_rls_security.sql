do $$
declare
  finding_count integer;
  verification_source_id uuid;
  verification_venue_id uuid;
  verification_gig_id uuid;
begin
  select count(*)
  into finding_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'artists',
      'audit_runs',
      'gig_artists',
      'gigs',
      'scrape_runs',
      'source_gigs',
      'sources',
      'venues'
    )
    and not c.relrowsecurity;

  if finding_count <> 0 then
    raise exception 'Expected RLS on all listed public tables, found % disabled table(s).', finding_count;
  end if;

  select count(*)
  into finding_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('gig_cards', 'homepage_gig_dates')
    and not (coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true']);

  if finding_count <> 0 then
    raise exception 'Expected security_invoker=true on public views, found % non-compliant view(s).', finding_count;
  end if;

  select count(*)
  into finding_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'artists',
      'audit_runs',
      'gig_artists',
      'gigs',
      'scrape_runs',
      'source_gigs',
      'sources',
      'venues',
      'gig_cards',
      'homepage_gig_dates'
    )
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if finding_count <> 0 then
    raise exception 'Expected no public write/table-management grants, found % grant(s).', finding_count;
  end if;

  select count(*)
  into finding_count
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in ('source_gigs', 'scrape_runs', 'audit_runs')
    and grantee in ('anon', 'authenticated')
    and column_name in ('raw_payload', 'checksum', 'external_id', 'error_message', 'error_examples', 'warning_examples');

  if finding_count <> 0 then
    raise exception 'Expected sensitive operational columns to remain private, found % grant(s).', finding_count;
  end if;

  select count(*)
  into finding_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('scrape_runs', 'audit_runs');

  if finding_count <> 0 then
    raise exception 'Expected no public policies on operational tables, found % policy/policies.', finding_count;
  end if;

  select count(*)
  into finding_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('gigs', 'venues', 'artists', 'gig_artists', 'sources', 'source_gigs')
    and policyname in (
      'public read public gigs',
      'public read public gig venues',
      'public read public gig artists',
      'public read public gig artist links',
      'public read public gig sources',
      'public read public source gigs'
    )
    and cmd = 'SELECT'
    and roles @> array['anon', 'authenticated']::name[]
    and roles <@ array['anon', 'authenticated']::name[];

  if finding_count <> 6 then
    raise exception 'Expected six public read policies, found %.', finding_count;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'is_public_gig'
      and p.prosecdef
      and coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']
  ) then
    raise exception 'Expected app_private.is_public_gig(uuid) to be SECURITY DEFINER with a fixed empty search_path.';
  end if;

  if not has_schema_privilege('anon', 'app_private', 'USAGE')
    or not has_schema_privilege('authenticated', 'app_private', 'USAGE') then
    raise exception 'Expected anon/authenticated to have app_private schema usage for RLS helper evaluation.';
  end if;

  if not has_function_privilege('anon', 'app_private.is_public_gig(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'app_private.is_public_gig(uuid)', 'EXECUTE') then
    raise exception 'Expected anon/authenticated execute privilege on app_private.is_public_gig(uuid).';
  end if;

  if has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE') then
    raise exception 'Expected anon/authenticated to lack execute privilege on public.set_updated_at().';
  end if;

  execute 'set local role anon';

  execute 'select id, slug, title, starts_at, artist_names, venue_slug, venue_name, status from public.gig_cards limit 1';
  execute 'select id, title, starts_at, artist_names, venue_slug, venue_name, status from public.homepage_gig_dates limit 1';
  execute 'select slug, name, suburb from public.venues limit 1';

  begin
    execute 'select raw_payload from public.source_gigs limit 1';
    raise exception 'anon unexpectedly read source_gigs.raw_payload';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute 'select id from public.scrape_runs limit 1';
    raise exception 'anon unexpectedly read scrape_runs';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute 'select id from public.audit_runs limit 1';
    raise exception 'anon unexpectedly read audit_runs';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute $sql$insert into public.venues (slug, name) values ('rls-verification-anon', 'RLS Verification Anon')$sql$;
    raise exception 'anon unexpectedly inserted a venue';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';

  execute 'set local role service_role';

  execute $sql$
    insert into public.sources (
      slug,
      name,
      base_url,
      priority,
      is_public_listing_source
    )
    values (
      'rls-verification-source',
      'RLS Verification Source',
      'https://example.com',
      0,
      true
    )
    returning id
  $sql$ into verification_source_id;

  execute $sql$
    insert into public.venues (
      slug,
      name,
      suburb
    )
    values (
      'rls-verification-venue',
      'RLS Verification Venue',
      'Perth'
    )
    returning id
  $sql$ into verification_venue_id;

  execute $sql$
    insert into public.gigs (
      venue_id,
      title,
      starts_at,
      source_url,
      slug
    )
    values (
      $1,
      'RLS Verification Gig',
      '2099-01-01T10:00:00Z'::timestamptz,
      'https://example.com/rls-verification',
      'rls-verification-gig'
    )
    returning id
  $sql$ using verification_venue_id into verification_gig_id;

  execute $sql$
    insert into public.source_gigs (
      source_id,
      gig_id,
      source_url,
      raw_payload,
      checksum
    )
    values (
      $1,
      $2,
      'https://example.com/rls-verification',
      '{}'::jsonb,
      'rls-verification-checksum'
    )
  $sql$ using verification_source_id, verification_gig_id;

  execute $sql$
    insert into public.scrape_runs (
      source_id,
      status,
      started_at
    )
    values (
      $1,
      'running',
      now()
    )
  $sql$ using verification_source_id;

  execute $sql$
    insert into public.audit_runs (
      result,
      target_kind,
      target_label,
      payload_gig_count,
      payload_day_count
    )
    values (
      'pass',
      'verification',
      'local',
      0,
      0
    )
  $sql$;

  execute 'reset role';

  delete from public.audit_runs
  where target_kind = 'verification'
    and target_label = 'local';

  delete from public.scrape_runs
  where source_id = verification_source_id;

  delete from public.source_gigs
  where checksum = 'rls-verification-checksum';

  delete from public.gigs
  where id = verification_gig_id;

  delete from public.venues
  where id = verification_venue_id;

  delete from public.sources
  where id = verification_source_id;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;
