import type { MetadataRoute } from "next";

export const SITE_URL = "https://gigradar.com.au";
export const SITE_TITLE = "Gig Radar";
export const SITE_DESCRIPTION =
  "A local-first gig guide for Perth, built from normalized venue listings.";
export const SITE_LOGO_PATH = "/logo.png";
export const SITE_FAVICON_PATH = "/favicon.svg";
export const SITE_LOGO_WIDTH = 196;
export const SITE_LOGO_HEIGHT = 196;
export const SITE_LOGO_URL = `${SITE_URL}${SITE_LOGO_PATH}`;
export const SITE_SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
export const SITE_SEARCH_URL_TEMPLATE = `${SITE_URL}/?q={search_term_string}`;

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

export function buildSitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "daily",
      priority: 1,
      url: `${SITE_URL}/`
    }
  ];
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
        potentialAction: {
          "@type": "SearchAction",
          "query-input": "required name=search_term_string",
          target: {
            "@type": "EntryPoint",
            urlTemplate: SITE_SEARCH_URL_TEMPLATE
          }
        },
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
  return JSON.stringify(buildSiteStructuredData());
}
