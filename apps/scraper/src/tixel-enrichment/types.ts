export interface TixelEnrichmentGig {
  artistNames: string[];
  id: string;
  startsAt: string;
  title: string;
  tixelUrl: string | null;
  venueName: string;
  venueSlug: string;
}

export interface TixelDiscoveryCard {
  dateKey: string;
  title: string;
  url: string;
  venueName: string;
}

export interface TixelDiscoveryPage {
  cards: TixelDiscoveryCard[];
  maxPage: number;
}

export interface TixelEventDetail {
  dateKey: string;
  startsAt: string;
  title: string;
  url: string;
  venueName: string;
}

export interface TixelUrlChange {
  gigId: string;
  tixelUrl: string | null;
}

export interface TixelEnrichmentStore {
  applyTixelUrlChanges(changes: TixelUrlChange[]): Promise<void>;
  listUpcomingPublicGigs(nowIso: string): Promise<TixelEnrichmentGig[]>;
}

export interface TixelEnrichmentSummary {
  ambiguous: number;
  cleared: number;
  discovered: number;
  failed: number;
  matched: number;
  unchanged: number;
  updated: number;
  verified: number;
}
