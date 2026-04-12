import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

function getSupabaseKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    null
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function createSupabaseServerClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
