import type { Metadata } from "next";
import { mantineHtmlProps } from "@mantine/core";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { SiteFooter } from "@/components/site-footer";

import "@mantine/core/styles.layer.css";
import "./globals.css";
import {
  DEFAULT_APP_COLOR_SCHEME,
  getAppColorSchemeScript,
  getAppFirstPaintBackgroundStyle
} from "@/lib/color-scheme";
import {
  buildSiteStructuredDataJson,
  HOMEPAGE_TITLE,
  SITE_DESCRIPTION,
  SITE_FAVICON_PATH,
  SITE_LOGO_HEIGHT,
  SITE_LOGO_PATH,
  SITE_LOGO_WIDTH,
  SITE_TITLE,
  SITE_URL
} from "@/lib/seo";

import { AppProviders } from "./providers";

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  },
  description: SITE_DESCRIPTION,
  icons: {
    apple: [
      {
        sizes: `${SITE_LOGO_WIDTH}x${SITE_LOGO_HEIGHT}`,
        type: "image/png",
        url: SITE_LOGO_PATH
      }
    ],
    icon: [
      {
        type: "image/svg+xml",
        url: SITE_FAVICON_PATH
      }
    ]
  },
  metadataBase: new URL(SITE_URL),
  openGraph: {
    description: SITE_DESCRIPTION,
    images: [
      {
        alt: "Gig Radar logo",
        height: SITE_LOGO_HEIGHT,
        url: SITE_LOGO_PATH,
        width: SITE_LOGO_WIDTH
      }
    ],
    siteName: SITE_TITLE,
    title: HOMEPAGE_TITLE,
    type: "website",
    url: "/"
  },
  title: HOMEPAGE_TITLE,
  twitter: {
    card: "summary",
    description: SITE_DESCRIPTION,
    images: [SITE_LOGO_PATH],
    title: HOMEPAGE_TITLE
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      {...mantineHtmlProps}
      data-mantine-color-scheme={DEFAULT_APP_COLOR_SCHEME}
      lang="en"
    >
      <head>
        <style
          dangerouslySetInnerHTML={{ __html: getAppFirstPaintBackgroundStyle() }}
          id="app-first-paint-background"
        />
        <Script
          dangerouslySetInnerHTML={{ __html: getAppColorSchemeScript() }}
          id="app-color-scheme"
          strategy="beforeInteractive"
        />
        <script
          dangerouslySetInnerHTML={{ __html: buildSiteStructuredDataJson() }}
          id="site-structured-data"
          type="application/ld+json"
        />
      </head>
      <body>
        <AppProviders>
          {children}
          <SiteFooter />
        </AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
