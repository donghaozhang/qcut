import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@qcut/db/schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Creates a fresh Drizzle instance per call.
 * CF Workers reuse isolates across requests, which causes stale Hyperdrive
 * connections when using a singleton. Creating fresh clients per request
 * ensures each request gets a live connection. */
function getDb(): Db {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is not configured");
	}
	// prepare: false required for Hyperdrive / transaction pooler
	const client = postgres(url, {
		prepare: false,
		max: 1,
	});
	return drizzle(client, { schema });
}

/** Proxy that forwards all property accesses to a fresh Drizzle instance. */
export const db = new Proxy({} as Db, {
	get(_target, prop: string | symbol) {
		return getDb()[prop as keyof Db];
	},
});
