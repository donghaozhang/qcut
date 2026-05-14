import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { keys } from "./keys";

const { DATABASE_URL } = keys();
// Create a lazy database instance that only initializes when accessed
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
	if (!_db) {
		const client = postgres(DATABASE_URL);
		_db = drizzle(client, { schema });
	}

	return _db;
}

// Export a proxy that forwards all calls to the actual db instance
export const db = getDb();

// Re-export schema for convenience
export * from "./schema";

// Re-export agent path TS types (Supabase migration is source of truth;
// see supabase/migrations/20260514000000_agent_tables.sql)
export * from "./types/agent";

// Sandbox sessions (PR 06). Migration:
// supabase/migrations/20260514000100_sandbox_sessions.sql
export * from "./types/sandbox";

// Re-export drizzle-orm functions to ensure version consistency
export {
	eq,
	and,
	or,
	not,
	isNull,
	isNotNull,
	inArray,
	notInArray,
	exists,
	notExists,
	sql,
} from "drizzle-orm";
