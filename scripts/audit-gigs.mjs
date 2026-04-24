#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEFAULT_EXAMPLE_LIMIT = 10;
const DEFAULT_FUZZY_THRESHOLD = 0.72;
const execFileAsync = promisify(execFile);

function printUsage() {
  console.log(`Usage:
  pnpm audit:gigs -- --url https://your-deployment.vercel.app
  pnpm audit:gigs -- --file /tmp/homepage.html

Options:
  --url <url>           Homepage URL to fetch. Falls back to AUDIT_GIGS_URL.
  --file <path>         Read a saved homepage HTML file instead of fetching.
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
    strict: false,
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
      case "--strict":
        options.strict = true;
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

  return options;
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

function classifyImages(gigs) {
  const renderable = [];
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
    } else {
      noImage.push(formatGigSummary(gig));
    }
  }

  return {
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
        gig.venue_suburb,
        ...gig.artist_names
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

  return gigs
    .filter((gig) => gig.artist_names.length === 0)
    .filter((gig) => {
      const text = [gig.title, gig.description].join(" ");
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

function buildAudit(payload, options, target) {
  const gigs = toGigRows(payload);
  const exactDuplicates = findExactDuplicates(gigs);
  const fuzzyDuplicates = findFuzzyDuplicates(gigs);
  const artistPlaceholderLeaks = findArtistPlaceholderLeaks(gigs);
  const images = classifyImages(gigs);
  const nonMusicLeakageCandidates = findNonMusicLeakageCandidates(gigs);
  const missingArtistCandidates = findMissingArtistCandidates(gigs);
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
    target,
    warnings,
    checks: {
      artistPlaceholderLeakCount: artistPlaceholderLeaks.length,
      exactDuplicateCount: exactDuplicates.length,
      fuzzyDuplicateCount: fuzzyDuplicates.length,
      imageStats: {
        invalidMetadataCount: images.invalidMetadata.length,
        noImageCount: images.noImage.length,
        renderableCount: images.renderableCount
      },
      missingArtistCandidateCount: missingArtistCandidates.length,
      nonMusicLeakageCandidateCount: nonMusicLeakageCandidates.length,
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
  console.log(`- Humanitix/Ticketek non-music candidates: ${audit.checks.nonMusicLeakageCandidateCount}`);
  console.log(`- missing artist candidates: ${audit.checks.missingArtistCandidateCount}`);

  printList("Errors", audit.errors, options.limit);
  printList("Warnings", audit.warnings, options.limit);
  printList("Notable Rows", audit.notableRows, options.limit);

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

  const loaded = await loadHtml(options);
  const payload = extractHomepagePayload(loaded.html);
  const audit = buildAudit(payload, options, {
    kind: loaded.targetKind,
    target: loaded.target
  });

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
