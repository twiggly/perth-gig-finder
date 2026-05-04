import type { Metadata } from "next";
import { mantineHtmlProps } from "@mantine/core";

import "@mantine/core/styles.layer.css";
import "./globals.css";
import { getAppColorSchemeScript } from "@/lib/color-scheme";

import { AppProviders } from "./providers";

const siteUrl = new URL("https://gigradar.com.au");
const siteTitle = "Gig Radar";
const siteDescription =
  "A local-first gig guide for Perth, built from normalized venue listings.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  },
  description: siteDescription,
  icons: {
    apple: [
      {
        sizes: "196x196",
        type: "image/png",
        url: "/logo.png"
      }
    ],
    icon: [
      {
        type: "image/svg+xml",
        url: "/favicon.svg"
      }
    ]
  },
  metadataBase: siteUrl,
  openGraph: {
    description: siteDescription,
    images: [
      {
        alt: "Gig Radar logo",
        height: 196,
        url: "/logo.png",
        width: 196
      }
    ],
    siteName: siteTitle,
    title: siteTitle,
    type: "website",
    url: "/"
  },
  title: siteTitle,
  twitter: {
    card: "summary",
    description: siteDescription,
    images: ["/logo.png"],
    title: siteTitle
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
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
