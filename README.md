# Perth Gig Finder

Perth Gig Finder is a web app for discovering live music events in Perth by aggregating gig listings from multiple venue and event websites into one searchable place.

## Product Goal

Users should be able to:

- browse upcoming gigs in Perth
- search and filter by artist, venue, suburb, date, and genre
- click through to the original source listing
- trust that listings are recent, deduplicated, and clearly sourced

## Current Architecture

- `apps/web` is the public Next.js site. It reads curated gig data from Supabase and never scrapes during page requests.
- `apps/scraper` fetches source data, normalizes it, deduplicates gigs, mirrors image assets, and writes canonical records into Supabase.
- `packages/shared` holds shared normalization contracts and helpers used by both sides.

## Data Model Direction

Start with a schema that supports both clean display data and scrape traceability.

Core tables:

- `sources`: each site we scrape
- `venues`: venue name, suburb, address, coordinates later
- `artists`: artist or act names
- `gigs`: canonical gig records
- `gig_artists`: many-to-many join between gigs and artists
- `source_gigs`: source-specific raw listing and canonical gig mapping
- `scrape_runs`: status, timing, errors, and counts for each run

Useful fields on `gigs`:

- `id`
- `venue_id`
- `title`
- `description`
- `starts_at`
- `ends_at`
- `ticket_url`
- `source_url`
- `status`
- `genre`
- `age_restriction`
- `created_at`
- `updated_at`

Useful fields on `source_gigs`:

- `id`
- `source_id`
- `gig_id`
- `external_id`
- `source_url`
- `raw_payload jsonb`
- `raw_html text` or a storage reference
- `last_seen_at`
- `checksum`

Important constraints:

- unique index on `sources.slug`
- unique index on `venues.slug`
- unique index on `source_gigs (source_id, external_id)` when available
- fallback dedupe key when a source does not expose stable IDs

## Scraping Strategy

Use the lightest tool that works.

- Default to `Cheerio` for static HTML pages
- Use `Playwright` only for sites that require rendered content, client-side navigation, or anti-bot workarounds
- Store source-specific parsing logic in isolated adapters
- Normalize into a common ingestion shape before writing to the database

Recommended scraper flow:

1. Fetch page
2. Parse source records
3. Normalize venue, artist, and gig fields
4. Upsert source listing
5. Match or create canonical gig
6. Record scrape run metrics and failures

## Next.js App Direction

Use the App Router from the start.

- server-render public listing pages for SEO
- keep filters simple at first
- treat Supabase as the source of truth
- add authenticated features later without reshaping the public data model

Good first pages:

- `/`
- `/gigs`
- `/gigs/[slug]`
- `/venues/[slug]`

## MVP Status

- Sources live today:
  - `Milk Bar`
  - `Oztix WA` filtered down to Perth-metro music gigs
- The homepage supports search, venue chips, day-by-day navigation, mirrored gig images, and mobile/trackpad-friendly browsing.
- Mirrored source images are stored in Supabase Storage and preferred over third-party hotlinks.

## Current Limitations

- The public site is still homepage-first; venue pages and gig detail pages are not built yet.
- Scraping is still manual in local development; there is no scheduled production refresh flow yet.
- The preview server still uses a local wrapper because mobile Safari was caching stale preview assets aggressively, but it now builds in an isolated temp workspace instead of sharing Next build output with the main checkout.

## Local Development

### Supported Node.js

Use an even Node release line for this repo:

- `20.19.0+`
- `22.12.0+`
- `24.x`

Odd release lines such as `25.x` are intentionally blocked in this project because the current
toolchain can fail inside Vite and Vitest with opaque module-resolution errors.

Quickest fix if you hit that:

```bash
nvm use
# or
pnpm env use --global 22.12.0
pnpm install
pnpm verify
```

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the local Supabase stack:

   ```bash
   supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
   ```

3. Print the local API keys from the running gateway container:

   ```bash
   pnpm supabase:keys
   ```

4. Copy the values into:

- `apps/web/.env.local`
- `apps/scraper/.env`

5. Reset the database and seed the source row:

   ```bash
   pnpm supabase:reset
   ```

6. Run the scraper:

   ```bash
   pnpm scrape
   ```

### Local web servers

- Dev server:

  ```bash
  pnpm web:dev
  ```

  This is the hot-reloading local development server at `http://127.0.0.1:3001`.
  It will bring Colima and the local Supabase stack up automatically when needed.

- Preview server:

  ```bash
  pnpm web:preview
  ```

  This serves the production-style preview on your Mac at `http://127.0.0.1:3003`
  and on the same Wi-Fi network via your Mac's LAN IP. It is the same preview on
  desktop and phone; the phone just accesses it over LAN.
  It also auto-starts Colima and Supabase before the preview build runs, and it
  builds from an isolated temp workspace so preview runs do not churn tracked
  Next.js files in the main checkout.

### Verification

- Fast workspace tests:

  ```bash
  pnpm test
  ```

- Full verification, including builds:

  ```bash
  pnpm verify
  ```
