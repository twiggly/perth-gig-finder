import { describe, expect, it } from "vitest";

import {
  buildGigDetailUrl,
  buildPublicPageMetadata,
  buildRobotsConfig,
  buildSitemap,
  buildSiteStructuredData,
  buildSiteStructuredDataJson,
  HOMEPAGE_TITLE,
  SITE_DESCRIPTION,
  SITE_LOGO_URL,
  SITE_SITEMAP_URL,
  SITE_TITLE,
  SITE_URL,
  shouldNoIndexHomepage
} from "./seo";

describe("SEO helpers", () => {
  it("defines the preferred homepage search metadata without changing the brand", () => {
    expect(HOMEPAGE_TITLE).toBe("Live Music in Perth (Boorloo)");
    expect(SITE_DESCRIPTION).toBe(
      "Discover upcoming live music events across Perth (Boorloo)."
    );
    expect(SITE_TITLE).toBe("Gig Radar");
  });

  it("builds robots config for public crawl with API routes excluded", () => {
    expect(buildRobotsConfig()).toEqual({
      rules: {
        allow: "/",
        disallow: "/api/",
        userAgent: "*"
      },
      sitemap: SITE_SITEMAP_URL
    });
  });

  it("builds an archive-aware sitemap with discovery URLs and lastmod values", () => {
    const lastModified = "2026-07-19T03:00:00.000Z";
    const sitemap = buildSitemap(
      [
        {
          last_modified: lastModified,
          slug: "alt-thursdays",
          starts_at: "2026-07-20T12:00:00.000Z",
          status: "active",
          venue_slug: "the-bird"
        },
        {
          last_modified: "2026-06-02T03:00:00.000Z",
          slug: "cancelled-show",
          starts_at: "2026-06-01T12:00:00.000Z",
          status: "cancelled",
          venue_slug: "milk-bar"
        },
        {
          last_modified: "2026-04-19T03:00:00.000Z",
          slug: "expired-show",
          starts_at: "2026-04-19T12:00:00.000Z",
          status: "active",
          venue_slug: "old-venue"
        }
      ],
      new Date("2026-07-20T08:00:00.000Z")
    );
    const urls = sitemap.map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls).toContain(`${SITE_URL}/gigs`);
    expect(urls).toContain(`${SITE_URL}/about`);
    expect(urls).toContain(`${SITE_URL}/tonight`);
    expect(urls).toContain(`${SITE_URL}/venues`);
    expect(urls).toContain(`${SITE_URL}/gigs/2026/07`);
    expect(urls).toContain(`${SITE_URL}/gigs/2026/06`);
    expect(urls).toContain(`${SITE_URL}/venues/the-bird`);
    expect(urls).toContain(buildGigDetailUrl("alt-thursdays"));
    expect(urls).toContain(buildGigDetailUrl("cancelled-show"));
    expect(urls).not.toContain(buildGigDetailUrl("expired-show"));
    expect(
      sitemap.find((entry) => entry.url === buildGigDetailUrl("alt-thursdays"))
    ).toMatchObject({ lastModified: new Date(lastModified) });
    expect(sitemap.every((entry) => !("priority" in entry))).toBe(true);
    expect(sitemap.every((entry) => !("changeFrequency" in entry))).toBe(true);
    expect(sitemap.map((entry) => entry.url).join(" ")).not.toContain("?date=");
    expect(sitemap.map((entry) => entry.url).join(" ")).not.toContain("?q=");
  });

  it("marks faceted homepage URLs noindex while keeping canonical metadata indexable", () => {
    expect(shouldNoIndexHomepage({ date: "2026-07-20" })).toBe(true);
    expect(shouldNoIndexHomepage({ q: "jazz", venue: ["the-bird"] })).toBe(
      true
    );
    expect(shouldNoIndexHomepage({ utm_source: "newsletter" })).toBe(false);
    expect(
      buildPublicPageMetadata({
        description: "A page description.",
        index: false,
        path: "/tonight",
        title: "Tonight"
      })
    ).toMatchObject({
      alternates: { canonical: "/tonight" },
      openGraph: { title: "Tonight", url: "/tonight" },
      robots: { follow: true, index: false }
    });
  });

  it("builds WebSite and Organization structured data", () => {
    const structuredData = buildSiteStructuredData();

    expect(structuredData["@context"]).toBe("https://schema.org");
    expect(structuredData["@graph"]).toHaveLength(2);
    expect(structuredData["@graph"]).toContainEqual(
      expect.objectContaining({
        "@id": `${SITE_URL}/#website`,
        "@type": "WebSite",
        description: SITE_DESCRIPTION,
        name: SITE_TITLE,
        publisher: { "@id": `${SITE_URL}/#organization` },
        url: SITE_URL
      })
    );
    expect(JSON.stringify(structuredData)).not.toContain("SearchAction");
    expect(structuredData["@graph"]).toContainEqual(
      expect.objectContaining({
        "@id": `${SITE_URL}/#organization`,
        "@type": "Organization",
        logo: SITE_LOGO_URL,
        name: SITE_TITLE,
        url: SITE_URL
      })
    );
  });

  it("serializes site structured data safely for JSON-LD script injection", () => {
    const serialized = buildSiteStructuredDataJson();

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script");
    expect(JSON.parse(serialized)).toEqual(buildSiteStructuredData());
  });
});
