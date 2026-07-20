import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GigDiscoveryList } from "@/components/gig-discovery-list";
import { PublicPageHeader } from "@/components/public-page-header";
import {
  buildGigMonthPath,
  formatPerthMonth,
  getPerthMonthBounds,
  shiftPerthMonth
} from "@/lib/gig-archive";
import { listGigsForMonth } from "@/lib/gigs";
import { buildPublicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

interface GigMonthPageProps {
  params: Promise<{ month: string; slug: string }>;
}

function parseMonthParams(slug: string, month: string) {
  if (!/^\d{4}$/.test(slug) || !/^\d{2}$/.test(month)) {
    return null;
  }

  const parsed = { month: Number(month), year: Number(slug) };
  return getPerthMonthBounds(parsed.year, parsed.month) ? parsed : null;
}

const loadMonthPage = cache(async (slug: string, month: string) => {
  const parsed = parseMonthParams(slug, month);

  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    gigs: await listGigsForMonth(parsed.year, parsed.month)
  };
});

export async function generateMetadata({
  params
}: GigMonthPageProps): Promise<Metadata> {
  const { month, slug } = await params;
  const page = await loadMonthPage(slug, month);

  if (!page) {
    return { robots: { follow: false, index: false } };
  }

  const label = formatPerthMonth(page);
  const path = buildGigMonthPath(page);

  return buildPublicPageMetadata({
    description: `Perth live music events and gigs in ${label}.`,
    index: page.gigs.length > 0,
    path,
    title: `${label} Perth Gigs | Gig Radar`
  });
}

export default async function GigMonthPage({ params }: GigMonthPageProps) {
  const { month, slug } = await params;
  const page = await loadMonthPage(slug, month);

  if (!page) {
    notFound();
  }

  const label = formatPerthMonth(page);
  const path = buildGigMonthPath(page);
  const previousMonth = shiftPerthMonth(page, -1);
  const nextMonth = shiftPerthMonth(page, 1);

  return (
    <main className="page-shell discovery-page">
      <PublicPageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/gigs", label: "All gigs" },
          { label }
        ]}
        currentPath={path}
        description={`Concerts, gigs and live music listed across Perth (Boorloo) in ${label}.`}
        eyebrow="Monthly live music"
        title={`${label} gigs`}
      />
      <nav aria-label="Adjacent months" className="month-navigation">
        <Link href={buildGigMonthPath(previousMonth)}>
          {formatPerthMonth(previousMonth)}
        </Link>
        <Link href={buildGigMonthPath(nextMonth)}>
          {formatPerthMonth(nextMonth)}
        </Link>
      </nav>
      {page.gigs.length > 0 ? (
        <GigDiscoveryList gigs={page.gigs} />
      ) : (
        <section className="empty-state">
          <p>No gigs are listed for this month.</p>
        </section>
      )}
    </main>
  );
}
