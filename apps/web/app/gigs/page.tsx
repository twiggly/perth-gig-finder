import type { Metadata } from "next";

import { GigDiscoveryList } from "@/components/gig-discovery-list";
import { PublicPageHeader } from "@/components/public-page-header";
import { PublicPageShell } from "@/components/public-page-shell";
import { listUpcomingDiscoveryGigs } from "@/lib/gigs";
import { buildPublicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildPublicPageMetadata({
  description: "Browse upcoming live music events across Perth (Boorloo).",
  path: "/gigs",
  title: "Upcoming Perth Gigs | Gig Radar"
});

export default async function GigsIndexPage() {
  const gigs = await listUpcomingDiscoveryGigs();

  return (
    <PublicPageShell>
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "All gigs" }
        ]}
        currentPath="/gigs"
        description="Browse upcoming concerts, gigs and live music events across Perth and Boorloo."
        eyebrow="Live music calendar"
        title="Upcoming Perth gigs"
      />
      {gigs.length > 0 ? (
        <GigDiscoveryList gigs={gigs} />
      ) : (
        <section className="empty-state">
          <p>No upcoming gigs are listed right now.</p>
        </section>
      )}
    </PublicPageShell>
  );
}
