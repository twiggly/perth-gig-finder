import type { GigCardRecord } from "./gigs";

export interface GigAction {
  href: string;
  key: "tickets" | "venue";
  label: string;
}

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
  return sellerLabel ? `Tickets @ ${sellerLabel}` : "Buy tickets";
}

function getVenueListingUrl(
  sourceUrl: string,
  venueWebsiteUrl: string
): string {
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

export function getGigActions(
  gig: Pick<
    GigCardRecord,
    "source_url" | "ticket_url" | "venue_name" | "venue_slug" | "venue_website_url"
  >
): GigAction[] {
  const actions: GigAction[] = [];

  if (gig.ticket_url) {
    actions.push({
      href: gig.ticket_url,
      key: "tickets",
      label: getBuyTicketsLabel(gig.ticket_url, gig.venue_slug)
    });
  }

  if (gig.venue_website_url) {
    actions.push({
      href: getVenueListingUrl(gig.source_url, gig.venue_website_url),
      key: "venue",
      label: `Listing @ ${getVenueListingLabelName(gig.venue_slug, gig.venue_name)}`
    });
  }

  return actions;
}
