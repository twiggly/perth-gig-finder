import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GigDiscoveryList } from "@/components/gig-discovery-list";
import { PublicPageHeader } from "@/components/public-page-header";
import { PublicPageShell } from "@/components/public-page-shell";
import { listGigsForVenue } from "@/lib/gigs";
import { buildPublicPageMetadata } from "@/lib/seo";
import { getVenueBySlug } from "@/lib/venues";

export const revalidate = 300;

interface VenuePageProps {
  params: Promise<{ slug: string }>;
}

const loadVenuePage = cache(async (slug: string) => {
  const [venue, gigs] = await Promise.all([
    getVenueBySlug(slug),
    listGigsForVenue(slug)
  ]);

  return venue ? { gigs, venue } : null;
});

export async function generateMetadata({
  params
}: VenuePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadVenuePage(slug);

  if (!page) {
    return {
      robots: { follow: false, index: false },
      title: "Venue not found | Gig Radar"
    };
  }

  const location = [page.venue.name, page.venue.suburb]
    .filter(Boolean)
    .join(", ");

  return buildPublicPageMetadata({
    description: `Upcoming and recent live music events at ${location}.`,
    index: page.gigs.length > 0,
    path: `/venues/${encodeURIComponent(page.venue.slug)}`,
    title: `${page.venue.name} Gigs | Gig Radar`
  });
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { slug } = await params;
  const page = await loadVenuePage(slug);

  if (!page) {
    notFound();
  }

  const path = `/venues/${encodeURIComponent(page.venue.slug)}`;
  const location = [page.venue.name, page.venue.suburb]
    .filter(Boolean)
    .join(", ");

  return (
    <PublicPageShell>
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/venues", label: "Venues" },
          { label: page.venue.name }
        ]}
        currentPath={path}
        description={`Upcoming and recent live music listings at ${location}.`}
        eyebrow={page.venue.suburb ?? "Perth venue"}
        title={page.venue.name}
      />
      <section aria-label="Venue details" className="venue-facts">
        {page.venue.address ? <p>{page.venue.address}</p> : null}
        {page.venue.website_url ? (
          <a href={page.venue.website_url} rel="noreferrer" target="_blank">
            Visit venue website
          </a>
        ) : null}
      </section>
      {page.gigs.length > 0 ? (
        <GigDiscoveryList gigs={page.gigs} />
      ) : (
        <section className="empty-state">
          <p>No events are available in the three-month archive window.</p>
        </section>
      )}
    </PublicPageShell>
  );
}
