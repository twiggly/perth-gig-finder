# AGENTS.md

This file is for coding agents working in this repository. Keep it short, practical, operational, and specific to this project. Do not let it turn into a second README or roadmap.

## Project Shape

- `apps/web`: Next.js public site. It reads curated gig data from Supabase and never scrapes during requests.
- `apps/scraper`: source adapters, normalization, dedupe, and image mirroring.
- `packages/shared`: shared normalization and type helpers.

## Default Workflow

- Use the local web app for day-to-day feature work.
- Use Vercel to verify deployed behavior and share previews.
- Use Git-driven Vercel deploys as the normal deploy path.
- Treat `main` as the source of truth for production.

## Local Development

- Supported Node lines are even releases only: `20.19.0+`, `22.12.0+`, or `24.x`.
- Odd Node releases such as `25.x` are intentionally blocked.
- Install deps with `pnpm install`.
- Start local infra with `pnpm supabase:start`.
- Reset local data with `pnpm supabase:reset`.
- Run the scraper locally with `pnpm scrape`.
- Start the local web app with `pnpm web:dev`.
- Start the production-style local preview with `pnpm web:preview`.

## Verification

- Fast check: `pnpm test`
- Full check: `pnpm verify`
- Web-only build: `pnpm --filter @perth-gig-finder/web build`
- Scraper-only tests: `pnpm --filter @perth-gig-finder/scraper test`

## Hosted Operations

- Production and previews are deployed from Vercel.
- Hosted data refresh runs through [/.github/workflows/refresh-hosted-gigs.yml](/Users/tajbishop/Documents/perth-gig-finder/.github/workflows/refresh-hosted-gigs.yml).
- The hosted workflow:
  - runs `scrape` against hosted Supabase
  - runs `mirror-images` as best effort
- A few poster mirror failures should not fail the whole hosted refresh workflow.

## Supabase Rules

- Local development uses local Supabase env files:
  - `apps/web/.env.local`
  - `apps/scraper/.env`
- Hosted Vercel environments use hosted Supabase env vars configured in Vercel, not local files.
- Mirrored images live in Supabase Storage, not in Postgres itself.
- Postgres stores mirrored image metadata such as path, dimensions, and mirror status.

## Image Mirroring

- Image backfill exists to mirror third-party posters into Supabase Storage and record stable metadata.
- Current mirror limits are defined in [apps/scraper/src/image-mirror.ts](/Users/tajbishop/Documents/perth-gig-finder/apps/scraper/src/image-mirror.ts):
  - source download limit: `32 MB`
  - mirrored output limit: `8 MB`
- If a source image is bad or unavailable, prefer fixing the source adapter rather than weakening the render guard in the web app.

## Generated And Local-Only Files

- Do not commit local env files.
- Do not commit local Vercel metadata under `/.vercel`.
- Do not commit `*.tsbuildinfo`.
- Treat [apps/web/next-env.d.ts](/Users/tajbishop/Documents/perth-gig-finder/apps/web/next-env.d.ts) as generated. If it changes locally to a dev-specific path, restore it instead of committing it.

## Git Hygiene

- Keep changes scoped and commits intentional.
- Prefer small, topic-focused commits.
- Do not leave throwaway verification branches around after checks complete.
- Clean up merged branches when they are no longer useful.
- Use [PLANS.md](/Users/tajbishop/Documents/perth-gig-finder/PLANS.md) for roadmap and feature priority decisions.

## Documentation Hygiene

- When a merged change makes docs stale, update the relevant file in the same change or immediately after:
  - [README.md](/Users/tajbishop/Documents/perth-gig-finder/README.md) for project status, setup, and human-facing workflow
  - [AGENTS.md](/Users/tajbishop/Documents/perth-gig-finder/AGENTS.md) for repo-specific operating rules
  - [PLANS.md](/Users/tajbishop/Documents/perth-gig-finder/PLANS.md) for active priorities and shipped roadmap items
- Do not force doc edits for unrelated cosmetic code changes, but do not leave behavior, infra, or workflow docs knowingly stale after merge.

## Common Traps

- If local web commands fail, check Node version first, then Docker/Colima, then Supabase.
- If hosted refresh fails in image backfill, inspect source image URLs before changing mirror limits.
- If Vercel preview behavior differs from local, verify environment variables and deployment context before changing app code.
