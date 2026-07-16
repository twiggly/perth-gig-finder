import { describe, expect, it } from "vitest";

import {
  getPerthDateKey,
  normalizeTixelEventUrl,
  parseTixelDiscoveryPage,
  parseTixelEventDetail
} from "../tixel-enrichment/parser";

const EVENT_URL =
  "https://tixel.com/au/music-tickets/2026/07/18/ninajirachi-the-rechabite-perth";

function buildEventHtml(overrides: Record<string, unknown> = {}): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: "AU",
        addressLocality: "Perth"
      },
      name: "The Rechabite"
    },
    name: "Ninajirachi",
    startDate: "2026-07-18T20:00:00+08:00",
    url: EVENT_URL,
    ...overrides
  })}</script></head></html>`;
}

describe("Tixel discovery parsing", () => {
  it("extracts direct event cards and advertised pagination", () => {
    const page = parseTixelDiscoveryPage(`
      <div data-e2e="music/:event">
        <a href="/au/music-tickets/2026/07/18/ninajirachi-the-rechabite-perth">
          <div><p><strong>Ninajirachi</strong></p><p>The Rechabite</p></div>
        </a>
      </div>
      <a href="/au/discover/Perth/music-tickets?page=2">2</a>
      <a href="/au/discover/Perth/music-tickets?page=10">10</a>
    `);

    expect(page).toEqual({
      cards: [
        {
          dateKey: "2026-07-18",
          title: "Ninajirachi",
          url: EVENT_URL,
          venueName: "The Rechabite"
        }
      ],
      maxPage: 10
    });
  });

  it("ignores malformed, off-domain, and tracking event URLs", () => {
    expect(
      parseTixelDiscoveryPage(`
        <div data-e2e="music/:event"><a href="https://example.com/au/music-tickets/2026/07/18/show"><p><strong>Wrong host</strong></p><p>Venue</p></a></div>
        <div data-e2e="music/:event"><a href="/au/music-tickets/2026/07/18/show?ref=tracking"><p><strong>Tracking</strong></p><p>Venue</p></a></div>
        <div data-e2e="music/:event"><a href="/au/music-tickets/2026/02/30/show"><p><strong>Bad date</strong></p><p>Venue</p></a></div>
      `).cards
    ).toEqual([]);
  });
});

describe("Tixel event parsing", () => {
  it("extracts verified MusicEvent metadata", () => {
    expect(parseTixelEventDetail(buildEventHtml(), EVENT_URL)).toEqual({
      dateKey: "2026-07-18",
      startsAt: "2026-07-18T12:00:00.000Z",
      title: "Ninajirachi",
      url: EVENT_URL,
      venueName: "The Rechabite"
    });
  });

  it("rejects malformed metadata, foreign events, and canonical URL mismatches", () => {
    expect(parseTixelEventDetail("<html></html>", EVENT_URL)).toBeNull();
    expect(
      parseTixelEventDetail(
        buildEventHtml({
          location: {
            address: { addressCountry: "US" },
            name: "The Rechabite"
          }
        }),
        EVENT_URL
      )
    ).toBeNull();
    expect(
      parseTixelEventDetail(
        buildEventHtml({
          url: "https://tixel.com/au/music-tickets/2026/07/18/different-event"
        }),
        EVENT_URL
      )
    ).toBeNull();
  });
});

describe("Tixel URL and date normalization", () => {
  it("accepts only direct query-free Tixel event URLs", () => {
    expect(normalizeTixelEventUrl(EVENT_URL)).toEqual({
      dateKey: "2026-07-18",
      url: EVENT_URL
    });
    expect(normalizeTixelEventUrl(`${EVENT_URL}?ref=tracking`)).toBeNull();
    expect(normalizeTixelEventUrl(EVENT_URL.replace("tixel.com", "www.tixel.com"))).toBeNull();
    expect(normalizeTixelEventUrl("javascript:alert(1)")).toBeNull();
  });

  it("derives Perth dates from absolute timestamps", () => {
    expect(getPerthDateKey("2026-07-17T18:30:00.000Z")).toBe("2026-07-18");
    expect(getPerthDateKey("invalid")).toBeNull();
  });
});
