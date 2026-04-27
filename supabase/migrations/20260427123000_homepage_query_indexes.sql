create index if not exists gigs_active_starts_at_idx
  on public.gigs (starts_at)
  where status = 'active';

create index if not exists gigs_active_venue_starts_at_idx
  on public.gigs (venue_id, starts_at)
  where status = 'active';

create index if not exists source_gigs_gig_source_seen_idx
  on public.source_gigs (gig_id, source_id, last_seen_at desc, created_at desc);

create index if not exists source_gigs_gig_image_seen_idx
  on public.source_gigs (gig_id, source_id, last_seen_at desc, created_at desc)
  where source_image_url is not null
    or mirrored_image_path is not null;
