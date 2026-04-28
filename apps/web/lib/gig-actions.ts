import type { GigCardRecord } from "./gigs";

export interface GigAction {
  href: string;
  key: "tickets" | "venue";
  label: string;
}

function matchesHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
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

function getBuyTicketsLabel(ticketUrl: string): string {
  const sellerLabel = getTicketSellerLabel(ticketUrl);
  return sellerLabel ? `Buy tickets @ ${sellerLabel}` : "Buy tickets";
}

export function getGigActions(
  gig: Pick<GigCardRecord, "ticket_url" | "venue_website_url">
): GigAction[] {
  const actions: GigAction[] = [];

  if (gig.ticket_url) {
    actions.push({
      href: gig.ticket_url,
      key: "tickets",
      label: getBuyTicketsLabel(gig.ticket_url)
    });
  }

  if (gig.venue_website_url) {
    actions.push({
      href: gig.venue_website_url,
      key: "venue",
      label: "Venue website"
    });
  }

  return actions;
}
