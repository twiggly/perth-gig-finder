import { describe, expect, it } from "vitest";

import { planGigArtistWrites } from "../supabase-store";

describe("supabase store artist sync planning", () => {
  it("skips canonical artist rewrites when the public artist list is unchanged", () => {
    const writePlan = planGigArtistWrites({
      gigIds: ["gig-1"],
      candidatesByGigId: new Map([
        [
          "gig-1",
          [
            {
              artists: ["Stereolab", "Mick Harvey & Amanda Acevedo"],
              artistExtractionKind: "structured",
              priority: 10,
              lastSeenAt: "2026-04-24T04:46:00.000Z"
            }
          ]
        ]
      ]),
      currentArtistNamesByGigId: new Map([
        ["gig-1", [" Stereolab ", "Mick Harvey & Amanda Acevedo"]]
      ])
    });

    expect(writePlan).toEqual([]);
  });

  it("plans only changed canonical artist writes", () => {
    const writePlan = planGigArtistWrites({
      gigIds: ["gig-1", "gig-2", "gig-2"],
      candidatesByGigId: new Map([
        [
          "gig-1",
          [
            {
              artists: ["Lindsay Wells"],
              artistExtractionKind: "parsed_text",
              priority: 10,
              lastSeenAt: "2026-04-24T04:46:00.000Z"
            }
          ]
        ],
        [
          "gig-2",
          [
            {
              artists: ["Sienna Skies", "Saving Face"],
              artistExtractionKind: "structured",
              priority: 10,
              lastSeenAt: "2026-04-24T04:46:00.000Z"
            }
          ]
        ]
      ]),
      currentArtistNamesByGigId: new Map([
        ["gig-1", ["a special guest to be announced", "Jimi Hendrix"]],
        ["gig-2", ["Sienna Skies", "Saving Face"]]
      ])
    });

    expect(writePlan).toEqual([
      {
        gigId: "gig-1",
        artistNames: ["Lindsay Wells"]
      }
    ]);
  });

  it("plans a clear when every attached source has unknown artists", () => {
    const writePlan = planGigArtistWrites({
      gigIds: ["gig-1"],
      candidatesByGigId: new Map([
        [
          "gig-1",
          [
            {
              artists: [],
              artistExtractionKind: "unknown",
              priority: 100,
              lastSeenAt: "2026-04-24T04:46:00.000Z"
            }
          ]
        ]
      ]),
      currentArtistNamesByGigId: new Map([["gig-1", ["Title Shaped Fallback"]]])
    });

    expect(writePlan).toEqual([
      {
        gigId: "gig-1",
        artistNames: []
      }
    ]);
  });
});
