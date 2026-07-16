import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAvailableGigDates,
  getAdjacentGigImagePreloadUrls,
  getGigImageUrl,
  getGigImagePreloadUrls,
  getRenderableGigImage,
  getRenderableGigImageUrl,
  type HomepageDateAvailabilityRecord,
  type GigCardRecord
} from "./gigs";

afterEach(() => {
  vi.unstubAllEnvs();
});

function createGig(
  id: string,
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id,
    slug: `gig-${id}`,
    title: `Gig ${id}`,
    starts_at: "2026-04-13T12:00:00.000Z",
    ends_at: null,
    artist_names: [],
    image_path: null,
    source_image_url: `https://images.example.com/${id}.jpg`,
    image_width: 600,
    image_height: 900,
    image_version: null,
    ticket_url: null,
    tixel_url: null,
    source_url: "https://source.example.com/gig",
    source_name: "Source",
    venue_slug: "venue",
    venue_name: "Venue",
    venue_suburb: null,
    venue_address: null,
    venue_website_url: null,
    status: "active",
    ...overrides
  };
}

function createAvailabilityRecord(
  id: string,
  overrides: Partial<HomepageDateAvailabilityRecord> = {}
): HomepageDateAvailabilityRecord {
  return {
    id,
    title: `Gig ${id}`,
    starts_at: "2026-04-13T12:00:00.000Z",
    artist_names: [],
    venue_slug: "the-bird",
    venue_name: "The Bird",
    venue_suburb: "Northbridge",
    status: "active",
    ...overrides
  };
}

describe("available gig date helpers", () => {
  it("groups matching records into unique Perth date summaries", () => {
    expect(
      buildAvailableGigDates(
        [
          createAvailabilityRecord("1", {
            starts_at: "2026-04-13T12:00:00.000Z"
          }),
          createAvailabilityRecord("2", {
            starts_at: "2026-04-13T14:00:00.000Z"
          }),
          createAvailabilityRecord("3", {
            starts_at: "2026-04-14T12:00:00.000Z"
          })
        ],
        {
          date: "",
          legacyWhen: null,
          q: "",
          venueSlugs: []
        }
      )
    ).toEqual([
      {
        dateKey: "2026-04-13",
        heading: "Mon, Apr 13th"
      },
      {
        dateKey: "2026-04-14",
        heading: "Tue, Apr 14th"
      }
    ]);
  });

  it("filters availability records by venue and search query", () => {
    expect(
      buildAvailableGigDates(
        [
          createAvailabilityRecord("the-bird-match", {
            artist_names: ["AJ Hix Rhythm Six"],
            title: "Tuesday Night",
            venue_slug: "the-bird"
          }),
          createAvailabilityRecord("wrong-venue", {
            artist_names: ["AJ Hix Rhythm Six"],
            title: "Tuesday Night",
            venue_slug: "milk-bar",
            venue_name: "Milk Bar"
          }),
          createAvailabilityRecord("wrong-query", {
            artist_names: ["Someone Else"],
            title: "Tuesday Night",
            venue_slug: "the-bird"
          })
        ],
        {
          date: "",
          legacyWhen: null,
          q: "AJ Hix",
          venueSlugs: ["the-bird"]
        }
      )
    ).toEqual([
      {
        dateKey: "2026-04-13",
        heading: "Mon, Apr 13th"
      }
    ]);
  });
});

describe("gig image preload helpers", () => {
  it("omits timestamp cache-busters from content-addressed image paths", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
    const sha256 =
      "b2e1e2833bd5c8d4f9297f29b8695b5fdd2907c69376710118ad66a6260c5a50";

    expect(
      getGigImageUrl(
        createGig("content-addressed", {
          image_path: `sha256/b2/${sha256}.webp`,
          image_version: "20260710120000.000",
          source_image_url: null
        })
      )
    ).toBe(
      `https://project.supabase.co/storage/v1/object/public/gig-images/sha256/b2/${sha256}.webp`
    );
  });

  it("keeps timestamp cache-busters on legacy mirrored image paths", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(
      getGigImageUrl(
        createGig("legacy-mirror", {
          image_path:
            "oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png",
          image_version: "20260710120000.000",
          source_image_url: null
        })
      )
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/gig-images/oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png?v=20260710120000.000"
    );
  });

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

  it("uses The Bird placeholder when a Bird gig has no renderable image", () => {
    expect(
      getRenderableGigImage(
        createGig("bird-placeholder", {
          image_height: null,
          image_width: null,
          source_image_url: null,
          venue_slug: "the-bird"
        })
      )
    ).toEqual({
      height: 940,
      isPlaceholder: true,
      url: "/venue-placeholders/the-bird.png",
      width: 1674
    });
    expect(
      getRenderableGigImageUrl(
        createGig("bird-placeholder-url", {
          image_height: null,
          image_width: null,
          source_image_url: null,
          venue_slug: "the-bird"
        })
      )
    ).toBe("/venue-placeholders/the-bird.png");
  });

  it("keeps real images ahead of The Bird placeholder", () => {
    expect(
      getRenderableGigImage(
        createGig("bird-real", {
          image_height: 900,
          image_width: 600,
          source_image_url: "https://images.example.com/bird-real.jpg",
          venue_slug: "the-bird"
        })
      )
    ).toEqual({
      height: 900,
      isPlaceholder: false,
      url: "https://images.example.com/bird-real.jpg",
      width: 600
    });
  });

  it("does not use a placeholder for non-Bird gigs with no image", () => {
    expect(
      getRenderableGigImage(
        createGig("no-image", {
          image_height: null,
          image_width: null,
          source_image_url: null,
          venue_slug: "milk-bar",
          venue_name: "Milk Bar"
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

  it("de-dupes The Bird placeholder in preload urls", () => {
    const gigs = [
      createGig("bird-placeholder-a", {
        image_height: null,
        image_width: null,
        source_image_url: null,
        venue_slug: "the-bird"
      }),
      createGig("bird-placeholder-b", {
        image_height: null,
        image_width: null,
        source_image_url: null,
        venue_slug: "the-bird"
      }),
      createGig("other-image")
    ];

    expect(getGigImagePreloadUrls(gigs, 5)).toEqual([
      "/venue-placeholders/the-bird.png",
      "https://images.example.com/other-image.jpg"
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
