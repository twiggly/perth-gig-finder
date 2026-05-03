import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
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
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    const titleIndex = html.indexOf("gig-card__title");
    const timeIndex = html.indexOf("gig-card__time");
    const artistsIndex = html.indexOf("Melānija | Esper | softwarebodyIV");
    const venueIndex = html.indexOf("The Bird, Northbridge");

    expect(html).toContain("ALT//THURSDAYS");
    expect(html).toContain("gig-card__artists");
    expect(html).toContain("gig-card__venue-icon");
    expect(timeIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(timeIndex).toBeLessThan(titleIndex);
    expect(artistsIndex).toBeGreaterThan(titleIndex);
    expect(venueIndex).toBeGreaterThan(artistsIndex);
  });

  it("omits the artist line when it only repeats the title", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            title: "Luude",
            artist_names: [" luude ", "LUUDE"]
          })}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).not.toContain("gig-card__artists");
  });

  it("renders actionable cards with a separate row toggle control", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain("gig-card__toggle-overlay");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open links for ALT//THURSDAYS"');
  });

  it("renders open action links inside the gig text column", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    const contentIndex = html.indexOf("gig-card__content");
    const venueIndex = html.indexOf("The Bird, Northbridge");
    const popoverIndex = html.indexOf("gig-card__popover");
    const firstActionIndex = html.indexOf("Buy tickets");

    expect(contentIndex).toBeGreaterThanOrEqual(0);
    expect(venueIndex).toBeGreaterThan(contentIndex);
    expect(popoverIndex).toBeGreaterThan(venueIndex);
    expect(firstActionIndex).toBeGreaterThan(popoverIndex);
  });

  it("exposes the action count for one-action cards", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({ venue_website_url: null })}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain('data-action-count="1"');
    expect(html).toContain("Buy tickets");
    expect(html).not.toContain("View listing @");
  });

  it("exposes the action count for two-action cards", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain('data-action-count="2"');
    expect(html).toContain("Buy tickets");
    expect(html).toContain("View listing @ The Bird");
  });
});
