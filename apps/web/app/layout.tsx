import type { Metadata } from "next";
import { mantineHtmlProps } from "@mantine/core";

import "@mantine/core/styles.layer.css";
import "./globals.css";
import { getAppColorSchemeScript } from "@/lib/color-scheme";
import {
  buildSiteStructuredDataJson,
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
    title: SITE_TITLE,
    type: "website",
    url: "/"
  },
  title: SITE_TITLE,
  twitter: {
    card: "summary",
    description: SITE_DESCRIPTION,
    images: [SITE_LOGO_PATH],
    title: SITE_TITLE
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getAppColorSchemeScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: buildSiteStructuredDataJson() }}
          type="application/ld+json"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
