import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase";
import { listVenueSuggestions } from "@/lib/venues";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const excludedSlugs = searchParams.getAll("exclude");

  try {
    const suggestions = await listVenueSuggestions(query, excludedSlugs);

    return NextResponse.json(suggestions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load venue suggestions.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
