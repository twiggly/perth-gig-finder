import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GigCardRecord } from "@/lib/gigs";

import { GigDiscoveryList } from "./gig-discovery-list";

function createGig(overrides: Partial<GigCardRecord> = {}): GigCardRecord {
  return {
    artist_names: ["Artist One", "Artist Two"],
    ends_at: null,
    id: "gig-1",
    image_height: null,
    image_path: null,
    image_version: null,
    image_width: null,
    slug: "example-gig",
    source_image_url: null,
    source_name: "Source",
    source_url: "https://example.com/gig",
    starts_at: "2026-07-20T11:00:00.000Z",
    status: "active",
    ticket_url: null,
    tixel_url: null,
    title: "Example Gig",
    venue_address: "1 Music Lane",
    venue_name: "Example Venue",
    venue_slug: "example-venue",
    venue_suburb: "Perth",
    venue_website_url: null,
    ...overrides
  };
}

describe("GigDiscoveryList", () => {
  it("server-renders crawlable event and venue links with status facts", () => {
    const html = renderToStaticMarkup(
      <GigDiscoveryList
        gigs={[createGig()]}
        now={new Date("2026-07-21T00:00:00.000Z")}
      />
    );

    expect(html).toContain('href="/gigs/example-gig"');
    expect(html).toContain('href="/venues/example-venue"');
    expect(html).toContain("Artist One | Artist Two");
    expect(html).toContain("Past event");
  });
});
