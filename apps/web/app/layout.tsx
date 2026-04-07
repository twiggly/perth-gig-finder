import type { Metadata } from "next";

import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
