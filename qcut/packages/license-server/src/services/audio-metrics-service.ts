import { sql } from "@qcut/db";
import { audioTrackDownloads } from "@qcut/db/schema";
import { db } from "../db/drizzle";

/**
 * Record one download/timeline-add for a catalog track. Returns the updated
 * counter so callers can echo it back.
 */
export async function incrementAudioTrackDownloads({
	trackKey,
}: {
	trackKey: string;
}): Promise<number> {
	const [row] = await db
		.insert(audioTrackDownloads)
		.values({ trackKey, downloads: 1, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: audioTrackDownloads.trackKey,
			set: {
				downloads: sql`${audioTrackDownloads.downloads} + 1`,
				updatedAt: new Date(),
			},
		})
		.returning();
	return row?.downloads ?? 0;
}

/**
 * All counters keyed by `${kind}:${id}` — consumed by the audio CDN release
 * script to back the trending sort with real usage data.
 */
export async function listAudioTrackDownloads(): Promise<
	Record<string, number>
> {
	const rows = await db.select().from(audioTrackDownloads);
	return Object.fromEntries(rows.map((row) => [row.trackKey, row.downloads]));
}
