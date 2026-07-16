import { describe, expect, it } from "vitest";

import {
  isTixelEventMatch,
  matchTixelEvents
} from "../tixel-enrichment/matcher";
import type {
  TixelEnrichmentGig,
  TixelEventDetail
} from "../tixel-enrichment/types";

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

function createEvent(
  slug: string,
  overrides: Partial<TixelEventDetail> = {}
): TixelEventDetail {
  return {
    dateKey: "2026-07-18",
    startsAt: "2026-07-18T12:00:00.000Z",
    title: "Ninajirachi",
    url: `https://tixel.com/au/music-tickets/2026/07/18/${slug}`,
    venueName: "The Rechabite",
    ...overrides
  };
}

describe("Tixel event matching", () => {
  it("accepts exact title and venue when source time is imprecise", () => {
    expect(
      isTixelEventMatch(
        createGig("gig", { startsAt: "2026-07-18T10:00:00.000Z" }),
        createEvent("ninajirachi")
      )
    ).toBe(true);
  });

  it("accepts exact title and time when venue spelling differs", () => {
    expect(
      isTixelEventMatch(
        createGig("gig", { venueName: "Magnet House", venueSlug: "magnet-house" }),
        createEvent("ninajirachi", { venueName: "Magnet House Night Club" })
      )
    ).toBe(true);
  });

  it("uses shared venue aliases for canonical title matches", () => {
    expect(
      isTixelEventMatch(
        createGig("gig", {
          title: "Cosmic Jive! SOLD OUT",
          venueName: "The Court",
          venueSlug: "the-court"
        }),
        createEvent("cosmic-jive", {
          title: "Cosmic Jive",
          venueName: "The Court Hotel"
        })
      )
    ).toBe(true);
  });

  it("rejects different dates and weak canonical matches without corroboration", () => {
    expect(
      isTixelEventMatch(
        createGig("gig"),
        createEvent("other-date", { dateKey: "2026-07-19" })
      )
    ).toBe(false);
    expect(
      isTixelEventMatch(
        createGig("gig", { title: "Ninajirachi Live" }),
        createEvent("wrong", {
          startsAt: "2026-07-18T14:00:00.000Z",
          venueName: "Different Venue"
        })
      )
    ).toBe(false);
  });
});

describe("Tixel one-to-one planning", () => {
  it("matches a unique event and gig", () => {
    const event = createEvent("ninajirachi");
    const plan = matchTixelEvents([createGig("gig")], [event]);

    expect([...plan.matchesByGigId]).toEqual([["gig", event.url]]);
    expect(plan.ambiguousEventUrls.size).toBe(0);
  });

  it("leaves repeated same-day sessions ambiguous", () => {
    const early = createGig("early", { startsAt: "2026-07-18T10:00:00.000Z" });
    const late = createGig("late", { startsAt: "2026-07-18T13:00:00.000Z" });
    const event = createEvent("ninajirachi", {
      startsAt: "2026-07-18T11:30:00.000Z"
    });
    const plan = matchTixelEvents([early, late], [event]);

    expect(plan.matchesByGigId.size).toBe(0);
    expect(plan.ambiguousEventUrls).toEqual(new Set([event.url]));
  });

  it("uses exact start times to separate repeated same-day sessions", () => {
    const early = createGig("early", { startsAt: "2026-07-18T10:00:00.000Z" });
    const late = createGig("late", { startsAt: "2026-07-18T13:00:00.000Z" });
    const earlyEvent = createEvent("early", {
      startsAt: "2026-07-18T10:00:00.000Z"
    });
    const lateEvent = createEvent("late", {
      startsAt: "2026-07-18T13:00:00.000Z"
    });
    const plan = matchTixelEvents([early, late], [earlyEvent, lateEvent]);

    expect([...plan.matchesByGigId]).toEqual([
      ["early", earlyEvent.url],
      ["late", lateEvent.url]
    ]);
    expect(plan.ambiguousEventUrls.size).toBe(0);
  });

  it("does not assign two Tixel sessions to one gig", () => {
    const gig = createGig("gig");
    const first = createEvent("first");
    const second = createEvent("second");
    const plan = matchTixelEvents([gig], [first, second]);

    expect(plan.matchesByGigId.size).toBe(0);
    expect(plan.ambiguousEventUrls).toEqual(new Set([first.url, second.url]));
  });

  it("preserves an existing compatible link through later ambiguity", () => {
    const existing = createEvent("existing");
    const alternative = createEvent("alternative");
    const plan = matchTixelEvents(
      [createGig("gig", { tixelUrl: existing.url })],
      [existing, alternative]
    );

    expect([...plan.matchesByGigId]).toEqual([["gig", existing.url]]);
  });
});
