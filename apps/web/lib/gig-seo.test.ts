import { describe, expect, it } from "vitest";

import type { GigCardRecord } from "./gigs";
import {
  buildGigEventStructuredData,
  buildGigEventStructuredDataJson,
  buildGigFactSummary,
  buildGigMetadata,
  buildGigMetadataDescription,
  formatPerthIsoWithOffset
} from "./gig-seo";
import {
  buildGigDetailPath,
  buildGigDetailUrl,
  SITE_URL
} from "./seo";

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
    source_url: "https://source.example.com/alt",
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

describe("gig SEO helpers", () => {
  it("builds canonical gig detail paths and URLs", () => {
    expect(buildGigDetailPath("alt-thursdays")).toBe("/gigs/alt-thursdays");
    expect(buildGigDetailUrl("alt-thursdays")).toBe(
      `${SITE_URL}/gigs/alt-thursdays`
    );
  });

  it("builds metadata with gig-specific title, description, and image fallback", () => {
    const gig = createGig({
      image_height: null,
      image_width: null,
      source_image_url: null,
      venue_name: "Milk Bar",
      venue_slug: "milk-bar"
    });

    expect(buildGigMetadataDescription(gig)).toContain(
      "ALT//THURSDAYS with Melanija | Esper at Milk Bar, Northbridge"
    );
    expect(buildGigMetadata(gig)).toMatchObject({
      alternates: {
        canonical: "/gigs/alt-thursdays"
      },
      openGraph: {
        images: [
          {
            url: "/logo.png"
          }
        ],
        title: "ALT//THURSDAYS | Gig Radar"
      },
      twitter: {
        card: "summary",
        images: ["/logo.png"]
      }
    });
  });

  it("uses The Bird placeholder for image-less Bird gig metadata", () => {
    const gig = createGig({
      image_height: null,
      image_width: null,
      source_image_url: null,
      venue_slug: "the-bird"
    });

    expect(buildGigMetadata(gig)).toMatchObject({
      openGraph: {
        images: [
          {
            height: 940,
            url: "/venue-placeholders/the-bird.png",
            width: 1674
          }
        ]
      },
      twitter: {
        images: ["/venue-placeholders/the-bird.png"]
      }
    });
  });

  it("formats Perth datetimes with the +08:00 offset for structured data", () => {
    expect(formatPerthIsoWithOffset("2026-04-23T10:30:00.000Z")).toBe(
      "2026-04-23T18:30:00+08:00"
    );
  });

  it("builds Event JSON-LD with address, performers, image, end date, and ticket offer", () => {
    const now = new Date("2026-04-01T00:00:00.000Z");
    const event = buildGigEventStructuredData(
      createGig({
        ends_at: "2026-04-23T13:00:00.000Z"
      }),
      now
    );

    expect(event).toMatchObject({
      "@context": "https://schema.org",
      "@id": `${SITE_URL}/gigs/alt-thursdays#event`,
      "@type": "MusicEvent",
      endDate: "2026-04-23T21:00:00+08:00",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      image: ["https://images.example.com/alt.jpg"],
      location: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressCountry: "AU",
          addressLocality: "Northbridge",
          addressRegion: "WA",
          streetAddress: "181 William Street, Northbridge WA 6003"
        },
        name: "The Bird"
      },
      offers: {
        "@type": "Offer",
        url: "https://tickets.example.com/alt"
      },
      performer: [
        {
          "@type": "MusicGroup",
          name: "Melanija"
        },
        {
          "@type": "MusicGroup",
          name: "Esper"
        }
      ],
      startDate: "2026-04-23T18:30:00+08:00",
      mainEntityOfPage: `${SITE_URL}/gigs/alt-thursdays`,
      url: `${SITE_URL}/gigs/alt-thursdays`
    });
    expect(event?.offers).not.toHaveProperty("availability");
  });

  it("omits placeholder images and optional offer data when fields are unavailable", () => {
    const event = buildGigEventStructuredData(
      createGig({
        artist_names: [],
        image_height: null,
        image_width: null,
        source_image_url: null,
        ticket_url: null,
        venue_name: "Milk Bar",
        venue_slug: "milk-bar"
      })
    );

    expect(event).not.toHaveProperty("image");
    expect(event).not.toHaveProperty("offers");
    expect(event).not.toHaveProperty("performer");
  });

  it("does not publish The Bird placeholder as an event poster", () => {
    const event = buildGigEventStructuredData(
      createGig({
        image_height: null,
        image_width: null,
        source_image_url: null,
        venue_slug: "the-bird"
      })
    );

    expect(event).not.toHaveProperty("image");
  });

  it("skips Event rich-result markup without a detailed venue address", () => {
    const gig = createGig({ venue_address: null });

    expect(buildGigEventStructuredData(gig)).toBeNull();
    expect(buildGigEventStructuredDataJson(gig)).toBeNull();
  });

  it("describes lifecycle status using facts and suppresses past offers", () => {
    const gig = createGig();
    const now = new Date("2026-04-24T00:00:00.000Z");

    expect(buildGigFactSummary(gig, now)).toContain(
      "Past event. ALT//THURSDAYS took place on"
    );
    expect(buildGigEventStructuredData(gig, now)).not.toHaveProperty("offers");
  });

  it("serializes gig Event JSON-LD safely for scraper-controlled strings", () => {
    const gig = createGig({
      artist_names: ["Safe\u2028Artist"],
      title: "Bad </script><script>alert('xss')</script>",
      venue_address: "1 Test Lane\u2029Northbridge",
      venue_name: "Venue < Name"
    });
    const serialized = buildGigEventStructuredDataJson(gig);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script");
    expect(serialized).toContain("\\u003c");
    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(JSON.parse(serialized)).toEqual(buildGigEventStructuredData(gig));
  });
});
