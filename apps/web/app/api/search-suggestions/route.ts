import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase";
import { listSearchSuggestions } from "@/lib/search-suggestions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const venueSlugs = searchParams.getAll("venue");

  try {
    const suggestions = await listSearchSuggestions({
      query,
      venueSlugs
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load search suggestions.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
