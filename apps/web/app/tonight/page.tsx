import { cache } from "react";
import type { Metadata } from "next";

import { GigDiscoveryList } from "@/components/gig-discovery-list";
import { PublicPageHeader } from "@/components/public-page-header";
import { PublicPageShell } from "@/components/public-page-shell";
import { listActiveGigsForDateKeys } from "@/lib/gigs";
import { getPerthDateKey } from "@/lib/homepage-dates";
import { buildPublicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

const loadTonightGigs = cache(async () => {
  const now = new Date();
  const dateKey = getPerthDateKey(now);
  return { gigs: await listActiveGigsForDateKeys([dateKey], now), now };
});

export async function generateMetadata(): Promise<Metadata> {
  const { gigs } = await loadTonightGigs();

  return buildPublicPageMetadata({
    description: "Live music happening tonight across Perth (Boorloo).",
    index: gigs.length > 0,
    path: "/tonight",
    title: "Live Music Tonight in Perth | Gig Radar"
  });
}

export default async function TonightPage() {
  const { gigs, now } = await loadTonightGigs();

  return (
    <PublicPageShell>
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "Tonight" }
        ]}
        currentPath="/tonight"
        description="Find concerts, gigs and live music happening tonight across Perth and Boorloo."
        eyebrow="Tonight in Perth"
        title="Live music tonight"
      />
      {gigs.length > 0 ? (
        <GigDiscoveryList gigs={gigs} now={now} />
      ) : (
        <section className="empty-state">
          <p>No more gigs are listed for tonight.</p>
        </section>
      )}
    </PublicPageShell>
  );
}
