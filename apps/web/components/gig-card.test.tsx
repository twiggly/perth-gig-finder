import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GigCardRecord } from "@/lib/gigs";

import { GigCard } from "./gig-card";

function createGig(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id: "gig-1",
    slug: "gig-1",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-23T10:30:00.000Z",
    artist_names: ["Melānija", "Esper", "softwarebodyIV"],
    image_path: null,
    source_image_url: null,
    image_width: null,
    image_height: null,
    image_version: null,
    ticket_url: "https://tickets.example.com",
    source_url: "https://source.example.com/gig-1",
    source_name: "The Bird",
    venue_slug: "the-bird",
    venue_name: "The Bird",
    venue_suburb: "Northbridge",
    venue_website_url: "https://www.williamstreetbird.com/",
    status: "active",
    ...overrides
  };
}

describe("GigCard", () => {
  it("renders the artist line between the title and venue when artists are present", () => {
    const html = renderToStaticMarkup(
      <GigCard
        gig={createGig()}
        isOpen={false}
        onClose={() => {}}
        onToggle={() => {}}
      />
    );

    const titleIndex = html.indexOf("ALT//THURSDAYS");
    const artistsIndex = html.indexOf("Melānija, Esper, softwarebodyIV");
    const venueIndex = html.indexOf("The Bird, Northbridge");

    expect(html).toContain("gig-card__artists");
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(artistsIndex).toBeGreaterThan(titleIndex);
    expect(venueIndex).toBeGreaterThan(artistsIndex);
  });

  it("omits the artist line when it only repeats the title", () => {
    const html = renderToStaticMarkup(
      <GigCard
        gig={createGig({
          title: "Luude",
          artist_names: [" luude ", "LUUDE"]
        })}
        isOpen={false}
        onClose={() => {}}
        onToggle={() => {}}
      />
    );

    expect(html).not.toContain("gig-card__artists");
  });
});
