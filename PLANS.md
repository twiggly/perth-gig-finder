# PLANS.md

This file is a lightweight roadmap for the next meaningful work in Perth Gig Finder.

This is not a backlog dump. Keep only active priorities here.
Keep it current. Remove stale items instead of letting this become a graveyard.
When work ships, remove it from this file or rewrite it to reflect the new next step.

## Now

### 1. Add More Perth-Relevant Sources

Expand coverage in [apps/scraper/src/sources](apps/scraper/src/sources).

Outcome:
- more complete city coverage and fewer missing gigs from important Perth venues/promoters

Good targets:
- additional ticketing feeds
- venue-owned event pages
- promoters with recurring live-music listings

Done means:
- source adapter added
- tests added
- hosted refresh can ingest it reliably

### 2. Improve Normalization And Dedupe Quality

Strengthen canonicalization in the scraper and store layer.

Outcome:
- fewer duplicate gigs
- cleaner venue and artist data
- less manual cleanup after scrapes

Key areas:
- venue alias handling
- artist normalization
- checksum and matching behavior
- source-specific cleanup before upsert

Primary touchpoints:
- [apps/scraper/src/index.ts](apps/scraper/src/index.ts)
- [apps/scraper/src/supabase-store.ts](apps/scraper/src/supabase-store.ts)
- [packages/shared](packages/shared)

### 3. Harden Image Handling

Keep mirrored posters reliable without making the scraper brittle.

Outcome:
- fewer broken posters
- fewer recurring image-mirror failures
- better fallback behavior when a source image is bad

Key areas:
- image mirror retry strategy and failure-state handling
- source-specific fallback selection
- preserving useful metadata when mirroring is unavailable
- clearer aggregate image-backfill reporting

Primary touchpoints:
- [apps/scraper/src/image-mirror.ts](apps/scraper/src/image-mirror.ts)
- [apps/scraper/src/mirror-images.ts](apps/scraper/src/mirror-images.ts)
- source adapters in [apps/scraper/src/sources](apps/scraper/src/sources)

## Next

### 4. Improve Scraper Observability

The hosted pipeline works, but scraper visibility can still improve.

Useful follow-ups:
- compare at least six successful hosted `[scrape-metrics]` runs after the
  scraper performance rollout
- prototype a service-role write-plan RPC only if persistence p50 remains
  above 45 seconds or total scrape p50 remains above 120 seconds
- persisted scrape/source trends
- GitHub Actions job summaries
- source failure alerting
- easier comparison across scrape runs
- clearer aggregate mirror reporting

### 5. Add Scraper-Side Enrichment

Improve the quality of what gets written into canonical gig data.

Good candidates:
- genre extraction
- stronger artist extraction from descriptions/titles
- better venue website and metadata enrichment
- suburb/address cleanup

### 6. Revisit Source Priorities And Coverage Gaps

Once more sources are live, tune which source wins for image, URL, and display priority.

Goals:
- cleaner canonical gig cards
- better preferred source selection
- less noisy source overlap

## Later

### 7. Build Venue Pages

Build `/venues/[slug]` after scraper quality makes venue data more reliable.

Desired outcome:
- venue pages become a real browse surface, not just filter targets

### 8. Improve Event SEO Metadata And Images

Now that `/gigs/[slug]` pages are live, improve their search-preview quality without cluttering the visible listing page.

Good candidates:
- stronger poster image eligibility for rich results
- better fact-based metadata fallbacks
- structured-data validation against real hosted pages

### 9. Saved Alerts / Notifications

Worth doing after scraper coverage and canonical data quality are stronger.

Likely first targets:
- venue alerts
- artist alerts

## Operating Notes

- Prefer scraper/data-quality work over new web surface area for now.
- Use local runs for fast debugging and source iteration.
- Use the hosted refresh workflow to verify real ingestion behavior after scraper changes.
- Keep `main` clean and production-safe.
