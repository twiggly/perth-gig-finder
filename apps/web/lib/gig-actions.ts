import { normalizeAbsoluteHttpUrl } from "@perth-gig-finder/shared/url";

import type { GigCardRecord } from "./gigs";
import { getGigDisplayState } from "./gig-archive";

export interface GigAction {
  href: string;
  key: "source" | "tickets" | "tixel" | "venue";
  label: string;
}

type GigActionFields = Pick<
  GigCardRecord,
  | "source_url"
  | "ticket_url"
  | "tixel_url"
  | "venue_name"
  | "venue_slug"
  | "venue_website_url"
>;

const TIXEL_EVENT_PATH =
  /^\/au\/[a-z0-9-]+-tickets\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+$/;

function matchesHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

function getHostname(value: string): string | null {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
}

function getTicketSellerLabel(ticketUrl: string): string | null {
  let hostname: string;

  try {
    hostname = new URL(ticketUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (matchesHost(hostname, "oztix.com.au")) {
    return "oztix";
  }

  if (matchesHost(hostname, "moshtix.com.au")) {
    return "moshtix";
  }

  if (matchesHost(hostname, "humanitix.com")) {
    return "humanitix";
  }

  if (matchesHost(hostname, "ticketek.com.au")) {
    return "ticketek";
  }

  if (matchesHost(hostname, "ticketmaster.com.au")) {
    return "ticketmaster";
  }

  if (
    matchesHost(hostname, "eventbrite.com.au") ||
    matchesHost(hostname, "eventbrite.com") ||
    matchesHost(hostname, "eventbrite.co")
  ) {
    return "eventbrite";
  }

  switch (hostname) {
    case "tickets.avclive.com.au":
    case "tickets.393murray.com.au":
    case "tickets.metropolisfremantle.com.au":
      return "oztix";
    default:
      return null;
  }
}

function getBuyTicketsLabel(ticketUrl: string, venueSlug: string): string {
  if (venueSlug === "the-ellington-jazz-club") {
    return "Tickets @ The Ellington";
  }

  const sellerLabel = getTicketSellerLabel(ticketUrl);

  if (sellerLabel === "eventbrite") {
    return "Tickets @ eventbrite";
  }

  return sellerLabel ? `Tickets @ ${sellerLabel}` : "Buy tickets";
}

function getVenueListingUrl(
  sourceUrl: string | null,
  venueWebsiteUrl: string
): string {
  if (!sourceUrl) {
    return venueWebsiteUrl;
  }

  const sourceHostname = getHostname(sourceUrl);
  const venueHostname = getHostname(venueWebsiteUrl);

  return sourceHostname && venueHostname && sourceHostname === venueHostname
    ? sourceUrl
    : venueWebsiteUrl;
}

function getVenueListingLabelName(venueSlug: string, venueName: string): string {
  switch (venueSlug) {
    case "the-ellington-jazz-club":
      return "The Ellington";
    case "four5nine-bar-rosemount":
      return "Four5Nine Bar";
    default:
      return venueName;
  }
}

function normalizeTixelEventUrl(value: string | null): string | null {
  const normalized = normalizeAbsoluteHttpUrl(value);

  if (!normalized) {
    return null;
  }

  const url = new URL(normalized);
  return url.hostname === "tixel.com" &&
    !url.search &&
    !url.hash &&
    TIXEL_EVENT_PATH.test(url.pathname)
    ? url.href
    : null;
}

export function getGigActions(gig: GigActionFields): GigAction[] {
  const actions: GigAction[] = [];
  const ticketUrl = normalizeAbsoluteHttpUrl(gig.ticket_url);
  const tixelUrl = normalizeTixelEventUrl(gig.tixel_url);
  const venueWebsiteUrl = normalizeAbsoluteHttpUrl(gig.venue_website_url);
  const sourceUrl = normalizeAbsoluteHttpUrl(gig.source_url);

  if (ticketUrl) {
    actions.push({
      href: ticketUrl,
      key: "tickets",
      label: getBuyTicketsLabel(ticketUrl, gig.venue_slug)
    });
  }

  if (tixelUrl) {
    actions.push({
      href: tixelUrl,
      key: "tixel",
      label: "Tickets @ tixel"
    });
  }

  if (venueWebsiteUrl) {
    actions.push({
      href: getVenueListingUrl(sourceUrl, venueWebsiteUrl),
      key: "venue",
      label: `Listing @ ${getVenueListingLabelName(gig.venue_slug, gig.venue_name)}`
    });
  }

  return actions;
}

export function getGigDetailActions(
  gig: GigCardRecord,
  now = new Date()
): GigAction[] {
  const actions = getGigActions(gig);

  if (getGigDisplayState(gig, now) === "active") {
    return actions;
  }

  const venueActions = actions.filter((action) => action.key === "venue");

  if (venueActions.length > 0) {
    return venueActions;
  }

  const sourceUrl = normalizeAbsoluteHttpUrl(gig.source_url);
  return sourceUrl
    ? [{ href: sourceUrl, key: "source", label: "Original listing" }]
    : [];
}
