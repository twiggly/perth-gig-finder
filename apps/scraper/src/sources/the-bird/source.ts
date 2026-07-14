import type { NormalizedGig } from "@perth-gig-finder/shared";

import type { SourceAdapter } from "../../types";
import { repairTheBirdArtists } from "./artists";
import {
  enrichTheBirdGigImage,
  mergeTheBirdFeedResults,
  parseTheBirdFeedRows,
  parseTheBirdWhatsOnRows
} from "./parser";
import type { TheBirdFeedRow, TheBirdWhatsOnRow } from "./types";

const SOURCE_URL = "https://www.williamstreetbird.com/comingup";
const FEED_URL =
  "https://script.google.com/macros/s/AKfycbxdagRDbsT5jS3IG1w9Kl7N0qia6piKKcp8BE_n4y9n9XYItKKgXmYHX6XX70fDmMP5pw/exec";
const WHATSON_FEED_URL =
  "https://script.google.com/macros/s/AKfycbzzgynedUsONCcojblT4OlkSN8rhGlCQ7sW5j4izIwA8pK7sKWpEOCCuonK7RqiX-Ee/exec";
const REQUEST_TIMEOUT_MS = 15_000;

export const theBirdSource: SourceAdapter = {
  slug: "the-bird",
  name: "The Bird",
  baseUrl: SOURCE_URL,
  priority: 50,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const [response, weeklyResponse] = await Promise.all([
      fetchImpl(FEED_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }),
      fetchImpl(WHATSON_FEED_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    ]);

    if (!response.ok) {
      throw new Error(`The Bird feed returned status ${response.status}`);
    }

    if (!weeklyResponse.ok) {
      throw new Error(
        `The Bird weekly feed returned status ${weeklyResponse.status}`
      );
    }

    const [payload, weeklyPayload] = (await Promise.all([
      response.json(),
      weeklyResponse.json()
    ])) as [unknown, unknown];

    if (!Array.isArray(payload)) {
      throw new Error("The Bird feed payload was not an array");
    }

    if (!Array.isArray(weeklyPayload)) {
      throw new Error("The Bird weekly feed payload was not an array");
    }

    const parsed = mergeTheBirdFeedResults(
      parseTheBirdFeedRows(payload as TheBirdFeedRow[]),
      parseTheBirdWhatsOnRows(weeklyPayload as TheBirdWhatsOnRow[])
    );
    const gigs: NormalizedGig[] = [];

    for (const gig of parsed.gigs) {
      gigs.push(await enrichTheBirdGigImage(gig, fetchImpl));
    }

    return {
      gigs,
      failedCount: parsed.failedCount
    };
  },
  repairArtists: repairTheBirdArtists
};
