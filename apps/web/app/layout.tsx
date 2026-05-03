import type { Metadata } from "next";
import { mantineHtmlProps } from "@mantine/core";

import "@mantine/core/styles.layer.css";
import "./globals.css";
import { getAppColorSchemeScript } from "@/lib/color-scheme";

import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "Perth Gig Finder",
  description:
    "A local-first gig guide for Perth, built from normalized venue listings."
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
