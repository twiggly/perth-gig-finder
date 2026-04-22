import { describe, expect, it } from "vitest";

import {
  createArtistExtraction,
  normalizeArtistNames,
  selectCanonicalArtistNames,
  unknownArtistExtraction
} from "../artist-utils";

describe("artist utils", () => {
  it("normalizes and dedupes artist names by slug", () => {
    expect(normalizeArtistNames([" DJ HMC ", "dj hmc", "Clare Perrott", ""])).toEqual([
      "DJ HMC",
      "Clare Perrott"
    ]);
  });

  it("strips decorative wrappers from artist names before deduping", () => {
    expect(
      normalizeArtistNames([
        "·· Georgina Dacheff ··",
        "\"Georgina Dacheff\"",
        " -- Savanah Solomon -- "
      ])
    ).toEqual(["Georgina Dacheff", "Savanah Solomon"]);
  });

  it("preserves meaningful internal punctuation in artist names", () => {
    expect(normalizeArtistNames(["P!NK", "alt-J", "AC/DC", "The Aquabats!"])).toEqual([
      "P!NK",
      "alt-J",
      "AC/DC",
      "The Aquabats!"
    ]);
  });

  it("returns unknown when extraction produces no usable artists", () => {
    expect(createArtistExtraction(["", "   "], "structured")).toEqual(
      unknownArtistExtraction()
    );
  });

  it("selects the best canonical artist set by kind, priority, count, and recency", () => {
    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Headline Artist"],
          artistExtractionKind: "explicit_lineup",
          priority: 100,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        },
        {
          artists: ["Structured Artist"],
          artistExtractionKind: "structured",
          priority: 10,
          lastSeenAt: "2026-04-21T08:00:00.000Z"
        }
      ])
    ).toEqual(["Structured Artist"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Low Priority Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["High Priority Artist"],
          artistExtractionKind: "parsed_text",
          priority: 50,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        }
      ])
    ).toEqual(["High Priority Artist"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Solo Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["Artist One", "Artist Two"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        }
      ])
    ).toEqual(["Artist One", "Artist Two"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Earlier Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        },
        {
          artists: ["Later Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        }
      ])
    ).toEqual(["Later Artist"]);
  });

  it("returns no canonical artists when every candidate is unknown or empty", () => {
    expect(
      selectCanonicalArtistNames([
        {
          artists: [],
          artistExtractionKind: "unknown",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["   "],
          artistExtractionKind: "parsed_text",
          priority: 50,
          lastSeenAt: "2026-04-21T11:00:00.000Z"
        }
      ])
    ).toEqual([]);
  });
});
