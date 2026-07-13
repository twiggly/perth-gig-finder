import { describe, expect, it } from "vitest";

import {
  buildGigDetailUrl,
  buildRobotsConfig,
  buildSitemap,
  buildSiteStructuredData,
  buildSiteStructuredDataJson,
  HOMEPAGE_TITLE,
  SITE_DESCRIPTION,
  SITE_LOGO_URL,
  SITE_SEARCH_URL_TEMPLATE,
  SITE_SITEMAP_URL,
  SITE_TITLE,
  SITE_URL
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

  it("builds the sitemap with the canonical homepage and future gig URLs", () => {
    const sitemap = buildSitemap([{ slug: "alt-thursdays" }]);

    expect(sitemap).toEqual([
      {
        changeFrequency: "daily",
        priority: 1,
        url: `${SITE_URL}/`
      },
      {
        changeFrequency: "daily",
        priority: 0.8,
        url: buildGigDetailUrl("alt-thursdays")
      }
    ]);
    expect(sitemap.map((entry) => entry.url).join(" ")).not.toContain("?date=");
    expect(sitemap.map((entry) => entry.url).join(" ")).not.toContain("?q=");
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
        potentialAction: expect.objectContaining({
          "@type": "SearchAction",
          "query-input": "required name=search_term_string",
          target: {
            "@type": "EntryPoint",
            urlTemplate: SITE_SEARCH_URL_TEMPLATE
          }
        }),
        url: SITE_URL
      })
    );
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
