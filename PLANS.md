# PLANS.md

This file is a lightweight roadmap for the next meaningful work in Perth Gig Finder.

This is not a backlog dump. Keep only active priorities here.
Keep it current. Remove stale items instead of letting this become a graveyard.
When work ships, remove it from this file or rewrite it to reflect the new next step.

## Now

### 1. Gig Detail Pages

Build `/gigs/[slug]` as the first real destination page beyond the homepage.

Outcome:
- shipped, shareable gig pages with clear internal linking from the homepage

Goals:
- stable, shareable URLs for gigs
- better SEO than homepage-only discovery
- room for richer event context than the homepage card can hold

Good first version:
- title
- hero/poster image
- start time
- venue name + suburb
- artist list
- source and ticket links
- short description
- “more gigs at this venue”
- “more gigs on this date”

### 2. Venue Pages

Build `/venues/[slug]` after gig detail pages.

Outcome:
- venue pages become a real browse surface, not just filter targets

Goals:
- give venues a canonical presence in the app
- improve browseability for people who shop by venue
- create stronger internal linking between homepage, gig pages, and venue pages

Good first version:
- venue name
- suburb
- website link if available
- upcoming gigs at that venue
- recent/related artists later if useful

## Next

### 3. Saved Alerts / Notifications

Let users subscribe to changes that matter to them.

Best first targets:
- venue alerts
- artist alerts
- date-range alerts later

Questions to settle before building:
- email only vs push/SMS later
- anonymous subscriptions vs accounts
- frequency: instant vs daily digest

### 4. Better Data Quality Signals

Improve confidence and clarity around listings.

Possible work:
- clearer source attribution on detail pages
- more visible cancelled/postponed handling
- better artist normalization
- venue alias cleanup
- stronger image/source fallback behavior where needed

### 5. Workflow Observability

The hosted refresh pipeline is healthy, but visibility can still improve.

Useful follow-ups:
- clearer scrape summaries by source
- easier visibility into image-backfill failures
- step timing summaries
- optional split between scrape and mirror jobs if maintenance needs it

## Later

### 6. Genre / Tag Browsing

The README goal mentions genre filtering, but the current product does not really expose it yet.

Later work could include:
- genre chips
- mood/scene tags
- browse pages for common gig types

### 7. Maps / Location-Aware Browsing

Useful once venue data is rich enough.

Potential scope:
- venue coordinates
- map view for gigs
- distance-aware browsing
- suburb clusters

### 8. Personalization / Recommendations

Only worth doing after the basic browse and detail experience is strong.

Possible future directions:
- “because you viewed”
- related gigs by venue, artist overlap, or date
- personalized homepage sections

## Operating Notes

- Prefer product work over more infra work unless something is actively painful.
- Use local dev as the main build loop.
- Use Git-connected Vercel previews to verify deployed behavior before shipping.
- Keep `main` clean and production-safe.
