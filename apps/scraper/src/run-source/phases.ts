import { buildGigSlug, type NormalizedGig } from "@perth-gig-finder/shared";

import type { GigStore, SourceRecord } from "../types";
import {
  getErrorMessage,
  getOperationErrorMessage
} from "../source-utils/errors";
import { processGig } from "./process-gig";
import { nowIso } from "./result";

export interface SourceRunState {
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  errors: string[];
  retainedIdentityKeys: Set<string>;
  touchedGigIds: Set<string>;
  reusedSourceGigIds: Set<string>;
  hadPostProcessingError: boolean;
}

export async function processSourceListings(input: {
  store: GigStore;
  source: SourceRecord;
  gigs: NormalizedGig[];
  parseFailures: number;
}): Promise<SourceRunState> {
  const state: SourceRunState = {
    insertedCount: 0,
    updatedCount: 0,
    failedCount: input.parseFailures,
    errors: [],
    retainedIdentityKeys: new Set(),
    touchedGigIds: new Set(),
    reusedSourceGigIds: new Set(),
    hadPostProcessingError: false
  };

  for (const gig of input.gigs) {
    try {
      const result = await processGig(input.store, input.source, {
        ...gig,
        venue: {
          ...gig.venue,
          slug: gig.venue.slug || buildGigSlug({
            venueSlug: "venue",
            startsAt: gig.startsAt,
            title: gig.venue.name
          })
        }
      });

      state.retainedIdentityKeys.add(gig.externalId ?? gig.checksum);

      if (result.changed) {
        state.touchedGigIds.add(result.gigId);
      } else if (result.sourceGigId) {
        state.reusedSourceGigIds.add(result.sourceGigId);
      }

      if (result.outcome === "inserted") {
        state.insertedCount += 1;
      } else {
        state.updatedCount += 1;
      }
    } catch (error) {
      state.failedCount += 1;
      state.errors.push(getErrorMessage(error, "Unexpected gig error"));
    }
  }

  return state;
}

export async function runSourcePostProcessing(input: {
  store: GigStore;
  sourceId: string;
  gigCount: number;
  state: SourceRunState;
}): Promise<void> {
  const { state } = input;

  if (state.reusedSourceGigIds.size > 0) {
    try {
      await input.store.touchSourceGigsSeen([...state.reusedSourceGigIds], nowIso());
    } catch (error) {
      state.hadPostProcessingError = true;
      state.errors.push(
        getOperationErrorMessage({
          error,
          prefix: "Unable to mark unchanged source gigs as seen",
          fallback: "Unable to mark unchanged source gigs as seen"
        })
      );
    }
  }

  if (state.failedCount === 0 && input.gigCount > 0) {
    try {
      await input.store.pruneStaleUpcomingSourceGigs({
        sourceId: input.sourceId,
        retainedIdentityKeys: [...state.retainedIdentityKeys]
      });
    } catch (error) {
      state.hadPostProcessingError = true;
      state.errors.push(
        getOperationErrorMessage({
          error,
          prefix: "Unable to prune stale source gigs",
          fallback: "Unable to prune stale source gigs"
        })
      );
    }
  }

  if (state.touchedGigIds.size > 0) {
    try {
      await input.store.syncGigArtistsFromSourceGigs([...state.touchedGigIds]);
    } catch (error) {
      state.hadPostProcessingError = true;
      state.errors.push(
        getOperationErrorMessage({
          error,
          prefix: "Unable to sync canonical artists",
          fallback: "Unable to sync canonical artists"
        })
      );
    }
  }
}
