import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseTixelEnrichmentStore } from "../tixel-enrichment/store";

describe("SupabaseTixelEnrichmentStore", () => {
  it("loads structured artist names for Tixel matching", async () => {
    const query = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({
        data: [
          {
            artist_names: ["Karnivool", "TesseracT", "Car Bomb"],
            id: "gig-id",
            starts_at: "2026-07-18T10:00:00.000Z",
            title: "Karnivool ‘In Verses’ Australian Tour",
            tixel_url: null,
            venue_name: "Ice Cream Factory",
            venue_slug: "ice-cream-factory"
          }
        ],
        error: null
      }),
      select: vi.fn()
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const client = {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient;
    const store = new SupabaseTixelEnrichmentStore(client);

    await expect(
      store.listUpcomingPublicGigs("2026-07-16T00:00:00.000Z")
    ).resolves.toEqual([
      {
        artistNames: ["Karnivool", "TesseracT", "Car Bomb"],
        id: "gig-id",
        startsAt: "2026-07-18T10:00:00.000Z",
        title: "Karnivool ‘In Verses’ Australian Tour",
        tixelUrl: null,
        venueName: "Ice Cream Factory",
        venueSlug: "ice-cream-factory"
      }
    ]);
    expect(client.from).toHaveBeenCalledWith("gig_cards");
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("artist_names")
    );
  });
});
