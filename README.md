# Perth Gig Finder

Perth Gig Finder is a web app for discovering live music events in Perth by aggregating gig listings from multiple venue and event websites into one searchable place.

## Project Docs

- `README.md`: project overview, current status, and human-facing setup guidance
- [AGENTS.md](/Users/tajbishop/Documents/perth-gig-finder/AGENTS.md): repo-specific operating rules for coding agents
- [PLANS.md](/Users/tajbishop/Documents/perth-gig-finder/PLANS.md): lightweight roadmap for active priorities

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
  - `Rosemount Hotel`
  - `The Bird`
  - `Humanitix Perth Music` filtered down to strict Perth-metro gigs
  - `Oztix WA` filtered down to Perth-metro music gigs
  - `Moshtix WA` filtered down to Perth-metro music gigs
  - `Ticketek WA` filtered down to Perth-metro live music results
  - `Ticketmaster AU` filtered down to direct Perth music listings
- The homepage supports search, venue chips, day-by-day navigation, mirrored gig images, and mobile/trackpad-friendly browsing.
- Mirrored source images are stored in Supabase Storage and preferred over third-party hotlinks.
- Production is live on Vercel, and Git-connected preview deployments are enabled for this repository.

## Current Limitations

- The public site is still homepage-first; venue pages and gig detail pages are not built yet.
- Scraping is still manual in local development, but hosted Supabase refreshes now run on a schedule through GitHub Actions.
- The preview server still uses a local wrapper because mobile Safari was caching stale preview assets aggressively, but it now builds in an isolated temp workspace instead of sharing Next build output with the main checkout.

## Hosted Operations

- Production is deployed on Vercel.
- Git-connected preview deployments are created from repository pushes.
- Hosted preview and production deployments use the hosted Supabase project configured in Vercel.
- Hosted data refresh runs through [/.github/workflows/refresh-hosted-gigs.yml](/Users/tajbishop/Documents/perth-gig-finder/.github/workflows/refresh-hosted-gigs.yml).
- Hosted artist provenance repairs run through [/.github/workflows/repair-hosted-artists.yml](/Users/tajbishop/Documents/perth-gig-finder/.github/workflows/repair-hosted-artists.yml).
- `ticketmaster-au` runs separately through [/.github/workflows/refresh-ticketmaster-self-hosted.yml](/Users/tajbishop/Documents/perth-gig-finder/.github/workflows/refresh-ticketmaster-self-hosted.yml) on a self-hosted runner labeled `perth-gig-finder` and `ticketmaster`, because GitHub-hosted runners are currently blocked with `403` responses.
- Runner health is monitored by [/.github/workflows/check-ticketmaster-runner.yml](/Users/tajbishop/Documents/perth-gig-finder/.github/workflows/check-ticketmaster-runner.yml), which fails if no matching self-hosted Ticketmaster runner is online.
- The runner health workflow reads the GitHub runners API through the `RUNNER_MONITOR_TOKEN` repository secret.
- The hosted refresh workflow:
  - scrapes source data into hosted Supabase
  - backfills mirrored images as best effort
  - audits the hosted `gig_cards` public view that feeds the homepage
- The hosted public payload audit runs in non-strict mode: hard errors fail the workflow, while warning-level findings stay visible in the workflow logs.
- For manual checks, run `pnpm audit:gigs -- --url <deployment-url> --vercel` for Vercel-protected deployments.

## Local Development

Local development uses the local Supabase stack. Hosted preview and production deployments use the hosted Supabase project configured in Vercel.

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
   pnpm supabase:start
   ```

   If Docker is unavailable, start Colima or Docker Desktop manually first, then rerun the command.

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

7. Recompute source-level artist provenance for active and upcoming gigs after parser changes when needed:

   ```bash
   pnpm --filter @perth-gig-finder/scraper repair-artists
   ```

### Local web servers

- Dev server:

  ```bash
  pnpm web:dev
  ```

  This is the hot-reloading local development server at `http://127.0.0.1:3001`.
  It now fails fast if local config, Docker, or Supabase are not ready.
  Start local infra first with `pnpm supabase:start`.

- Preview server:

  ```bash
  pnpm web:preview
  ```

  This serves the production-style preview on your Mac at `http://127.0.0.1:3003`
  and on the same Wi-Fi network via your Mac's LAN IP. It is the same preview on
  desktop and phone; the phone just accesses it over LAN.
  It uses the same fail-fast preflight as `pnpm web:dev`, and it builds from an
  isolated temp workspace so preview runs do not churn tracked Next.js files in
  the main checkout.

### Verification

- Fast workspace tests:

  ```bash
  pnpm test
  ```

- Full verification, including builds:

  ```bash
  pnpm verify
  ```

- Public gig payload audit:

  ```bash
  pnpm audit:gigs -- --url https://your-deployment.vercel.app --vercel
  ```

  Omit `--vercel` for publicly fetchable URLs. Use `--strict` if warning-level findings such as unexpected no-image rows or heuristic non-music matches should fail the command.
  The Bird rows without images are expected and counted separately from no-image warnings because the official venue feed does not provide posters.
  Hosted refreshes run `pnpm audit:gigs -- --supabase --limit 30` against the hosted `gig_cards` public view using the workflow Supabase secrets.

- Scraper-only verification:

  ```bash
  pnpm --filter @perth-gig-finder/scraper test
  pnpm --filter @perth-gig-finder/scraper build
  ```

- Artist provenance backfill after source-parser changes:

  ```bash
  pnpm --filter @perth-gig-finder/scraper repair-artists
  ```

### Troubleshooting

- Docker or Colima unavailable:

  ```bash
  colima start
  pnpm supabase:start
  ```

- Supabase unhealthy:

  ```bash
  pnpm supabase:start
  ```

- Next hangs before `Ready`, imports behave strangely, or local build output looks stale:

  ```bash
  pnpm local:repair
  ```

  This clears the workspace `node_modules` tree and local Next build output, then
  reinstalls from the lockfile.
