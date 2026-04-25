#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEFAULT_EXAMPLE_LIMIT = 10;
const DEFAULT_FUZZY_THRESHOLD = 0.72;
const EXPECTED_NO_IMAGE_SOURCE_NAMES = new Set(["The Bird"]);
const HTML_ENTITY_LEAK_PATTERN = /&(?:amp|apos|gt|lt|nbsp|quot|#\d+|#x[0-9a-f]+);/i;
const BROKEN_QUESTION_MARK_RUN_PATTERN = /\?{3,}/;
const ARTIST_DELIMITER_LEAK_PATTERN = /[•;]|(?:\s[|+]\s)|(?:··)/u;
const ARTIST_SENTENCE_FRAGMENT_PATTERN =
  /^(?:and\s+|ft\.?\s+|performed\s+by\s+|at\s+local\b|style$|shows?$|making\b|listen\b|tune\b|her\s+music\b|his\s+music\b|their\s+music\b|music\s+by\b|support\s+set\b|past$|present\s+members?$)/i;
const execFileAsync = promisify(execFile);

function printUsage() {
  console.log(`Usage:
  pnpm audit:gigs -- --url https://your-deployment.vercel.app
  pnpm audit:gigs -- --file /tmp/homepage.html
  pnpm audit:gigs -- --supabase
  pnpm audit:gigs -- --supabase --reconcile-sources

Options:
  --url <url>           Homepage URL to fetch. Falls back to AUDIT_GIGS_URL.
  --file <path>         Read a saved homepage HTML file instead of fetching.
  --supabase            Audit the Supabase gig_cards view using SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
  --reconcile-sources   With --supabase, compare source_gigs totals with active public gig_cards counts.
  --vercel              Fetch a protected Vercel deployment with vercel curl.
  --match <regex>       Include notable rows whose title matches the regex. Repeatable.
  --json                Print machine-readable JSON only.
  --strict              Treat warnings as failures.
  --limit <number>      Max examples per finding group. Default: ${DEFAULT_EXAMPLE_LIMIT}.
  --help                Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    file: null,
    json: false,
    limit: DEFAULT_EXAMPLE_LIMIT,
    matchPatterns: [],
    reconcileSources: false,
    strict: false,
    supabase: false,
    url: process.env.AUDIT_GIGS_URL ?? null,
    vercel: false
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--":
        break;
      case "--file":
        options.file = argv[++index] ?? null;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--limit":
        options.limit = Number(argv[++index] ?? "");
        break;
      case "--match":
        options.matchPatterns.push(argv[++index] ?? "");
        break;
      case "--reconcile-sources":
        options.reconcileSources = true;
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--supabase":
        options.supabase = true;
        break;
      case "--url":
        options.url = argv[++index] ?? null;
        break;
      case "--vercel":
        options.vercel = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }

        positional.push(arg);
        break;
    }
  }

  if (!options.url && positional[0]) {
    options.url = positional[0];
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (options.reconcileSources && !options.supabase) {
    throw new Error("--reconcile-sources requires --supabase.");
  }

  return options;
}

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Perth",
  year: "numeric"
});

function getPerthDateKey(value) {
  const parts = DAY_KEY_FORMATTER.formatToParts(new Date(value)).reduce((accumulator, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function groupRowsByDate(rows) {
  const groups = new Map();

  for (const row of rows) {
    const dateKey = getPerthDateKey(row.starts_at);
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), row]);
  }

  return [...groups.entries()].map(([dateKey, items]) => ({
    dateKey,
    items
  }));
}

function getSupabaseConfig({ requireServiceRole = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey =
    serviceRoleKey ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  if (requireServiceRole && !serviceRoleKey) {
    throw new Error(
      "--reconcile-sources requires SUPABASE_SERVICE_ROLE_KEY so private source_gigs rows can be audited."
    );
  }

  return {
    supabaseKey,
    supabaseUrl
  };
}

async function fetchSupabaseRows(supabaseUrl, supabaseKey, tableName, searchParams) {
  const url = new URL(`${supabaseUrl}/rest/v1/${tableName}`);

  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `Supabase ${tableName} request failed with status ${response.status}: ${await response.text()}`
    );
  }

  const rows = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error(`Supabase ${tableName} response was not an array.`);
  }

  return rows;
}

async function loadSupabasePayload() {
  const { supabaseKey, supabaseUrl } = getSupabaseConfig();
  const rows = await fetchSupabaseRows(supabaseUrl, supabaseKey, "gig_cards", {
    select: [
      "id",
      "slug",
      "title",
      "starts_at",
      "artist_names",
      "image_path",
      "source_image_url",
      "image_width",
      "image_height",
      "image_version",
      "ticket_url",
      "source_url",
      "source_name",
      "venue_slug",
      "venue_name",
      "venue_suburb",
      "venue_website_url",
      "status"
    ].join(","),
    status: "eq.active",
    starts_at: `gte.${new Date().toISOString()}`,
    order: "starts_at.asc",
    limit: "5000"
  });

  const normalizedRows = rows.map((row) => ({
    ...row,
    artist_names: Array.isArray(row.artist_names) ? row.artist_names : []
  }));
  const days = groupRowsByDate(normalizedRows);

  return {
    payload: {
      days,
      initialActiveDateKey: days[0]?.dateKey ?? null
    },
    target: {
      target: `${supabaseUrl}/rest/v1/gig_cards`,
      targetKind: "supabase"
    }
  };
}

function formatSourceReconciliationExample(row) {
  const gig = row.gigs ?? {};

  return {
    artists: Array.isArray(row.artist_names) ? row.artist_names : [],
    date: gig.starts_at ? getPerthDateKey(gig.starts_at) : null,
    sourceUrl: row.source_url,
    startsAt: gig.starts_at ?? null,
    status: gig.status ?? "unknown",
    title: gig.title ?? null,
    venue: gig.venues?.name ?? null
  };
}

function createEmptySourceReconciliationRow(source) {
  return {
    activeSourceGigCount: 0,
    activeSourceGigsNotPublicCardsCount: 0,
    cancelledCount: 0,
    hiddenByStatusCount: 0,
    hiddenByStatusExamples: [],
    postponedCount: 0,
    publicActiveCardCount: 0,
    sourceGigTotalCount: 0,
    sourceName: source.name,
    sourceSlug: source.slug ?? null
  };
}

async function loadSupabaseSourceReconciliation(payload, options) {
  const { supabaseKey, supabaseUrl } = getSupabaseConfig({ requireServiceRole: true });
  const activePublicRows = toGigRows(payload);
  const publicActiveCounts = new Map();

  for (const row of activePublicRows) {
    const sourceName = row.source_name ?? "(none)";
    publicActiveCounts.set(sourceName, (publicActiveCounts.get(sourceName) ?? 0) + 1);
  }

  const sourceGigRows = await fetchSupabaseRows(supabaseUrl, supabaseKey, "source_gigs", {
    select: [
      "source_url",
      "artist_names",
      "sources!inner(slug,name,priority,is_public_listing_source)",
      "gigs!inner(id,title,starts_at,status,venues(name,slug,suburb))"
    ].join(","),
    "sources.is_public_listing_source": "eq.true",
    "gigs.starts_at": `gte.${new Date().toISOString()}`,
    limit: "10000"
  });
  const bySourceName = new Map();

  for (const row of sourceGigRows) {
    const source = row.sources ?? {};
    const sourceName = source.name ?? "(unknown source)";
    const summary =
      bySourceName.get(sourceName) ??
      createEmptySourceReconciliationRow({
        name: sourceName,
        slug: source.slug
      });
    const status = row.gigs?.status ?? "unknown";

    summary.sourceGigTotalCount += 1;

    if (status === "active") {
      summary.activeSourceGigCount += 1;
    } else {
      summary.hiddenByStatusCount += 1;

      if (status === "postponed") {
        summary.postponedCount += 1;
      } else if (status === "cancelled") {
        summary.cancelledCount += 1;
      }

      if (summary.hiddenByStatusExamples.length < options.limit) {
        summary.hiddenByStatusExamples.push(formatSourceReconciliationExample(row));
      }
    }

    bySourceName.set(sourceName, summary);
  }

  for (const [sourceName, count] of publicActiveCounts) {
    const summary =
      bySourceName.get(sourceName) ??
      createEmptySourceReconciliationRow({
        name: sourceName,
        slug: null
      });

    summary.publicActiveCardCount = count;
    bySourceName.set(sourceName, summary);
  }

  const rows = [...bySourceName.values()]
    .map((summary) => ({
      ...summary,
      activeSourceGigsNotPublicCardsCount: Math.max(
        summary.activeSourceGigCount - summary.publicActiveCardCount,
        0
      )
    }))
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));

  return {
    generatedAt: new Date().toISOString(),
    rows,
    totals: rows.reduce(
      (totals, row) => ({
        activeSourceGigCount:
          totals.activeSourceGigCount + row.activeSourceGigCount,
        activeSourceGigsNotPublicCardsCount:
          totals.activeSourceGigsNotPublicCardsCount +
          row.activeSourceGigsNotPublicCardsCount,
        cancelledCount: totals.cancelledCount + row.cancelledCount,
        hiddenByStatusCount:
          totals.hiddenByStatusCount + row.hiddenByStatusCount,
        postponedCount: totals.postponedCount + row.postponedCount,
        publicActiveCardCount:
          totals.publicActiveCardCount + row.publicActiveCardCount,
        sourceGigTotalCount:
          totals.sourceGigTotalCount + row.sourceGigTotalCount
      }),
      {
        activeSourceGigCount: 0,
        activeSourceGigsNotPublicCardsCount: 0,
        cancelledCount: 0,
        hiddenByStatusCount: 0,
        postponedCount: 0,
        publicActiveCardCount: 0,
        sourceGigTotalCount: 0
      }
    )
  };
}

async function loadHtml(options) {
  if (options.file) {
    return {
      html: await readFile(options.file, "utf8"),
      target: options.file,
      targetKind: "file"
    };
  }

  if (!options.url) {
    throw new Error("Provide --url, --file, or AUDIT_GIGS_URL.");
  }

  if (options.vercel) {
    const { stdout } = await execFileAsync(
      "vercel",
      ["curl", "/", "--deployment", options.url, "--yes", "--", "--silent"],
      {
        maxBuffer: 50 * 1024 * 1024
      }
    );

    return {
      html: stdout,
      target: options.url,
      targetKind: "vercel"
    };
  }

  const response = await fetch(options.url, {
    headers: {
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    const vercelHint =
      response.status === 401 || response.status === 403
        ? " If this is a protected Vercel deployment, rerun with --vercel."
        : "";
    throw new Error(
      `Homepage request failed with status ${response.status}: ${options.url}.${vercelHint}`
    );
  }

  return {
    html: await response.text(),
    target: options.url,
    targetKind: "url"
  };
}

function extractJsonObjectAt(text, start) {
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("Could not extract homepage payload JSON object.");
}

function extractHomepagePayload(html) {
  const flightChunks = [...html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs)]
    .map((match) => {
      const parsed = JSON.parse(match[1]);
      return typeof parsed?.[1] === "string" ? parsed[1] : "";
    })
    .join("");
  const payloadStart = flightChunks.indexOf("{\"days\":[");

  if (payloadStart === -1) {
    throw new Error("Could not find the homepage days payload in the Next.js response.");
  }

  return JSON.parse(extractJsonObjectAt(flightChunks, payloadStart));
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(the|and|with|special|guests?|guest|support|supports?|from|live|at|present|presents|tour|perth|wa|australian|australia|2026)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitleKey(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .join(" ");
}

function tokenSet(value) {
  return new Set(normalizedTitleKey(value).split(" ").filter(Boolean));
}

function jaccard(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function toGigRows(payload) {
  return payload.days.flatMap((day) =>
    day.items.map((gig) => ({
      ...gig,
      artist_names: Array.isArray(gig.artist_names) ? gig.artist_names : [],
      dateKey: day.dateKey
    }))
  );
}

function getSourceCounts(gigs) {
  const sourceCounts = new Map();

  for (const gig of gigs) {
    const sourceName = gig.source_name ?? "(none)";
    sourceCounts.set(sourceName, (sourceCounts.get(sourceName) ?? 0) + 1);
  }

  return Object.fromEntries([...sourceCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function findExactDuplicates(gigs) {
  const groups = new Map();

  for (const gig of gigs) {
    const key = [gig.venue_slug, gig.starts_at, normalizedTitleKey(gig.title)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), gig]);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.map(formatGigSummary));
}

function findFuzzyDuplicates(gigs) {
  const byVenueDate = new Map();
  const duplicates = [];

  for (const gig of gigs) {
    const key = [gig.dateKey, gig.venue_slug].join("|");
    byVenueDate.set(key, [...(byVenueDate.get(key) ?? []), gig]);
  }

  for (const group of byVenueDate.values()) {
    if (group.length < 2) {
      continue;
    }

    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        const score = jaccard(left.title, right.title);
        const leftTitle = normalizedTitleKey(left.title);
        const rightTitle = normalizedTitleKey(right.title);
        const contains =
          leftTitle &&
          rightTitle &&
          (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle));

        if (score >= DEFAULT_FUZZY_THRESHOLD || contains) {
          duplicates.push({
            date: left.dateKey,
            score: Number(score.toFixed(2)),
            venue: left.venue_name,
            items: [formatGigSummary(left), formatGigSummary(right)]
          });
        }
      }
    }
  }

  return duplicates;
}

function formatGigSummary(gig) {
  return {
    artists: gig.artist_names,
    date: gig.dateKey,
    image: Boolean(
      (gig.image_path || gig.source_image_url) &&
        typeof gig.image_width === "number" &&
        gig.image_width > 0 &&
        typeof gig.image_height === "number" &&
        gig.image_height > 0
    ),
    source: gig.source_name,
    title: gig.title,
    venue: gig.venue_name
  };
}

function findArtistPlaceholderLeaks(gigs) {
  const placeholderPattern =
    /\b(?:special guest(?:s)?(?: to be announced)?|guest(?:s)?\s*(?:tba|tbc|to be announced)|support(?:s| acts?)?\s*(?:tba|tbc|to be announced)|more\s*(?:tba|tbc|to be announced)|to be announced|tba|tbc|homepage gallery|lineup announced soon|secret guest)\b/i;

  return gigs.flatMap((gig) =>
    gig.artist_names
      .filter((artist) => placeholderPattern.test(artist))
      .map((artist) => ({
        artist,
        date: gig.dateKey,
        source: gig.source_name,
        title: gig.title,
        venue: gig.venue_name
      }))
  );
}

function findPublicTextEncodingIssues(gigs) {
  return gigs.flatMap((gig) => {
    const fields = [];

    if (HTML_ENTITY_LEAK_PATTERN.test(gig.title ?? "")) {
      fields.push("title");
    }

    if (HTML_ENTITY_LEAK_PATTERN.test(gig.venue_name ?? "")) {
      fields.push("venue");
    }

    gig.artist_names.forEach((artist, index) => {
      if (HTML_ENTITY_LEAK_PATTERN.test(artist)) {
        fields.push(`artist_names[${index}]`);
      }
    });

    if (BROKEN_QUESTION_MARK_RUN_PATTERN.test(gig.title ?? "")) {
      fields.push("title_question_marks");
    }

    return fields.length > 0
      ? [
          {
            ...formatGigSummary(gig),
            fields
          }
        ]
      : [];
  });
}

function findArtistDelimiterLeaks(gigs) {
  return gigs.flatMap((gig) =>
    gig.artist_names
      .filter((artist) => ARTIST_DELIMITER_LEAK_PATTERN.test(artist))
      .map((artist) => ({
        ...formatGigSummary(gig),
        artist
      }))
  );
}

function findArtistSentenceFragmentCandidates(gigs) {
  return gigs.flatMap((gig) =>
    gig.artist_names
      .filter((artist) => ARTIST_SENTENCE_FRAGMENT_PATTERN.test(artist))
      .map((artist) => ({
        ...formatGigSummary(gig),
        artist
      }))
  );
}

function classifyImages(gigs) {
  const renderable = [];
  const expectedNoImage = [];
  const invalidMetadata = [];
  const noImage = [];

  for (const gig of gigs) {
    const hasUrl = Boolean(gig.image_path || gig.source_image_url);
    const hasDimensions =
      typeof gig.image_width === "number" &&
      gig.image_width > 0 &&
      typeof gig.image_height === "number" &&
      gig.image_height > 0;

    if (hasUrl && hasDimensions) {
      renderable.push(gig);
    } else if (hasUrl) {
      invalidMetadata.push({
        date: gig.dateKey,
        imagePath: gig.image_path,
        source: gig.source_name,
        sourceImageUrl: gig.source_image_url,
        title: gig.title,
        venue: gig.venue_name
      });
    } else if (EXPECTED_NO_IMAGE_SOURCE_NAMES.has(gig.source_name ?? "")) {
      expectedNoImage.push(formatGigSummary(gig));
    } else {
      noImage.push(formatGigSummary(gig));
    }
  }

  return {
    expectedNoImage,
    invalidMetadata,
    noImage,
    renderableCount: renderable.length
  };
}

function findNonMusicLeakageCandidates(gigs) {
  const nonMusicPattern =
    /\b(?:cocktail|ecstatic|wellness|workshop|networking|seminar|class|classes|social|catch up|market|markets|comedy|wrestling|boxing|expo|conference|meditation|breathwork|yoga|sound healing|bridgerton|ball)\b/i;
  const fundraiserPattern = /\bfundraiser\b/i;
  const musicFundraiserSignalPattern =
    /\b(?:band|bands|dj|live music|gig|concert|festival|supported by|support from|with support|featuring|feat\.?|ft\.?|lineup|album|single|launch|punk|metal|rock|jazz|folk|hip hop|electronic|techno|house|disco)\b/i;

  return gigs
    .filter((gig) => /Humanitix|Ticketek/.test(gig.source_name ?? ""))
    .filter((gig) => {
      const text = [
        gig.title,
        gig.description,
        gig.venue_name,
        gig.venue_suburb
      ]
        .filter(Boolean)
        .join(" ");

      if (nonMusicPattern.test(text)) {
        return true;
      }

      if (!fundraiserPattern.test(text)) {
        return false;
      }

      return gig.artist_names.length === 0 && !musicFundraiserSignalPattern.test(text);
    })
    .map(formatGigSummary);
}

function findMissingArtistCandidates(gigs) {
  const explicitLineupPattern =
    /\b(?:feat\.?|ft\.?|featuring|with special guest|with support|support from|supported by|lineup|presents)\b/i;
  const likelyArtistPlusPattern =
    /\b[A-Za-z][A-Za-z0-9'’&./-]*(?:\s+[A-Za-z][A-Za-z0-9'’&./-]*){0,5}\s+\+\s+[A-Za-z][A-Za-z0-9'’&./-]*(?:\s+[A-Za-z][A-Za-z0-9'’&./-]*){0,5}\b/;
  const themePartyWithoutRealPerformerPattern =
    /\b(?:worship party|after party|djs?\s+playing\s+the\s+best\s+of|vs\b.+\bparty)\b/i;

  return gigs
    .filter((gig) => gig.artist_names.length === 0)
    .filter((gig) => {
      const text = [gig.title, gig.description].join(" ");
      if (themePartyWithoutRealPerformerPattern.test(text)) {
        return false;
      }

      return explicitLineupPattern.test(text) || likelyArtistPlusPattern.test(text);
    })
    .map(formatGigSummary);
}

function findNotableRows(gigs, matchPatterns) {
  return matchPatterns.flatMap((patternText) => {
    const pattern = new RegExp(patternText, "i");
    return gigs
      .filter((gig) => pattern.test(gig.title))
      .map((gig) => ({
        pattern: patternText,
        ...formatGigSummary(gig)
      }));
  });
}

function buildAudit(payload, options, target, sourceReconciliation = null) {
  const gigs = toGigRows(payload);
  const exactDuplicates = findExactDuplicates(gigs);
  const fuzzyDuplicates = findFuzzyDuplicates(gigs);
  const artistPlaceholderLeaks = findArtistPlaceholderLeaks(gigs);
  const images = classifyImages(gigs);
  const nonMusicLeakageCandidates = findNonMusicLeakageCandidates(gigs);
  const missingArtistCandidates = findMissingArtistCandidates(gigs);
  const publicTextEncodingIssues = findPublicTextEncodingIssues(gigs);
  const artistDelimiterLeaks = findArtistDelimiterLeaks(gigs);
  const artistSentenceFragmentCandidates = findArtistSentenceFragmentCandidates(gigs);
  const notableRows = findNotableRows(gigs, options.matchPatterns);
  const errors = [
    ...exactDuplicates.map((items) => ({
      kind: "exact_duplicate",
      message: "Exact duplicate public gigs found.",
      items
    })),
    ...fuzzyDuplicates.map((duplicate) => ({
      kind: "fuzzy_duplicate",
      message: "Fuzzy same-venue/date duplicate candidates found.",
      ...duplicate
    })),
    ...artistPlaceholderLeaks.map((item) => ({
      kind: "artist_placeholder",
      message: "Placeholder artist text leaked into a public artist list.",
      item
    })),
    ...images.invalidMetadata.map((item) => ({
      kind: "invalid_image_metadata",
      message: "Gig has an image URL but missing or invalid render dimensions.",
      item
    }))
  ];
  const warnings = [
    ...images.noImage.map((item) => ({
      kind: "no_image",
      message: "Public gig has no image URL.",
      item
    })),
    ...nonMusicLeakageCandidates.map((item) => ({
      kind: "non_music_candidate",
      message: "Humanitix/Ticketek gig matched a noisy non-music keyword; inspect manually.",
      item
    })),
    ...missingArtistCandidates.map((item) => ({
      kind: "missing_artist_candidate",
      message: "Gig has no artists but title/description suggests an explicit lineup.",
      item
    })),
    ...publicTextEncodingIssues.map((item) => ({
      kind: "public_text_encoding",
      message: "Public gig text contains encoded HTML entities or broken replacement punctuation.",
      item
    })),
    ...artistDelimiterLeaks.map((item) => ({
      kind: "artist_delimiter",
      message: "Artist text appears to contain multiple artists or decoration in one value.",
      item
    })),
    ...artistSentenceFragmentCandidates.map((item) => ({
      kind: "artist_sentence_fragment",
      message: "Artist text looks like prose or a descriptor rather than a performer.",
      item
    }))
  ];

  return {
    errors,
    notableRows,
    payload: {
      dayCount: payload.days.length,
      gigCount: gigs.length,
      initialActiveDateKey: payload.initialActiveDateKey,
      sourceCounts: getSourceCounts(gigs)
    },
    sourceReconciliation,
    target,
    warnings,
    checks: {
      artistPlaceholderLeakCount: artistPlaceholderLeaks.length,
      exactDuplicateCount: exactDuplicates.length,
      fuzzyDuplicateCount: fuzzyDuplicates.length,
      imageStats: {
        expectedNoImageCount: images.expectedNoImage.length,
        invalidMetadataCount: images.invalidMetadata.length,
        noImageCount: images.noImage.length,
        renderableCount: images.renderableCount
      },
      missingArtistCandidateCount: missingArtistCandidates.length,
      nonMusicLeakageCandidateCount: nonMusicLeakageCandidates.length,
      publicTextEncodingIssueCount: publicTextEncodingIssues.length,
      artistDelimiterLeakCount: artistDelimiterLeaks.length,
      artistSentenceFragmentCandidateCount: artistSentenceFragmentCandidates.length,
      notableRowCount: notableRows.length
    }
  };
}

function printList(title, items, limit) {
  if (items.length === 0) {
    return;
  }

  console.log("");
  console.log(`${title} (${items.length})`);

  for (const item of items.slice(0, limit)) {
    console.log(`- ${JSON.stringify(item)}`);
  }

  if (items.length > limit) {
    console.log(`- ... ${items.length - limit} more`);
  }
}

function printSourceReconciliation(reconciliation, limit) {
  if (!reconciliation) {
    return;
  }

  console.log("");
  console.log("Source Reconciliation");
  console.log(
    "Stored source-gigs are upcoming rows from public sources; public active cards are the active homepage rows after canonical source selection."
  );
  console.log(
    `Totals: source_gigs=${reconciliation.totals.sourceGigTotalCount}, active_source_gigs=${reconciliation.totals.activeSourceGigCount}, public_active_cards=${reconciliation.totals.publicActiveCardCount}, hidden_by_status=${reconciliation.totals.hiddenByStatusCount} (postponed=${reconciliation.totals.postponedCount}, cancelled=${reconciliation.totals.cancelledCount})`
  );

  for (const row of reconciliation.rows) {
    console.log(
      `- ${row.sourceName}: source_gigs=${row.sourceGigTotalCount}, active_source_gigs=${row.activeSourceGigCount}, public_active_cards=${row.publicActiveCardCount}, active_not_public_cards=${row.activeSourceGigsNotPublicCardsCount}, hidden_by_status=${row.hiddenByStatusCount} (postponed=${row.postponedCount}, cancelled=${row.cancelledCount})`
    );

    for (const example of row.hiddenByStatusExamples.slice(0, limit)) {
      console.log(`  hidden: ${JSON.stringify(example)}`);
    }

    if (row.hiddenByStatusExamples.length > limit) {
      console.log(`  hidden: ... ${row.hiddenByStatusExamples.length - limit} more`);
    }
  }
}

function printHumanReport(audit, options) {
  console.log("Public gig audit");
  console.log(`Target: ${audit.target.target}`);
  console.log(
    `Payload: ${audit.payload.gigCount} gigs across ${audit.payload.dayCount} days, active date ${audit.payload.initialActiveDateKey}`
  );
  console.log("");
  console.log("Sources");

  for (const [source, count] of Object.entries(audit.payload.sourceCounts)) {
    console.log(`- ${source}: ${count}`);
  }

  console.log("");
  console.log("Checks");
  console.log(`- exact duplicates: ${audit.checks.exactDuplicateCount}`);
  console.log(`- fuzzy same-venue/date duplicates: ${audit.checks.fuzzyDuplicateCount}`);
  console.log(`- artist placeholder leaks: ${audit.checks.artistPlaceholderLeakCount}`);
  console.log(`- renderable images: ${audit.checks.imageStats.renderableCount}`);
  console.log(`- invalid image metadata: ${audit.checks.imageStats.invalidMetadataCount}`);
  console.log(`- no-image public gigs: ${audit.checks.imageStats.noImageCount}`);
  console.log(`- expected no-image public gigs: ${audit.checks.imageStats.expectedNoImageCount}`);
  console.log(`- Humanitix/Ticketek non-music candidates: ${audit.checks.nonMusicLeakageCandidateCount}`);
  console.log(`- missing artist candidates: ${audit.checks.missingArtistCandidateCount}`);
  console.log(`- public text encoding issues: ${audit.checks.publicTextEncodingIssueCount}`);
  console.log(`- artist delimiter leaks: ${audit.checks.artistDelimiterLeakCount}`);
  console.log(`- artist sentence-fragment candidates: ${audit.checks.artistSentenceFragmentCandidateCount}`);

  printList("Errors", audit.errors, options.limit);
  printList("Warnings", audit.warnings, options.limit);
  printList("Notable Rows", audit.notableRows, options.limit);
  printSourceReconciliation(audit.sourceReconciliation, options.limit);

  console.log("");
  console.log(
    audit.errors.length === 0 && (!options.strict || audit.warnings.length === 0)
      ? "Result: PASS"
      : "Result: FAIL"
  );
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const loaded = options.supabase
    ? await loadSupabasePayload()
    : await loadHtml(options);
  const payload = options.supabase
    ? loaded.payload
    : extractHomepagePayload(loaded.html);
  const sourceReconciliation = options.reconcileSources
    ? await loadSupabaseSourceReconciliation(payload, options)
    : null;
  const audit = buildAudit(
    payload,
    options,
    {
      kind: loaded.targetKind ?? loaded.target.targetKind,
      target: loaded.target.target ?? loaded.target
    },
    sourceReconciliation
  );

  if (options.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    printHumanReport(audit, options);
  }

  process.exitCode = audit.errors.length > 0 || (options.strict && audit.warnings.length > 0) ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  printUsage();
  process.exit(1);
}
