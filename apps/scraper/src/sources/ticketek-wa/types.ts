import type {
  JsonObject,
  StartsAtPrecision
} from "@perth-gig-finder/shared";

export interface TicketekSearchListing {
  externalId: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  sourceUrl: string;
  ticketUrl: string;
  imageUrl: string | null;
  locationText: string;
  dateText: string;
  startsAt: string;
  startsAtPrecision: StartsAtPrecision;
  rawPayload: JsonObject;
}

export interface ParsedTicketekSearchPage {
  listings: TicketekSearchListing[];
  unclassifiedListings: TicketekSearchListing[];
  failedCount: number;
  totalPages: number;
}

export interface TicketekSearchApiResponse {
  paging?: {
    nextPageToken?: string | null;
    hasMore?: boolean | null;
    totalCount?: number | null;
  } | null;
  events?: TicketekSearchApiEvent[] | null;
  facets?: {
    categories?: Record<string, number> | null;
  } | null;
}

export interface TicketekSearchApiEvent {
  id?: string | null;
  title?: string | null;
  subtitle?: string | null;
  dateTimeLocalized?: string | null;
  link?: {
    uri?: string | null;
  } | null;
  show?: {
    showCode?: string | null;
  } | null;
  venue?: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    venueCode?: string | null;
  } | null;
}
