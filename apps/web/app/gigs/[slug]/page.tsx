import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GigDetailContent } from "@/components/gig-detail-content";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SiteHeader } from "@/components/site-header";
import { getCachedGigBySlug } from "@/lib/gig-detail-cache";
import {
  buildGigEventStructuredDataJson,
  buildGigMetadata
} from "@/lib/gig-seo";

import { buildGigDetailPath } from "@/lib/seo";

export const revalidate = 300;

interface GigDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getGigFromParams(params: GigDetailPageProps["params"]) {
  const { slug } = await params;

  return getCachedGigBySlug(slug);
}

export async function generateMetadata({
  params
}: GigDetailPageProps): Promise<Metadata> {
  const gig = await getGigFromParams(params);

  if (!gig) {
    return {
      robots: {
        follow: false,
        index: false
      },
      title: "Gig not found | Gig Radar"
    };
  }

  return buildGigMetadata(gig);
}

export default async function GigDetailPage({ params }: GigDetailPageProps) {
  const gig = await getGigFromParams(params);

  if (!gig) {
    notFound();
  }

  const detailPath = buildGigDetailPath(gig.slug);
  const structuredDataJson = buildGigEventStructuredDataJson(gig);

  return (
    <main className="page-shell">
      <SiteHeader actions="public-menu" className="site-header-shell--detail" />
      <Breadcrumbs
        currentPath={detailPath}
        id={`gig-breadcrumbs-${gig.slug}`}
        items={[
          { href: "/", label: "Home" },
          { href: "/gigs", label: "All gigs" },
          { label: gig.title }
        ]}
      />
      <GigDetailContent gig={gig} />
      {structuredDataJson ? (
        <script
          dangerouslySetInnerHTML={{ __html: structuredDataJson }}
          id={`gig-structured-data-${gig.slug}`}
          type="application/ld+json"
        />
      ) : null}
    </main>
  );
}
