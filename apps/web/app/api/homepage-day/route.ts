import { NextResponse } from "next/server";

import { listGigsForDate } from "@/lib/gigs";
import { getPerthDayBounds } from "@/lib/homepage-dates";
import { parseHomepageFilters } from "@/lib/homepage-filters";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateKey = searchParams.get("date") ?? "";

  if (!getPerthDayBounds(dateKey)) {
    return NextResponse.json(
      { error: "A valid date query parameter is required." },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      dateKey,
      heading: "",
      items: []
    });
  }

  const filters = parseHomepageFilters({
    date: dateKey,
    q: searchParams.get("q") ?? "",
    venue: searchParams.getAll("venue")
  });

  try {
    const day = await listGigsForDate(filters, dateKey);

    if (!day) {
      return NextResponse.json(
        { error: "A valid date query parameter is required." },
        { status: 400 }
      );
    }

    return NextResponse.json(day);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load gigs for date.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
