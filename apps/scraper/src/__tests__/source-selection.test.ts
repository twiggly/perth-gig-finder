import { describe, expect, it } from "vitest";

import { resolveSourcesToRun } from "../source-selection";
import { sources } from "../sources";

describe("resolveSourcesToRun", () => {
  it("returns all sources when no filters are provided", () => {
    const selected = resolveSourcesToRun({
      argv: [],
      env: {},
      availableSources: sources
    });

    expect(selected.map((source) => source.slug)).toEqual(
      sources.map((source) => source.slug)
    );
  });

  it("supports include filters from env and argv", () => {
    const selected = resolveSourcesToRun({
      argv: ["--source=ticketmaster-au"],
      env: {
        SCRAPER_SOURCE_SLUGS: "ticketek-wa"
      },
      availableSources: sources
    });

    expect(selected.map((source) => source.slug)).toEqual([
      "ticketek-wa",
      "ticketmaster-au"
    ]);
  });

  it("supports exclude filters from env and argv", () => {
    const selected = resolveSourcesToRun({
      argv: ["--exclude-source", "ticketmaster-au"],
      env: {
        SCRAPER_EXCLUDE_SOURCE_SLUGS: "moshtix-wa"
      },
      availableSources: sources
    });

    expect(selected.map((source) => source.slug)).toEqual([
      "humanitix-perth-music",
      "milk-bar",
      "rosemount-hotel",
      "the-bird",
      "oztix-wa",
      "ticketek-wa"
    ]);
  });

  it("rejects unknown source slugs", () => {
    expect(() =>
      resolveSourcesToRun({
        argv: ["--source", "not-a-real-source"],
        env: {},
        availableSources: sources
      })
    ).toThrow("Unknown included source slug(s): not-a-real-source");
  });

  it("rejects empty selections", () => {
    expect(() =>
      resolveSourcesToRun({
        argv: [],
        env: {
          SCRAPER_EXCLUDE_SOURCE_SLUGS: sources.map((source) => source.slug).join(",")
        },
        availableSources: sources
      })
    ).toThrow("Source selection resolved to zero sources.");
  });
});
