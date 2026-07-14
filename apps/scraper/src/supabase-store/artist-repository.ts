import {
  type ArtistExtractionKind,
  type JsonValue,
  slugify
} from "@perth-gig-finder/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeArtistNames,
  selectCanonicalArtistNames,
  selectPreferredArtistDisplayName
} from "../artist-utils";
import { retryTransientSupabaseOperation } from "../supabase-retry";
import type { SourceAdapter, SourceRecord } from "../types";

interface ArtistRow {
  id: string;
  name: string;
  slug: string;
}

interface ArtistNameRow {
  name: string;
  slug: string;
}

interface CanonicalGigArtistRow {
  gig_id: string;
  source_id: string;
  artist_names: string[] | null;
  artist_extraction_kind: ArtistExtractionKind;
  last_seen_at: string;
}

interface RepairableSourceGigRow {
  id: string;
  gig_id: string;
  source_id: string;
  raw_payload: JsonValue;
  artist_names: string[] | null;
  artist_extraction_kind: ArtistExtractionKind;
}

interface CurrentGigArtistRow {
  gig_id: string;
  sort_order: number | null;
  artists: ArtistNameRow | ArtistNameRow[] | null;
}

interface CanonicalArtistSyncCandidate {
  artists: string[];
  artistExtractionKind: ArtistExtractionKind;
  priority: number;
  lastSeenAt: string;
}

export interface GigArtistWritePlanItem {
  gigId: string;
  artistNames: string[];
}

