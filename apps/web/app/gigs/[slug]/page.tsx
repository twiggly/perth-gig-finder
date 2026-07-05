import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GigDetailContent } from "@/components/gig-detail-content";
import { SiteHeader } from "@/components/site-header";
import { getGigBySlug } from "@/lib/gigs";
import {
  buildGigEventStructuredDataJson,
  buildGigMetadata
} from "@/lib/gig-seo";

export const dynamic = "force-dynamic";

interface GigDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getGigFromParams(params: GigDetailPageProps["params"]) {
  const { slug } = await params;

  return getGigBySlug(slug);
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

  return (
    <main className="page-shell">
      <SiteHeader actions="public-menu" className="site-header-shell--detail" />
      <GigDetailContent gig={gig} />
      <script
        dangerouslySetInnerHTML={{ __html: buildGigEventStructuredDataJson(gig) }}
        id={`gig-structured-data-${gig.slug}`}
        type="application/ld+json"
      />
    </main>
  );
}
