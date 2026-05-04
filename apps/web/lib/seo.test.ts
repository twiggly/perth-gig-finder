import { describe, expect, it } from "vitest";

import {
  buildRobotsConfig,
  buildSitemap,
  buildSiteStructuredData,
  SITE_LOGO_URL,
  SITE_SEARCH_URL_TEMPLATE,
  SITE_SITEMAP_URL,
  SITE_TITLE,
  SITE_URL
} from "./seo";

describe("SEO helpers", () => {
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

  it("builds the first-slice sitemap with only the canonical homepage", () => {
    expect(buildSitemap()).toEqual([
      {
        changeFrequency: "daily",
        priority: 1,
        url: `${SITE_URL}/`
      }
    ]);
  });

  it("builds WebSite and Organization structured data", () => {
    const structuredData = buildSiteStructuredData();

    expect(structuredData["@context"]).toBe("https://schema.org");
    expect(structuredData["@graph"]).toHaveLength(2);
    expect(structuredData["@graph"]).toContainEqual(
      expect.objectContaining({
        "@id": `${SITE_URL}/#website`,
        "@type": "WebSite",
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
});
