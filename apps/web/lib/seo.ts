import type { Metadata, MetadataRoute } from "next";

import { buildGigMonthPath, getGigArchiveLowerBound } from "./gig-archive";
import type { GigSitemapRecord } from "./gigs";
import {
  getPerthDateKey,
  getWeekendShortcutDateKeys
} from "./homepage-dates";
import { serializeJsonLd } from "./json-ld";

export const SITE_URL = "https://gigradar.com.au";
export const SITE_TITLE = "Gig Radar";
export const HOMEPAGE_TITLE = "Live Music in Perth (Boorloo)";
export const SITE_DESCRIPTION =
  "Discover upcoming live music events across Perth (Boorloo).";
export const SITE_LOGO_PATH = "/logo.png";
export const SITE_FAVICON_PATH = "/favicon.svg";
export const SITE_LOGO_WIDTH = 196;
export const SITE_LOGO_HEIGHT = 196;
export const SITE_LOGO_URL = `${SITE_URL}${SITE_LOGO_PATH}`;
export const SITE_SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const MAX_SITEMAP_URLS = 50_000;

export function buildGigDetailPath(slug: string): string {
  return `/gigs/${encodeURIComponent(slug)}`;
}

export function buildGigDetailUrl(slug: string): string {
  return `${SITE_URL}${buildGigDetailPath(slug)}`;
}

export function buildRobotsConfig(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      disallow: "/api/",
      userAgent: "*"
    },
    sitemap: SITE_SITEMAP_URL
  };
}

export function buildPublicPageMetadata({
  description,
  index = true,
  path,
  title
}: {
  description: string;
  index?: boolean;
  path: string;
  title: string;
}): Metadata {
  return {
    alternates: { canonical: path },
    description,
    openGraph: {
      description,
      title,
      type: "website",
      url: path
    },
    robots: index ? undefined : { follow: true, index: false },
    title,
    twitter: {
      card: "summary",
      description,
      title
    }
  };
}

export function shouldNoIndexHomepage(
  searchParams: Record<string, string | string[] | undefined>
): boolean {
  const facetParams = new Set(["date", "q", "venue", "when"]);
  return Object.keys(searchParams).some((key) => facetParams.has(key));
}

export function buildSitemap(
  gigs: GigSitemapRecord[] = [],
  now = new Date()
): MetadataRoute.Sitemap {
  const archiveLowerBound = getGigArchiveLowerBound(now).getTime();
  const indexableGigs = gigs.filter((gig) => {
    const startsAt = new Date(gig.starts_at).getTime();
    const lastModified = new Date(gig.last_modified).getTime();
    return (
      Boolean(gig.slug && gig.venue_slug) &&
      Number.isFinite(startsAt) &&
      startsAt >= archiveLowerBound &&
      Number.isFinite(lastModified)
    );
  });
  const activeFutureGigs = indexableGigs.filter(
    (gig) =>
      gig.status === "active" &&
      new Date(gig.starts_at).getTime() >= now.getTime()
  );
  const monthGroups = new Map<string, GigSitemapRecord[]>();
  const venueGroups = new Map<string, GigSitemapRecord[]>();

  for (const gig of indexableGigs) {
    const monthKey = getPerthDateKey(gig.starts_at).slice(0, 7);
    monthGroups.set(monthKey, [...(monthGroups.get(monthKey) ?? []), gig]);
    venueGroups.set(gig.venue_slug, [
      ...(venueGroups.get(gig.venue_slug) ?? []),
      gig
    ]);
  }

  const latestModified = (records: GigSitemapRecord[]): Date | undefined => {
    const latest = records.reduce(
      (value, record) => Math.max(value, new Date(record.last_modified).getTime()),
      0
    );
    return latest > 0 ? new Date(latest) : undefined;
  };
  const allLatest = latestModified(indexableGigs);
  const activeLatest = latestModified(activeFutureGigs);
  const buildEntry = (
    url: string,
    lastModified?: Date
  ): MetadataRoute.Sitemap[number] => ({
    ...(lastModified ? { lastModified } : {}),
    url
  });
  const entries: MetadataRoute.Sitemap = [
    buildEntry(`${SITE_URL}/`, activeLatest),
    buildEntry(`${SITE_URL}/gigs`, activeLatest),
    buildEntry(`${SITE_URL}/about`)
  ];
  const todayKey = getPerthDateKey(now);
  const tonightGigs = activeFutureGigs.filter(
    (gig) => getPerthDateKey(gig.starts_at) === todayKey
  );
  const weekendKeys = new Set(getWeekendShortcutDateKeys(now));
  const weekendGigs = activeFutureGigs.filter((gig) =>
    weekendKeys.has(getPerthDateKey(gig.starts_at))
  );

  if (tonightGigs.length > 0) {
    entries.push({
      lastModified: latestModified(tonightGigs),
      url: `${SITE_URL}/tonight`
    });
  }

  if (weekendGigs.length > 0) {
    entries.push({
      lastModified: latestModified(weekendGigs),
      url: `${SITE_URL}/this-weekend`
    });
  }

  if (venueGroups.size > 0) {
    entries.push({ lastModified: allLatest, url: `${SITE_URL}/venues` });
  }

  for (const [monthKey, records] of [...monthGroups].sort()) {
    const [year, month] = monthKey.split("-").map(Number);
    entries.push({
      lastModified: latestModified(records),
      url: `${SITE_URL}${buildGigMonthPath({ month, year })}`
    });
  }

  for (const [venueSlug, records] of [...venueGroups].sort()) {
    entries.push({
      lastModified: latestModified(records),
      url: `${SITE_URL}/venues/${encodeURIComponent(venueSlug)}`
    });
  }

  entries.push(
    ...indexableGigs.map((gig) => ({
      lastModified: new Date(gig.last_modified),
      url: buildGigDetailUrl(gig.slug)
    }))
  );

  if (entries.length > MAX_SITEMAP_URLS) {
    throw new Error(`Sitemap contains ${entries.length} URLs; maximum is ${MAX_SITEMAP_URLS}.`);
  }

  return entries;
}

export function buildSiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${SITE_URL}/#website`,
        "@type": "WebSite",
        description: SITE_DESCRIPTION,
        name: SITE_TITLE,
        publisher: { "@id": `${SITE_URL}/#organization` },
        url: SITE_URL
      },
      {
        "@id": `${SITE_URL}/#organization`,
        "@type": "Organization",
        logo: SITE_LOGO_URL,
        name: SITE_TITLE,
        url: SITE_URL
      }
    ]
  };
}

export function buildSiteStructuredDataJson(): string {
  return serializeJsonLd(buildSiteStructuredData());
}
