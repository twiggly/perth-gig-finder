import type { GigCardRecord } from "./gigs";

export interface GigAction {
  href: string;
  key: "tickets" | "venue";
  label: string;
}

export function getGigActions(
  gig: Pick<GigCardRecord, "ticket_url" | "venue_website_url">
): GigAction[] {
  const actions: GigAction[] = [];

  if (gig.ticket_url) {
    actions.push({
      href: gig.ticket_url,
      key: "tickets",
      label: "Buy tickets"
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
