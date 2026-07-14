import { queryAlgolia } from "../../algolia";
import type { SourceAdapter } from "../../types";
import { extractOztixArtists, parseOztixHits } from "./parser";
import type { OztixHit } from "./types";

const SOURCE_URL = "https://www.oztix.com.au/search?states%5B0%5D=WA&q=";
const OZTIX_APP_ID = "ICGFYQWGTD";
const OZTIX_API_KEY = "bc11adffff267d354ad0a04aedebb5b5";
const OZTIX_INDEX_NAME = "prod_oztix_eventguide";

interface AlgoliaResponse {
  results: Array<{
    hits: OztixHit[];
  }>;
}

async function fetchOztixHits(fetchImpl: typeof fetch): Promise<OztixHit[]> {
  const params = new URLSearchParams({
    hitsPerPage: "1000",
    filters: "Venue.State:WA"
  });

  const response = await queryAlgolia<AlgoliaResponse>(
    {
      appId: OZTIX_APP_ID,
      apiKey: OZTIX_API_KEY,
      indexName: OZTIX_INDEX_NAME,
      params: params.toString()
    },
    fetchImpl
  );

  return response.results[0]?.hits ?? [];
}

export const oztixWaSource: SourceAdapter = {
  slug: "oztix-wa",
  name: "Oztix WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const hits = await fetchOztixHits(fetchImpl);
    return parseOztixHits(hits);
  },
  repairArtists(rawPayload) {
    return extractOztixArtists(rawPayload as OztixHit);
  }
};
