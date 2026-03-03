import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns a Supabase client using service-role key for server-side operations.
 * Falls back to a mock client when SUPABASE_URL is not configured (dev/test).
 */
export function getSupabase(): SupabaseClient {
	if (_client) {
		return _client;
	}

	const url = process.env.SUPABASE_URL || "";
	const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

	if (url.length === 0 || serviceKey.length === 0) {
		throw new Error(
			"SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured"
		);
	}

	_client = createClient(url, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	return _client;
}

/** Reset the cached client (useful for tests). */
export function resetSupabaseClient(): void {
	_client = null;
}
