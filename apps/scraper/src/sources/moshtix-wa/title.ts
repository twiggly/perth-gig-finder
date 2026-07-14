import { normalizeWhitespace } from "@perth-gig-finder/shared";

export function normalizeMoshtixTitle(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "");
}
