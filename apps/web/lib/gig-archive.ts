import type { GigStatus } from "@perth-gig-finder/shared";

import { getPerthDateKey, getPerthDayBounds } from "./homepage-dates";

export const GIG_ARCHIVE_MONTHS = 3;

export type GigDisplayState = "active" | "cancelled" | "past" | "postponed";

export interface GigTimeStatusRecord {
  ends_at: string | null;
  starts_at: string;
  status: GigStatus;
}

export interface PerthMonth {
  month: number;
  year: number;
}

function shiftPerthDateKeyMonths(dateKey: string, monthOffset: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shiftedMonth = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const lastDay = new Date(
    Date.UTC(shiftedMonth.getUTCFullYear(), shiftedMonth.getUTCMonth() + 1, 0)
  ).getUTCDate();

  return [
    shiftedMonth.getUTCFullYear(),
    String(shiftedMonth.getUTCMonth() + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0")
  ].join("-");
}

export function getGigArchiveLowerBound(now: Date): Date {
  const archiveDateKey = shiftPerthDateKeyMonths(
    getPerthDateKey(now),
    -GIG_ARCHIVE_MONTHS
  );
  const bounds = getPerthDayBounds(archiveDateKey);

  if (!bounds) {
    throw new Error(`Unable to calculate archive boundary for ${archiveDateKey}.`);
  }

  return bounds.start;
}

export function getGigDisplayState(
  gig: GigTimeStatusRecord,
  now: Date
): GigDisplayState {
  if (gig.status === "cancelled") {
    return "cancelled";
  }

  if (gig.status === "postponed") {
    return "postponed";
  }

  const effectiveEnd = gig.ends_at ?? gig.starts_at;
  return new Date(effectiveEnd).getTime() <= now.getTime() ? "past" : "active";
}

export function getGigDisplayStateLabel(state: GigDisplayState): string | null {
  switch (state) {
    case "cancelled":
      return "Cancelled";
    case "past":
      return "Past event";
    case "postponed":
      return "Postponed";
    default:
      return null;
  }
}

export function getPerthMonthBounds(
  year: number,
  month: number
): { end: Date; start: Date } | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return null;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = getPerthDayBounds(
    `${year}-${String(month).padStart(2, "0")}-01`
  )?.start;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const end = getPerthDayBounds(
    `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`
  )?.start;

  return start && end ? { end, start } : null;
}

export function formatPerthMonth({ month, year }: PerthMonth): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shiftPerthMonth(
  { month, year }: PerthMonth,
  offset: number
): PerthMonth {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));

  return {
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear()
  };
}

export function buildGigMonthPath({ month, year }: PerthMonth): string {
  return `/gigs/${year}/${String(month).padStart(2, "0")}`;
}
