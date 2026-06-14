import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { GigCardRecord } from "@/lib/gigs";

import { GigDetailContent } from "./gig-detail-content";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn()
  })
}));

function createGig(overrides: Partial<GigCardRecord> = {}): GigCardRecord {
  return {
    id: "gig-1",
    slug: "alt-thursdays",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-23T10:30:00.000Z",
    ends_at: null,
    artist_names: ["Melanija", "Esper"],
    image_path: null,
    source_image_url: "https://images.example.com/alt.jpg",
    image_width: 600,
    image_height: 900,
    image_version: null,
    ticket_url: "https://tickets.example.com/alt",
    source_url: "https://www.williamstreetbird.com/events/alt",
    source_name: "The Bird",
    venue_slug: "the-bird",
    venue_name: "The Bird",
    venue_suburb: "Northbridge",
    venue_address: "181 William Street, Northbridge WA 6003",
    venue_website_url: "https://www.williamstreetbird.com/",
    status: "active",
    ...overrides
  };
}

describe("GigDetailContent", () => {
  it("renders gig details, venue address, poster, and actions", () => {
    const html = renderToStaticMarkup(<GigDetailContent gig={createGig()} />);

    expect(html).toContain("gig-detail");
    expect(html).toContain("gig-detail__panel--with-media");
    expect(html.indexOf("gig-detail__toolbar")).toBeGreaterThan(
      html.indexOf("gig-detail__panel")
    );
    expect(html).toContain('href="/?date=2026-04-23"');
    expect(html).toContain('aria-label="Back to gigs"');
    expect(html).toContain("←");
    expect(html).toContain("gig-detail__toolbar");
    expect(html).toContain('aria-label="Share gig"');
    expect(html).toContain(
      "https://gigradar.com.au/gigs/alt-thursdays"
    );
    expect(html).not.toContain("Back to gigs</a>");
    expect(html).not.toContain("Gig Radar listing");
    expect(html).toContain("ALT//THURSDAYS");
    expect(html).toContain("Melanija | Esper");
    expect(html).toContain("gig-detail__venue-icon");
    expect(html).toContain("<p>The Bird,</p>");
    expect(html).toContain("181 William Street, Northbridge WA 6003");
    expect(html).toContain("gig-detail__image");
    expect(html).toContain("https%3A%2F%2Fimages.example.com%2Falt.jpg");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });

  it("renders no-poster gigs in the no-media panel variant", () => {
    const html = renderToStaticMarkup(
      <GigDetailContent
        gig={createGig({
          image_height: null,
          image_width: null,
          source_image_url: null
        })}
      />
    );

    expect(html).toContain("gig-detail__panel--no-media");
    expect(html).not.toContain("gig-detail__media");
    expect(html).not.toContain("Gig Radar listing");
    expect(html).toContain("ALT//THURSDAYS");
    expect(html).toContain("gig-detail__venue-icon");
    expect(html).toContain("<p>The Bird,</p>");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });

  it("keeps the venue suburb on the same line when no address exists", () => {
    const html = renderToStaticMarkup(
      <GigDetailContent
        gig={createGig({
          venue_address: null
        })}
      />
    );

    expect(html).toContain("The Bird, Northbridge");
  });

  it("removes a leading premise label from display addresses", () => {
    const html = renderToStaticMarkup(
      <GigDetailContent
        gig={createGig({
          venue_name: "Four5Nine Bar @ Rosemount",
          venue_slug: "four5nine-bar-rosemount",
          venue_suburb: "North Perth",
          venue_address: "Rosemount Hotel, 459 Fitzgerald St"
        })}
      />
    );

    expect(html).toContain("<p>Four5Nine Bar @ Rosemount,</p>");
    expect(html).toContain("<p>459 Fitzgerald St, North Perth</p>");
    expect(html).not.toContain("Rosemount Hotel, 459 Fitzgerald St");
  });

  it("removes trailing Australia and collapses duplicate venue-name addresses", () => {
    const html = renderToStaticMarkup(
      <GigDetailContent
        gig={createGig({
          venue_name: "20 Thorogood St",
          venue_slug: "20-thorogood-st",
          venue_suburb: "Burswood",
          venue_address: "20 Thorogood St, Burswood WA 6100, Australia"
        })}
      />
    );

    expect(html).toContain("<p>20 Thorogood St, Burswood WA 6100</p>");
    expect(html).not.toContain("<p>20 Thorogood St,</p>");
    expect(html).not.toContain("Australia");
  });

  it("omits unavailable optional detail fields", () => {
    const html = renderToStaticMarkup(
      <GigDetailContent
        gig={createGig({
          artist_names: [],
          image_height: null,
          image_width: null,
          source_image_url: null,
          ticket_url: null,
          venue_address: null,
          venue_website_url: null
        })}
      />
    );

    expect(html).toContain("gig-detail__panel--no-media");
    expect(html).not.toContain("gig-detail__media");
    expect(html).not.toContain("gig-detail__artists");
    expect(html).not.toContain("gig-detail__actions");
    expect(html).not.toContain("181 William Street");
  });
});
