import type { Metadata } from "next";
import Link from "next/link";

import { PublicPageHeader } from "@/components/public-page-header";
import { buildPublicPageMetadata } from "@/lib/seo";
import { listDiscoveryVenues } from "@/lib/venues";

export const revalidate = 300;

export const metadata: Metadata = buildPublicPageMetadata({
  description: "Explore live music venues across Perth (Boorloo).",
  path: "/venues",
  title: "Perth Live Music Venues | Gig Radar"
});

export default async function VenuesPage() {
  const venues = await listDiscoveryVenues();

  return (
    <main className="page-shell discovery-page">
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "Venues" }
        ]}
        currentPath="/venues"
        description="Find upcoming and recent live music listings by venue across Perth and Boorloo."
        eyebrow="Perth live music"
        title="Live music venues"
      />
      {venues.length > 0 ? (
        <ol className="venue-directory">
          {venues.map((venue) => (
            <li key={venue.slug}>
              <Link href={`/venues/${encodeURIComponent(venue.slug)}`}>
                <strong>{venue.name}</strong>
                {venue.suburb ? <span>{venue.suburb}</span> : null}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <section className="empty-state">
          <p>No venue listings are available right now.</p>
        </section>
      )}
    </main>
  );
}
