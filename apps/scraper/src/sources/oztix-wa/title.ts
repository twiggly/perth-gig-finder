import { normalizeWhitespace } from "@perth-gig-finder/shared";

const OZTIX_BROKEN_EMOJI_QUESTION_RUN_PATTERN = /\?{3,}/g;

export function normalizeOztixTitle(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "")
    .replace(/^\?{3,}\s*/g, "")
    .replace(/\s*\?{3,}(?=\s|$)/g, "")
    .replace(OZTIX_BROKEN_EMOJI_QUESTION_RUN_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}
