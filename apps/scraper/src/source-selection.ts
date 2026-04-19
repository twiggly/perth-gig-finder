import { sources } from "./sources";
import type { SourceAdapter } from "./types";

const INCLUDE_FLAG = "--source";
const EXCLUDE_FLAG = "--exclude-source";
const INCLUDE_ENV = "SCRAPER_SOURCE_SLUGS";
const EXCLUDE_ENV = "SCRAPER_EXCLUDE_SOURCE_SLUGS";

function parseSlugList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function collectFlagValues(argv: string[], flag: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === flag) {
      const next = argv[index + 1];

      if (next && !next.startsWith("--")) {
        values.push(next);
        index += 1;
      }

      continue;
    }

    if (argument.startsWith(`${flag}=`)) {
      values.push(argument.slice(flag.length + 1));
    }
  }

  return values.flatMap((value) => parseSlugList(value));
}

function assertKnownSlugs(
  selected: Set<string>,
  availableSlugs: Set<string>,
  context: string
): void {
  const unknown = [...selected].filter((slug) => !availableSlugs.has(slug));

  if (unknown.length > 0) {
    throw new Error(`Unknown ${context} source slug(s): ${unknown.join(", ")}`);
  }
}

export interface ResolveSourcesOptions {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  availableSources?: readonly SourceAdapter[];
}

export function resolveSourcesToRun(
  options: ResolveSourcesOptions = {}
): SourceAdapter[] {
  const {
    argv = process.argv.slice(2),
    env = process.env,
    availableSources = sources
  } = options;

  const availableSlugs = new Set(availableSources.map((source) => source.slug));
  const includeSlugs = new Set([
    ...parseSlugList(env[INCLUDE_ENV]),
    ...collectFlagValues(argv, INCLUDE_FLAG)
  ]);
  const excludeSlugs = new Set([
    ...parseSlugList(env[EXCLUDE_ENV]),
    ...collectFlagValues(argv, EXCLUDE_FLAG)
  ]);

  assertKnownSlugs(includeSlugs, availableSlugs, "included");
  assertKnownSlugs(excludeSlugs, availableSlugs, "excluded");

  const selectedSources = availableSources.filter((source) => {
    if (includeSlugs.size > 0 && !includeSlugs.has(source.slug)) {
      return false;
    }

    return !excludeSlugs.has(source.slug);
  });

  if (selectedSources.length === 0) {
    throw new Error("Source selection resolved to zero sources.");
  }

  return selectedSources;
}
