# Perth Gig Finder

Perth Gig Finder is a web app for discovering live music events in Perth by aggregating gig listings from multiple venue and event websites into one searchable place.

## Product Goal

Users should be able to:

- browse upcoming gigs in Perth
- search and filter by artist, venue, suburb, date, and genre
- click through to the original source listing
- trust that listings are recent, deduplicated, and clearly sourced

## Proposed Stack

- `Next.js + React + TypeScript` for the web app
- `Supabase` for backend infrastructure
- `Postgres` for structured gig, venue, artist, and scrape data
- `Supabase Auth` for user accounts later
- `Supabase Storage` for images and imported media later
- `Supabase Edge Functions` for webhooks and notifications later
- `pnpm workspaces` for the monorepo
- `Cheerio` for most scraping/parsing
- `Playwright` only for JavaScript-heavy sites
- `Vitest` for unit and integration tests

Likely later integrations:

- `Stripe` for paid features
- `Postmark` for email notifications
- `Twilio` for SMS alerts
- `Leaflet` for venue maps

## Recommended Architecture

Keep the web app and scraping pipeline separate.

- The `web` app reads curated data from Supabase and renders the public site.
- Scrapers run as background jobs, not during page requests.
- Each scraper writes normalized gigs plus raw source metadata for traceability.
- Deduplication happens during ingestion, not in the UI.

That gives us a cleaner system:

- `apps/web`: public Next.js site
- `apps/scraper`: scraper runner / ingestion jobs
- `packages/shared`: shared types, schemas, helpers
- `supabase/`: SQL migrations, seeds, config, and edge functions later

## Suggested Repo Layout

```text
.
├─ apps/
│  ├─ web/
│  └─ scraper/
├─ packages/
│  └─ shared/
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  └─ functions/
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

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

## Delivery Phases

### Phase 1

- monorepo scaffold
- Supabase project setup
- initial SQL migrations
- first scraper for one source
- public gigs listing page

### Phase 2

- deduplication improvements
- venue pages
- richer filters
- scrape observability and retries

### Phase 3

- user accounts
- saved gigs / alerts
- email and SMS notifications
- payments for premium features if needed

## Practical Recommendations

- Keep scraping code out of the Next.js app runtime.
- Prefer SQL migrations over ORM-first schema management.
- Store enough raw source data to debug parser breakages.
- Design around idempotent upserts from day one.
- Add coordinates to venues early if maps are likely.
- Keep Stripe, Postmark, and Twilio fully optional until the core ingestion loop is stable.

## Best Next Build Step

The strongest next step is to scaffold the monorepo and create the first Supabase migration with the core tables:

- `sources`
- `venues`
- `artists`
- `gigs`
- `gig_artists`
- `source_gigs`
- `scrape_runs`

## MVP Status

The first working source is now implemented against `Milk Bar`.

- scraper source page: `https://milkbarperth.com.au/gigs/`
- source data path: embedded Algolia config in the venue page, fetched with `fetch` and normalized without Playwright
- public listing page: `apps/web/app/page.tsx`
- canonical listing view: `public.gig_cards`

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
pnpm test
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

7. Start the web app:

   ```bash
   pnpm dev
   ```
