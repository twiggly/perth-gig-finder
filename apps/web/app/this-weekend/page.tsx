import { cache } from "react";
import type { Metadata } from "next";

import { GigDiscoveryList } from "@/components/gig-discovery-list";
import { PublicPageHeader } from "@/components/public-page-header";
import { listActiveGigsForDateKeys } from "@/lib/gigs";
import { getWeekendShortcutDateKeys } from "@/lib/homepage-dates";
import { buildPublicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

const loadWeekendGigs = cache(async () => {
  const now = new Date();
  const dateKeys = getWeekendShortcutDateKeys(now);
  return { gigs: await listActiveGigsForDateKeys(dateKeys, now), now };
});

export async function generateMetadata(): Promise<Metadata> {
  const { gigs } = await loadWeekendGigs();

  return buildPublicPageMetadata({
    description: "Live music and gigs in Perth (Boorloo) this weekend.",
    index: gigs.length > 0,
    path: "/this-weekend",
    title: "Perth Gigs This Weekend | Gig Radar"
  });
}

export default async function ThisWeekendPage() {
  const { gigs, now } = await loadWeekendGigs();

  return (
    <main className="page-shell discovery-page">
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "This weekend" }
        ]}
        currentPath="/this-weekend"
        description="Browse concerts, gigs and live music across Perth and Boorloo this weekend."
        eyebrow="Friday to Sunday"
        title="Perth gigs this weekend"
      />
      {gigs.length > 0 ? (
        <GigDiscoveryList gigs={gigs} now={now} />
      ) : (
        <section className="empty-state">
          <p>No gigs are listed for this weekend yet.</p>
        </section>
      )}
    </main>
  );
}
