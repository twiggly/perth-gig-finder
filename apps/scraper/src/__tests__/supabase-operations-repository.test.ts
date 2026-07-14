import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseOperationsRepository } from "../supabase-store/operations-repository";
import { createGigForSource } from "./helpers/run-source-fixtures";

interface VenueRowFixture {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  address: string | null;
  website_url: string | null;
}

function createVenueClient(preloadedRows: VenueRowFixture[]) {
  const lookupBySlug = vi.fn(async () => ({ data: null, error: null }));
  const preloadBySlugs = vi.fn(async () => ({
    data: preloadedRows,
    error: null
  }));
  const single = vi.fn(async () => ({
    data: { id: "venue-upserted", slug: "milk-bar" },
    error: null
  }));
  const selectAfterUpsert = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select: selectAfterUpsert }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      in: preloadBySlugs,
      eq: vi.fn(() => ({ maybeSingle: lookupBySlug }))
    })),
    upsert
  }));

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    lookupBySlug,
    preloadBySlugs,
    upsert
  };
}

function createVenueGig(
  overrides: Parameters<typeof createGigForSource>[0] = {
    sourceSlug: "test-source",
    externalId: "event-1",
    sourceUrl: "https://example.test/events/1",
    title: "Example event",
    status: "active"
  }
) {
  return createGigForSource(overrides);
}

describe("SupabaseOperationsRepository venue preloading", () => {
  it("skips lookups and writes when preloaded metadata already matches", async () => {
    const fixture = createVenueClient([
      {
        id: "venue-1",
        slug: "milk-bar",
        name: "Milk Bar",
        suburb: "Inglewood",
        address: "981 Beaufort Street",
        website_url: "https://milkbarperth.com.au"
      }
    ]);
    const repository = new SupabaseOperationsRepository(
      fixture.client,
      new Map(),
      new Map()
    );
    const gig = createVenueGig();

    await repository.preloadVenues([gig]);
    await repository.upsertVenue(gig);

    expect(fixture.preloadBySlugs).toHaveBeenCalledWith("slug", ["milk-bar"]);
    expect(fixture.lookupBySlug).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
    expect(fixture.from).toHaveBeenCalledTimes(1);
  });

  it("skips a redundant lookup for venues known to be new", async () => {
    const fixture = createVenueClient([]);
    const repository = new SupabaseOperationsRepository(
      fixture.client,
      new Map(),
      new Map()
    );
    const gig = createVenueGig();

    await repository.preloadVenues([gig]);
    await repository.upsertVenue(gig);

    expect(fixture.lookupBySlug).not.toHaveBeenCalled();
    expect(fixture.upsert).toHaveBeenCalledOnce();
    expect(fixture.from).toHaveBeenCalledTimes(2);
  });

  it("writes conflicting same-run metadata while preserving the known website", async () => {
    const fixture = createVenueClient([
      {
        id: "venue-1",
        slug: "milk-bar",
        name: "Milk Bar",
        suburb: "Inglewood",
        address: "981 Beaufort Street",
        website_url: "https://milkbarperth.com.au"
      }
    ]);
    const repository = new SupabaseOperationsRepository(
      fixture.client,
      new Map(),
      new Map()
    );
    const originalGig = createVenueGig();
    const changedGig = createVenueGig({
      sourceSlug: "test-source",
      externalId: "event-2",
      sourceUrl: "https://example.test/events/2",
      title: "Second event",
      status: "active",
      venueAddress: "981-985 Beaufort Street",
      venueWebsiteUrl: null
    });

    await repository.preloadVenues([originalGig, changedGig]);
    await repository.upsertVenue(originalGig);
    await repository.upsertVenue(changedGig);

    expect(fixture.lookupBySlug).not.toHaveBeenCalled();
    expect(fixture.upsert).toHaveBeenCalledWith(
      {
        slug: "milk-bar",
        name: "Milk Bar",
        suburb: "Inglewood",
        address: "981-985 Beaufort Street",
        website_url: "https://milkbarperth.com.au"
      },
      { onConflict: "slug" }
    );
  });
});
