import { describe, expect, it, vi } from "vitest";

import { enrichTixelLinks } from "../tixel-enrichment";
import type {
  TixelEnrichmentGig,
  TixelEnrichmentStore,
  TixelUrlChange
} from "../tixel-enrichment/types";

const NINA_URL =
  "https://tixel.com/au/music-tickets/2026/07/18/ninajirachi-the-rechabite-perth";
const OTHER_URL =
  "https://tixel.com/au/music-tickets/2026/07/19/unrelated-event";

class MemoryTixelStore implements TixelEnrichmentStore {
  readonly appliedChanges: TixelUrlChange[][] = [];

  constructor(readonly gigs: TixelEnrichmentGig[]) {}

  async listUpcomingPublicGigs(): Promise<TixelEnrichmentGig[]> {
    return this.gigs;
  }

  async applyTixelUrlChanges(changes: TixelUrlChange[]): Promise<void> {
    this.appliedChanges.push(changes);
  }
}

function createGig(
  id: string,
  overrides: Partial<TixelEnrichmentGig> = {}
): TixelEnrichmentGig {
  return {
    id,
    startsAt: "2026-07-18T12:00:00.000Z",
    title: "Ninajirachi",
    tixelUrl: null,
    venueName: "The Rechabite",
    venueSlug: "the-rechabite",
    ...overrides
  };
}

function discoveryHtml(input: {
  eventUrl: string;
  maxPage?: number;
  title: string;
  venue: string;
}): string {
  const pagination = input.maxPage
    ? `<a href="/au/discover/Perth/music-tickets?page=${input.maxPage}">${input.maxPage}</a>`
    : "";
  return `
    <div data-e2e="music/:event">
      <a href="${input.eventUrl}">
        <div><p><strong>${input.title}</strong></p><p>${input.venue}</p></div>
      </a>
    </div>
    ${pagination}
  `;
}

function eventHtml(input: {
  eventUrl: string;
  startsAt?: string;
  title: string;
  venue: string;
}): string {
  return `<script type="application/ld+json">${JSON.stringify({
    "@type": "MusicEvent",
    location: {
      address: { addressCountry: "AU", addressLocality: "Perth" },
      name: input.venue
    },
    name: input.title,
    startDate: input.startsAt ?? "2026-07-18T20:00:00+08:00",
    url: input.eventUrl
  })}</script>`;
}

describe("Tixel enrichment", () => {
  it("matches verified pages without importing unrelated discovery events", async () => {
    const store = new MemoryTixelStore([
      createGig("ninajirachi"),
      createGig("local-only", {
        startsAt: "2026-07-19T11:00:00.000Z",
        title: "Local Only",
        venueName: "The Bird",
        venueSlug: "the-bird"
      })
    ]);
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.endsWith("music-tickets")) {
        return {
          html: discoveryHtml({
            eventUrl: NINA_URL,
            maxPage: 2,
            title: "Ninajirachi",
            venue: "The Rechabite"
          }),
          status: "ok" as const,
          url
        };
      }

      if (url.endsWith("?page=2")) {
        return {
          html: discoveryHtml({
            eventUrl: OTHER_URL,
            title: "Unrelated Event",
            venue: "Different Venue"
          }),
          status: "ok" as const,
          url
        };
      }

      if (url === NINA_URL) {
        return {
          html: eventHtml({
            eventUrl: NINA_URL,
            title: "Ninajirachi",
            venue: "The Rechabite"
          }),
          status: "ok" as const,
          url
        };
      }

      throw new Error(`Unexpected test URL: ${url}`);
    });

    await expect(
      enrichTixelLinks(store, {
        detailConcurrency: 1,
        fetchHtml,
        now: new Date("2026-07-16T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ambiguous: 0,
      cleared: 0,
      discovered: 2,
      failed: 0,
      matched: 1,
      unchanged: 0,
      updated: 1,
      verified: 1
    });
    expect(store.appliedChanges).toEqual([
      [{ gigId: "ninajirachi", tixelUrl: NINA_URL }]
    ]);
    expect(fetchHtml).not.toHaveBeenCalledWith(OTHER_URL);
  });

  it("aborts without writes when discovery pagination is incomplete", async () => {
    const store = new MemoryTixelStore([createGig("ninajirachi")]);

    await expect(
      enrichTixelLinks(store, {
        fetchHtml: async (url) =>
          url.endsWith("music-tickets")
            ? {
                html: discoveryHtml({
                  eventUrl: NINA_URL,
                  maxPage: 2,
                  title: "Ninajirachi",
                  venue: "The Rechabite"
                }),
                status: "ok",
                url
              }
            : { status: "missing" },
        now: new Date("2026-07-16T00:00:00.000Z")
      })
    ).rejects.toThrow("page 2 was unavailable");
    expect(store.appliedChanges).toEqual([]);
  });

  it("clears confirmed missing links but preserves links on transient failures", async () => {
    const missingUrl =
      "https://tixel.com/au/music-tickets/2026/07/18/missing-event";
    const transientUrl =
      "https://tixel.com/au/music-tickets/2026/07/18/transient-event";
    const store = new MemoryTixelStore([
      createGig("missing", { tixelUrl: missingUrl }),
      createGig("transient", { tixelUrl: transientUrl })
    ]);

    const summary = await enrichTixelLinks(store, {
      detailConcurrency: 1,
      fetchHtml: async (url) => {
        if (url.endsWith("music-tickets")) {
          return {
            html: discoveryHtml({
              eventUrl: OTHER_URL,
              title: "Unrelated Event",
              venue: "Different Venue"
            }),
            status: "ok",
            url
          };
        }

        if (url === missingUrl) {
          return { status: "missing" };
        }

        throw new Error("temporary upstream failure");
      },
      now: new Date("2026-07-16T00:00:00.000Z")
    });

    expect(summary).toMatchObject({ cleared: 1, failed: 1, updated: 0 });
    expect(store.appliedChanges).toEqual([
      [{ gigId: "missing", tixelUrl: null }]
    ]);
  });

  it("clears a successfully parsed link that no longer matches its gig", async () => {
    const store = new MemoryTixelStore([
      createGig("changed", { tixelUrl: NINA_URL })
    ]);

    const summary = await enrichTixelLinks(store, {
      fetchHtml: async (url) => ({
        html: url.endsWith("music-tickets")
          ? discoveryHtml({
              eventUrl: NINA_URL,
              title: "Ninajirachi",
              venue: "The Rechabite"
            })
          : eventHtml({
              eventUrl: NINA_URL,
              title: "Different Event",
              venue: "Different Venue"
            }),
        status: "ok",
        url
      }),
      now: new Date("2026-07-16T00:00:00.000Z")
    });

    expect(summary.cleared).toBe(1);
    expect(store.appliedChanges).toEqual([
      [{ gigId: "changed", tixelUrl: null }]
    ]);
  });
});
