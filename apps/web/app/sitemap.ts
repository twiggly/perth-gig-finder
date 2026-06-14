import type { MetadataRoute } from "next";

import { listGigSitemapEntries } from "@/lib/gigs";
import { buildSitemap } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const gigs = isSupabaseConfigured() ? await listGigSitemapEntries() : [];

  return buildSitemap(gigs);
}
