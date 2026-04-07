export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface NormalizedVenue {
  name: string;
  slug: string;
  suburb: string | null;
  address: string | null;
  websiteUrl: string | null;
}

export type GigStatus = "active" | "cancelled" | "postponed";

export interface NormalizedGig {
  sourceSlug: string;
  externalId: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  title: string;
  description: string | null;
  status: GigStatus;
  startsAt: string;
  endsAt: string | null;
  ticketUrl: string | null;
  venue: NormalizedVenue;
  artists: string[];
  rawPayload: JsonValue;
  checksum: string;
}

export type ScrapeRunStatus = "running" | "success" | "partial" | "failed";

export interface ScrapeRunResult {
  sourceSlug: string;
  status: ScrapeRunStatus;
  discoveredCount: number;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
}
