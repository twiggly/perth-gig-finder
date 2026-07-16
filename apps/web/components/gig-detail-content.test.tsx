import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
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
    tixel_url: null,
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

function renderGigDetail(gig: GigCardRecord): string {
  return renderToStaticMarkup(
    <ImageConfigContext.Provider
      value={{ ...imageConfigDefault, qualities: [72] }}
    >
      <GigDetailContent gig={gig} />
    </ImageConfigContext.Provider>
  );
}

describe("GigDetailContent", () => {
  it("renders gig details, venue address, poster, and actions", () => {
    const html = renderGigDetail(createGig());

    expect(html).toContain("gig-detail");
    expect(html).toContain("gig-detail__panel--with-media");
    expect(html.indexOf("gig-detail__toolbar")).toBeGreaterThan(
      html.indexOf("gig-detail__panel")
    );
    expect(html).toContain('href="/?date=2026-04-23"');
    expect(html).toContain('aria-label="Back to gigs"');
    expect(html).toContain("gig-detail__toolbar-icon");
    expect(html).toContain('stroke-width="2.6"');
    expect(html).toContain(">Back</span>");
    expect(html).toContain("gig-detail__toolbar");
    expect(html).toContain('aria-label="Share gig"');
    expect(html).toContain(">Share</span>");
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
    expect(html).toContain('sizes="(max-width: 720px) 93vw, 14rem"');
    expect(html).toContain('<link rel="preload" as="image"');
    expect(html).toContain("q=72");
    expect(html).not.toContain("q=75");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });

  it("renders no-poster gigs in the no-media panel variant", () => {
    const html = renderGigDetail(
      createGig({
        image_height: null,
        image_width: null,
        source_image_url: null,
        venue_name: "Milk Bar",
        venue_slug: "milk-bar"
      })
    );

    expect(html).toContain("gig-detail__panel--no-media");
    expect(html).not.toContain("gig-detail__media");
    expect(html).not.toContain("Gig Radar listing");
    expect(html).toContain("ALT//THURSDAYS");
    expect(html).toContain("gig-detail__venue-icon");
    expect(html).toContain("<p>Milk Bar,</p>");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ Milk Bar");
  });

  it("renders a verified Tixel link between ticket and venue actions", () => {
    const html = renderGigDetail(
      createGig({
        tixel_url:
          "https://tixel.com/au/music-tickets/2026/04/23/alt-thursdays-the-bird-perth"
      })
    );

    expect(html).toContain("Tickets @ tixel");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html.indexOf("Buy tickets")).toBeLessThan(
      html.indexOf("Tickets @ tixel")
    );
    expect(html.indexOf("Tickets @ tixel")).toBeLessThan(
      html.indexOf("Listing @ The Bird")
    );
  });

  it("renders The Bird placeholder for image-less Bird gigs", () => {
    const html = renderGigDetail(
      createGig({
        image_height: null,
        image_width: null,
        source_image_url: null,
        venue_slug: "the-bird"
      })
    );

    expect(html).toContain("gig-detail__panel--with-media");
    expect(html).toContain("gig-detail__image");
    expect(html).toContain("%2Fvenue-placeholders%2Fthe-bird.png");
    expect(html).toContain('width="1674"');
    expect(html).toContain('height="940"');
  });

  it("keeps the venue suburb on the same line when no address exists", () => {
    const html = renderGigDetail(
      createGig({
        venue_address: null
      })
    );

    expect(html).toContain("The Bird, Northbridge");
  });

  it("removes a leading premise label from display addresses", () => {
    const html = renderGigDetail(
      createGig({
        venue_name: "Four5Nine Bar @ Rosemount",
        venue_slug: "four5nine-bar-rosemount",
        venue_suburb: "North Perth",
        venue_address: "Rosemount Hotel, 459 Fitzgerald St"
      })
    );

    expect(html).toContain("<p>Four5Nine Bar @ Rosemount,</p>");
    expect(html).toContain("<p>459 Fitzgerald St, North Perth</p>");
    expect(html).not.toContain("Rosemount Hotel, 459 Fitzgerald St");
  });

  it("removes trailing Australia and collapses duplicate venue-name addresses", () => {
    const html = renderGigDetail(
      createGig({
        venue_name: "20 Thorogood St",
        venue_slug: "20-thorogood-st",
        venue_suburb: "Burswood",
        venue_address: "20 Thorogood St, Burswood WA 6100, Australia"
      })
    );

    expect(html).toContain("<p>20 Thorogood St, Burswood WA 6100</p>");
    expect(html).not.toContain("<p>20 Thorogood St,</p>");
    expect(html).not.toContain("Australia");
  });

  it("omits unavailable optional detail fields", () => {
    const html = renderGigDetail(
      createGig({
        artist_names: [],
        image_height: null,
        image_width: null,
        source_image_url: null,
        ticket_url: null,
        venue_name: "Milk Bar",
        venue_slug: "milk-bar",
        venue_address: null,
        venue_website_url: null
      })
    );

    expect(html).toContain("gig-detail__panel--no-media");
    expect(html).not.toContain("gig-detail__media");
    expect(html).not.toContain("gig-detail__artists");
    expect(html).not.toContain("gig-detail__actions");
    expect(html).not.toContain("181 William Street");
  });
});
