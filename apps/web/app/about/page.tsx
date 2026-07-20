import type { Metadata } from "next";

import { PublicPageHeader } from "@/components/public-page-header";
import { PublicPageShell } from "@/components/public-page-shell";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  description:
    "How Gig Radar compiles and maintains independent Perth live music listings.",
  path: "/about",
  title: "About Gig Radar"
});

export default function AboutPage() {
  return (
    <PublicPageShell>
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "About" }
        ]}
        currentPath="/about"
        description="Gig Radar is an independent guide to live music events across Perth and Boorloo."
        eyebrow="Methodology"
        title="About Gig Radar"
      />
      <div className="about-content">
        <section>
          <h2>How listings are compiled</h2>
          <p>
            Gig Radar gathers public event facts from venue calendars and ticketing
            services, then normalises dates, venues and artist lineups into one
            searchable calendar.
          </p>
        </section>
        <section>
          <h2>What Gig Radar publishes</h2>
          <p>
            Event pages show factual listing information and direct links to official
            ticket sellers, venues and verified Tixel event pages. Promotional event
            descriptions are not republished.
          </p>
        </section>
        <section>
          <h2>Updates and corrections</h2>
          <p>
            Listings are refreshed throughout the day. Cancelled and postponed events
            remain visible so shared links continue to provide useful status
            information.
          </p>
        </section>
      </div>
    </PublicPageShell>
  );
}
