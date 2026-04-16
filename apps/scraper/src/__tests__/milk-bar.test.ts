import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractMilkBarSearchConfig,
  milkBarSource,
  parseMilkBarHits
} from "../sources/milk-bar";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");

describe("milk bar source adapter", () => {
  it("extracts the embedded Algolia search config from the page", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "milk-bar-page.html"), "utf8");

    expect(extractMilkBarSearchConfig(html)).toEqual({
      appId: "ICGFYQWGTD",
      apiKey: "460c71e35f551b618c0704047b643a26",
      indexName: "prod_australian_venue_co_eventguide",
      venueName: "Milk Bar"
    });
  });

  it("parses live hit shapes into normalized gigs and counts failures", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "milk-bar-hits.json"), "utf8")
    ) as {
      results: Array<{ hits: unknown[] }>;
    };

    const parsed = parseMilkBarHits(fixture.results[0].hits as never[]);

    expect(parsed.gigs).toHaveLength(2);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]).toMatchObject({
      sourceSlug: "milk-bar",
      externalId: "f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
      title: "TIME",
      imageUrl: null,
      status: "active",
      startsAt: "2026-04-10T11:30:00.000Z",
      startsAtPrecision: "exact",
      artists: ["Time"]
    });
    expect(parsed.gigs[1]).toMatchObject({
      externalId: "319bc90e-b8b5-4d98-b79f-c3317150658b",
      status: "cancelled"
    });
  });

  it("fetches the page and the event API without requiring a browser", async () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "milk-bar-page.html"), "utf8");
    const responseBody = readFileSync(
      resolve(FIXTURE_DIR, "milk-bar-hits.json"),
      "utf8"
    );

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(html, { status: 200, headers: { "content-type": "text/html" } })
      )
      .mockResolvedValueOnce(
        new Response(responseBody, {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const result = await milkBarSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(2);
    expect(result.failedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
