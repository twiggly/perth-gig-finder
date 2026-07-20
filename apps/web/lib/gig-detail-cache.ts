import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { getGigBySlug } from "./gigs";

const GIG_DETAIL_REVALIDATE_SECONDS = 300;

const getGigBySlugCached = unstable_cache(
  (slug: string) => getGigBySlug(slug),
  ["public-gig-detail"],
  { revalidate: GIG_DETAIL_REVALIDATE_SECONDS }
);

export const getCachedGigBySlug = cache((slug: string) =>
  getGigBySlugCached(slug)
);
