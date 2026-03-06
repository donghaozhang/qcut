import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@qcut/db/schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/** Returns a lazily-initialised Drizzle instance. Reads DATABASE_URL only on first call. */
function getDb(): Db {
	if (_db) {
		return _db;
	}
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is not configured");
	}
	// Supabase transaction pooler requires SSL and no prepared statements
	const client = postgres(url, {
		ssl: "require",
		prepare: false,
		max: 1,
	});
	_db = drizzle(client, { schema });
	return _db;
}

/** Proxy that forwards all property accesses to the lazily-created Drizzle instance. */
export const db = new Proxy({} as Db, {
	get(_target, prop: string | symbol) {
		return getDb()[prop as keyof Db];
	},
});