const QUERY_CHUNK_SIZE = 100;

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getJoinedArtistName(row: CurrentGigArtistRow): string | null {
  const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists;
  const normalized = (artist?.name ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function planGigArtistWrites(input: {
  gigIds: string[];
  candidatesByGigId: Map<string, CanonicalArtistSyncCandidate[]>;
  currentArtistNamesByGigId: Map<string, string[]>;
}): GigArtistWritePlanItem[] {
  return [...new Set(input.gigIds)].flatMap((gigId) => {
    const desiredArtistNames = selectCanonicalArtistNames(
      input.candidatesByGigId.get(gigId) ?? []
    );
    const currentStoredArtistNames = (input.currentArtistNamesByGigId.get(gigId) ?? [])
      .map((artist) => artist.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const currentArtistNames = normalizeArtistNames(currentStoredArtistNames);

    if (
      areStringArraysEqual(currentArtistNames, desiredArtistNames) &&
      areStringArraysEqual(currentStoredArtistNames, desiredArtistNames)
    ) {
      return [];
    }

    return [
      {
        gigId,
        artistNames: desiredArtistNames
      }
    ];
  });
}

type EnsureSource = (input: {
  slug: string;
  name: string;
  baseUrl: string;
  priority: number;
  isPublicListingSource: boolean;
}) => Promise<SourceRecord>;

type LoadSourcePriorities = (sourceIds: string[]) => Promise<Map<string, number>>;

export class SupabaseArtistRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly ensureSource: EnsureSource,
    private readonly loadSourcePriorities: LoadSourcePriorities
  ) {}

  private async listCanonicalCandidatesByGigId(
    gigIds: string[]
  ): Promise<Map<string, CanonicalGigArtistRow[]>> {
    const uniqueGigIds = [...new Set(gigIds)];

    if (uniqueGigIds.length === 0) {
      return new Map();
    }

    const rows: CanonicalGigArtistRow[] = [];

    for (const gigIdChunk of chunkValues(uniqueGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("gig_id, source_id, artist_names, artist_extraction_kind, last_seen_at")
        .in("gig_id", gigIdChunk);

      if (error) {
        throw new Error(
          `Unable to load canonical gig artist candidates: ${error.message ?? "unknown error"}`
        );
      }

      rows.push(...(((data as CanonicalGigArtistRow[] | null) ?? [])));
    }

    const grouped = new Map<string, CanonicalGigArtistRow[]>();

    for (const row of rows) {
      const existing = grouped.get(row.gig_id) ?? [];
      existing.push(row);
      grouped.set(row.gig_id, existing);
    }

    return grouped;
  }

  private async writeGigArtists(gigId: string, artists: string[]): Promise<void> {
    await retryTransientSupabaseOperation(async () => {
      const normalizedArtists = normalizeArtistNames(artists);
      const uniqueArtistsBySlug = new Map<string, string>();

      for (const artist of normalizedArtists) {
        const artistSlug = slugify(artist);

        if (!artistSlug || uniqueArtistsBySlug.has(artistSlug)) {
          continue;
        }

        uniqueArtistsBySlug.set(artistSlug, artist);
      }

      const artistSlugs = [...uniqueArtistsBySlug.keys()];
      const existingArtistNamesBySlug = new Map<string, string>();

      if (artistSlugs.length > 0) {
        const { data, error } = await this.client
          .from("artists")
          .select("name, slug")
          .in("slug", artistSlugs);

        if (error) {
          throw new Error(
            `Unable to load existing artists: ${error.message ?? "unknown error"}`
          );
        }

        for (const artist of (data as ArtistNameRow[] | null) ?? []) {
          existingArtistNamesBySlug.set(artist.slug, artist.name);
        }
      }

      const { error: deleteError } = await this.client
        .from("gig_artists")
        .delete()
        .eq("gig_id", gigId);

      if (deleteError) {
        throw new Error(`Unable to clear gig artists: ${deleteError.message}`);
      }

      if (uniqueArtistsBySlug.size === 0) {
        return;
      }

      const artistRows: ArtistRow[] = [];

      for (const [artistSlug, artistName] of uniqueArtistsBySlug.entries()) {
        const preferredArtistName = selectPreferredArtistDisplayName(
          existingArtistNamesBySlug.get(artistSlug),
          artistName
        );
        const { data, error } = await this.client
          .from("artists")
          .upsert(
            {
              name: preferredArtistName,
              slug: artistSlug
            },
            { onConflict: "slug" }
          )
          .select("id, name, slug")
          .single<ArtistRow>();

        if (error || !data) {
          throw new Error(`Unable to upsert artist: ${error?.message ?? "unknown error"}`);
        }

        artistRows.push(data);
      }

      const uniqueArtistRows = [
        ...new Map(artistRows.map((artist) => [artist.id, artist])).values()
      ];
      const { error: joinError } = await this.client.from("gig_artists").insert(
        uniqueArtistRows.map((artist, index) => ({
          gig_id: gigId,
          artist_id: artist.id,
          sort_order: index
        }))
      );

      if (joinError) {
        throw new Error(`Unable to create gig artist rows: ${joinError.message}`);
      }
    });
  }

  private async listCurrentNamesByGigId(
    gigIds: string[]
  ): Promise<Map<string, string[]>> {
    const rows: CurrentGigArtistRow[] = [];

    for (const gigIdChunk of chunkValues([...new Set(gigIds)], QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("gig_artists")
        .select("gig_id, sort_order, artists(name, slug)")
        .in("gig_id", gigIdChunk);

      if (error) {
        throw new Error(
          `Unable to load current gig artists: ${error.message ?? "unknown error"}`
        );
      }

      rows.push(...(((data as CurrentGigArtistRow[] | null) ?? [])));
    }

    const rowsByGigId = new Map<string, CurrentGigArtistRow[]>();

    for (const row of rows) {
      rowsByGigId.set(row.gig_id, [...(rowsByGigId.get(row.gig_id) ?? []), row]);
    }

    return new Map(
      [...rowsByGigId.entries()].map(([gigId, gigRows]) => [
        gigId,
        gigRows
          .slice()
          .sort((left, right) => {
            const sortOrderDiff =
              (left.sort_order ?? Number.MAX_SAFE_INTEGER) -
              (right.sort_order ?? Number.MAX_SAFE_INTEGER);

            if (sortOrderDiff !== 0) {
              return sortOrderDiff;
            }

            return (getJoinedArtistName(left) ?? "").localeCompare(
              getJoinedArtistName(right) ?? "",
              "en-AU"
            );
          })
          .map((row) => getJoinedArtistName(row))
          .filter((artist): artist is string => Boolean(artist))
      ])
    );
  }

  async syncFromSourceGigs(gigIds: string[]): Promise<void> {
    const uniqueGigIds = [...new Set(gigIds)];

    if (uniqueGigIds.length === 0) {
      return;
    }

    const candidatesByGigId = await this.listCanonicalCandidatesByGigId(uniqueGigIds);
    const sourcePriorityById = await this.loadSourcePriorities(
      [...new Set(
        [...candidatesByGigId.values()]
          .flat()
          .map((candidate) => candidate.source_id)
      )]
    );
    const syncCandidatesByGigId = new Map<string, CanonicalArtistSyncCandidate[]>();

    for (const gigId of uniqueGigIds) {
      const candidates = (candidatesByGigId.get(gigId) ?? []).map((candidate) => ({
        artists: candidate.artist_names ?? [],
        artistExtractionKind: candidate.artist_extraction_kind,
        priority: sourcePriorityById.get(candidate.source_id) ?? 0,
        lastSeenAt: candidate.last_seen_at
      }));

      syncCandidatesByGigId.set(gigId, candidates);
    }

    const currentArtistNamesByGigId = await this.listCurrentNamesByGigId(uniqueGigIds);
    const writePlan = planGigArtistWrites({
      gigIds: uniqueGigIds,
      candidatesByGigId: syncCandidatesByGigId,
      currentArtistNamesByGigId
    });

    for (const item of writePlan) {
      await this.writeGigArtists(item.gigId, item.artistNames);
    }
  }

  async repairActiveUpcoming(
    sources: readonly SourceAdapter[]
  ): Promise<
    Array<{
      sourceSlug: string;
      status: "success" | "partial" | "failed";
      discoveredCount: number;
      updatedCount: number;
      failedCount: number;
    }>
  > {
    const sourceRecords = await Promise.all(
      sources.map((source) =>
        this.ensureSource({
          slug: source.slug,
          name: source.name,
          baseUrl: source.baseUrl,
          priority: source.priority,
          isPublicListingSource: source.isPublicListingSource
        })
      )
    );
    const sourceById = new Map(
      sourceRecords.map((record) => [record.id, sources.find((source) => source.slug === record.slug)!])
    );
    const nowIsoValue = new Date().toISOString();
    const { data: activeGigData, error: activeGigError } = await this.client
      .from("gigs")
      .select("id")
      .eq("status", "active")
      .gte("starts_at", nowIsoValue);

    if (activeGigError) {
      throw new Error(
        `Unable to load active gigs for artist repair: ${activeGigError.message ?? "unknown error"}`
      );
    }

    const activeGigIds = ((activeGigData as Array<{ id: string }> | null) ?? []).map(
      (gig) => gig.id
    );

    if (activeGigIds.length === 0) {
      return sources.map((source) => ({
        sourceSlug: source.slug,
        status: "success",
        discoveredCount: 0,
        updatedCount: 0,
        failedCount: 0
      }));
    }

    const sourceIds = sourceRecords.map((record) => record.id);
    const repairableRows: RepairableSourceGigRow[] = [];

    for (const gigIdChunk of chunkValues(activeGigIds, QUERY_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select(
          "id, gig_id, source_id, raw_payload, artist_names, artist_extraction_kind"
        )
        .in("gig_id", gigIdChunk)
        .in("source_id", sourceIds);

      if (error) {
        throw new Error(
          `Unable to load source gigs for artist repair: ${error.message ?? "unknown error"}`
        );
      }

      repairableRows.push(...(((data as RepairableSourceGigRow[] | null) ?? [])));
    }

    const resultsBySlug = new Map<
      string,
      {
        sourceSlug: string;
        discoveredCount: number;
        updatedCount: number;
        failedCount: number;
      }
    >(
      sources.map((source) => [
        source.slug,
        {
          sourceSlug: source.slug,
          discoveredCount: 0,
          updatedCount: 0,
          failedCount: 0
        }
      ])
    );
    const touchedGigIds = new Set<string>();

    for (const row of repairableRows) {
      const source = sourceById.get(row.source_id);

      if (!source) {
        continue;
      }

      const result = resultsBySlug.get(source.slug)!;
      result.discoveredCount += 1;

      try {
        const extraction = source.repairArtists
          ? source.repairArtists(row.raw_payload)
          : {
              artists: [],
              artistExtractionKind: "unknown" as const
            };
        const normalizedArtists = normalizeArtistNames(extraction.artists);
        const nextKind =
          normalizedArtists.length === 0 ? "unknown" : extraction.artistExtractionKind;
        const currentStoredArtists = (row.artist_names ?? [])
          .map((artist) => artist.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const currentArtists = normalizeArtistNames(row.artist_names ?? []);

        if (
          nextKind === row.artist_extraction_kind &&
          currentArtists.length === normalizedArtists.length &&
          currentArtists.every((artist, index) => artist === normalizedArtists[index]) &&
          currentStoredArtists.length === normalizedArtists.length &&
          currentStoredArtists.every((artist, index) => artist === normalizedArtists[index])
        ) {
          touchedGigIds.add(row.gig_id);
          continue;
        }

        const { error } = await this.client
          .from("source_gigs")
          .update({
            artist_names: normalizedArtists,
            artist_extraction_kind: nextKind
          })
          .eq("id", row.id);

        if (error) {
          throw new Error(error.message);
        }

        result.updatedCount += 1;
        touchedGigIds.add(row.gig_id);
      } catch {
        result.failedCount += 1;
      }
    }

    await this.syncFromSourceGigs([...touchedGigIds]);

    return [...resultsBySlug.values()].map((result) => ({
      ...result,
      status:
        result.updatedCount === 0 && result.failedCount > 0
          ? "failed"
          : result.failedCount > 0
            ? "partial"
            : "success"
    }));
  }
}
