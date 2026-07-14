import type {
  JsonObject,
  NormalizedGig
} from "@perth-gig-finder/shared";

export interface MoshtixStructuredAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
}

export interface MoshtixPresentedShow {
  presenter: string;
  showTitle: string;
}

interface MoshtixStructuredPlace {
  name?: string;
  sameAs?: string;
  address?: MoshtixStructuredAddress;
}

interface MoshtixStructuredPerformer {
  name?: string;
}

interface MoshtixStructuredOffer {
  url?: string;
}

export interface MoshtixStructuredEvent {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  url?: string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  location?: MoshtixStructuredPlace;
  offers?: MoshtixStructuredOffer[];
  performers?: MoshtixStructuredPerformer[];
}

export interface MoshtixEventData {
  id?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: string | null;
  client?: {
    name?: string;
  };
  venue?: {
    id?: number;
    name?: string;
    state?: string;
  };
  category?: {
    id?: number;
    name?: string;
  };
  genre?: {
    id?: number;
    name?: string;
  };
  customImage?: string | null;
  highResImage?: string | null;
  artists?: string[];
}

export interface MoshtixSearchListing {
  externalId: string;
  title: string;
  eventUrl: string;
  startsAt: string | null;
  listingImageUrl: string | null;
  teaser: string | null;
  rawPayload: JsonObject;
}

export interface MoshtixListingFetchResult {
  gig: NormalizedGig | null;
  failedCount: number;
}

export interface ParsedMoshtixSearchPage {
  listings: MoshtixSearchListing[];
  failedCount: number;
  totalPages: number;
}
