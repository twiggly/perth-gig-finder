import type { JsonObject } from "@perth-gig-finder/shared";

export interface EventbriteDiscoveryPagination {
  objectCount: number;
  pageCount: number;
  pageNumber: number;
  pageSize: number;
}

export interface EventbriteDiscoveryTag {
  prefix?: string | null;
  tag?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  localized?: {
    display_name?: string | null;
    displayName?: string | null;
  } | null;
}

export interface EventbriteDiscoveryAddress {
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  region?: string | null;
  region_code?: string | null;
  postal_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  localized_address_display?: string | null;
}

export interface EventbriteDiscoveryVenue {
  name?: string | null;
  address?: EventbriteDiscoveryAddress | null;
}

export interface EventbriteDiscoveryImage {
  url?: string | null;
  original?: {
    url?: string | null;
  } | null;
}

export interface EventbriteDiscoveryEvent {
  id?: string | number | null;
  eventbrite_event_id?: string | number | null;
  name?: string | null;
  title?: string | null;
  summary?: string | null;
  url?: string | null;
  start_date?: string | null;
  start_time?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  is_cancelled?: boolean | null;
  is_online_event?: boolean | null;
  image?: EventbriteDiscoveryImage | null;
  primary_venue?: EventbriteDiscoveryVenue | null;
  tags?: EventbriteDiscoveryTag[] | null;
  [key: string]: unknown;
}

export interface EventbriteDiscoveryListing {
  externalId: string;
  eventUrl: string;
  event: EventbriteDiscoveryEvent;
}

export interface ParsedEventbriteDiscoveryPage {
  listings: EventbriteDiscoveryListing[];
  pagination: EventbriteDiscoveryPagination;
  nextPageUrl: string | null;
  failedCount: number;
}

export interface EventbriteStructuredAddress {
  "@type"?: string | null;
  streetAddress?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  postalCode?: string | null;
  addressCountry?:
    | string
    | {
        name?: string | null;
      }
    | null;
}

export interface EventbriteStructuredPlace {
  "@type"?: string | null;
  name?: string | null;
  url?: string | null;
  address?: EventbriteStructuredAddress | string | null;
}

export interface EventbriteStructuredPerformer {
  "@type"?: string | null;
  name?: string | null;
}

export interface EventbriteStructuredOffer {
  "@type"?: string | null;
  url?: string | null;
  availability?: string | null;
  price?: string | number | null;
  priceCurrency?: string | null;
}

export interface EventbriteStructuredImage {
  "@type"?: string | null;
  url?: string | null;
  contentUrl?: string | null;
}

export interface EventbriteStructuredEvent {
  "@type"?: string | string[] | null;
  name?: string | null;
  description?: string | null;
  url?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  eventStatus?: string | null;
  eventAttendanceMode?: string | string[] | null;
  location?: EventbriteStructuredPlace | null;
  image?:
    | string
    | EventbriteStructuredImage
    | Array<string | EventbriteStructuredImage>
    | null;
  performer?:
    | string
    | EventbriteStructuredPerformer
    | Array<string | EventbriteStructuredPerformer>
    | null;
  performers?:
    | string
    | EventbriteStructuredPerformer
    | Array<string | EventbriteStructuredPerformer>
    | null;
  offers?: EventbriteStructuredOffer | EventbriteStructuredOffer[] | null;
  [key: string]: unknown;
}

export interface EventbriteRawPayload extends JsonObject {
  discovery: JsonObject;
  structuredEvent: JsonObject;
}
