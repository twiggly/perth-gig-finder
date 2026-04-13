import { describe, expect, it } from "vitest";

import {
  getAdjacentGigImagePreloadUrls,
  getGigImagePreloadUrls,
  getRenderableGigImageUrl,
  type GigCardRecord
} from "./gigs";

function createGig(
  id: string,
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id,
    slug: `gig-${id}`,
    title: `Gig ${id}`,
    starts_at: "2026-04-13T12:00:00.000Z",
    artist_names: [],
    image_path: null,
    source_image_url: `https://images.example.com/${id}.jpg`,
    image_width: 600,
    image_height: 900,
    image_version: null,
    ticket_url: null,
    source_url: "https://source.example.com/gig",
    source_name: "Source",
    venue_slug: "venue",
    venue_name: "Venue",
    venue_suburb: null,
    venue_website_url: null,
    status: "active",
    ...overrides
  };
}

describe("gig image preload helpers", () => {
  it("returns a renderable image url only when card metadata is valid", () => {
    expect(getRenderableGigImageUrl(createGig("renderable"))).toBe(
      "https://images.example.com/renderable.jpg"
    );

    expect(
      getRenderableGigImageUrl(
        createGig("missing-width", {
          image_width: null
        })
      )
    ).toBeNull();
  });

  it("limits one day of preload urls and excludes invalid or duplicate images", () => {
    const gigs = [
      createGig("1"),
      createGig("2"),
      createGig("duplicate-a", {
        source_image_url: "https://images.example.com/shared.jpg"
      }),
      createGig("duplicate-b", {
        source_image_url: "https://images.example.com/shared.jpg"
      }),
      createGig("invalid", {
        image_height: null
      }),
      createGig("3"),
      createGig("4"),
      createGig("5")
    ];

    expect(getGigImagePreloadUrls(gigs, 5)).toEqual([
      "https://images.example.com/1.jpg",
      "https://images.example.com/2.jpg",
      "https://images.example.com/shared.jpg",
      "https://images.example.com/3.jpg",
      "https://images.example.com/4.jpg"
    ]);
  });

  it("collects preload urls from both adjacent days and de-dupes across them", () => {
    const dayMap = new Map([
      [
        "2026-04-12",
        {
          items: [
            createGig("prev-1"),
            createGig("prev-2"),
            createGig("shared-prev", {
              source_image_url: "https://images.example.com/shared.jpg"
            }),
            createGig("prev-invalid", {
              image_width: null
            }),
            createGig("prev-3"),
            createGig("prev-4"),
            createGig("prev-5")
          ]
        }
      ],
      [
        "2026-04-14",
        {
          items: [
            createGig("next-1"),
            createGig("shared-next", {
              source_image_url: "https://images.example.com/shared.jpg"
            }),
            createGig("next-2"),
            createGig("next-3"),
            createGig("next-4"),
            createGig("next-5")
          ]
        }
      ]
    ]);

    expect(
      getAdjacentGigImagePreloadUrls(dayMap, ["2026-04-12", "2026-04-14"], 5)
    ).toEqual([
      "https://images.example.com/prev-1.jpg",
      "https://images.example.com/prev-2.jpg",
      "https://images.example.com/shared.jpg",
      "https://images.example.com/prev-3.jpg",
      "https://images.example.com/prev-4.jpg",
      "https://images.example.com/next-1.jpg",
      "https://images.example.com/next-2.jpg",
      "https://images.example.com/next-3.jpg",
      "https://images.example.com/next-4.jpg",
      "https://images.example.com/next-5.jpg"
    ]);
  });
});
