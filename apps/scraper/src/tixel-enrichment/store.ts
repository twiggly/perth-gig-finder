import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "../supabase-admin-client";
import { retryTransientSupabaseOperation } from "../supabase-retry";
import type {
  TixelEnrichmentGig,
  TixelEnrichmentStore,
  TixelUrlChange
} from "./types";

const PAGE_SIZE = 1_000;
const TIXEL_GIG_SELECT =
  "id, title, starts_at, artist_names, venue_name, venue_slug, tixel_url";

interface TixelGigRow {
  artist_names: string[] | null;
  id: string;
  starts_at: string;
  title: string;
  tixel_url: string | null;
  venue_name: string;
  venue_slug: string;
}

export class SupabaseTixelEnrichmentStore implements TixelEnrichmentStore {
  constructor(
    private readonly client: SupabaseClient = createSupabaseAdminClient()
  ) {}

  async listUpcomingPublicGigs(nowIso: string): Promise<TixelEnrichmentGig[]> {
    const rows: TixelGigRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.client
        .from("gig_cards")
        .select(TIXEL_GIG_SELECT)
        .eq("status", "active")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(
          `Unable to list gigs for Tixel enrichment: ${error.message}`
        );
      }

      const page = (data ?? []) as TixelGigRow[];
      rows.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }
    }

    return rows.map((row) => ({
      artistNames: row.artist_names ?? [],
      id: row.id,
      startsAt: row.starts_at,
      title: row.title,
      tixelUrl: row.tixel_url,
      venueName: row.venue_name,
      venueSlug: row.venue_slug
    }));
  }

  async applyTixelUrlChanges(changes: TixelUrlChange[]): Promise<void> {
    const orderedChanges = [
      ...changes.filter((change) => change.tixelUrl === null),
      ...changes.filter((change) => change.tixelUrl !== null)
    ];

    for (const change of orderedChanges) {
      await retryTransientSupabaseOperation(async () => {
        const { data, error } = await this.client
          .from("gigs")
          .update({ tixel_url: change.tixelUrl })
          .eq("id", change.gigId)
          .select("id")
          .maybeSingle();

        if (error) {
          throw new Error(`Unable to update a Tixel link: ${error.message}`);
        }

        if (!data) {
          throw new Error("Unable to update a Tixel link: gig was not found");
        }
      });
    }
  }
}
