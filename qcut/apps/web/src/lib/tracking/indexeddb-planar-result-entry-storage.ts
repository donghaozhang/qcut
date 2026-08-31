import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "qcut-planar-tracking";
const DATABASE_VERSION = 1;
const STORE_NAME = "results";

export interface PlanarTrackingResultEntry {
	key: string;
	projectId: string;
	resultSha256: string;
	resultUri: string;
	serialized: string;
	trackingId: string;
	updatedAt: number;
}

export interface PlanarTrackingResultEntryStorage {
	get: ({ key }: { key: string }) => Promise<PlanarTrackingResultEntry | null>;
	put: ({ entry }: { entry: PlanarTrackingResultEntry }) => Promise<void>;
	remove: ({ key }: { key: string }) => Promise<void>;
}

interface PlanarTrackingDatabase extends DBSchema {
	results: {
		key: string;
		value: PlanarTrackingResultEntry;
		indexes: {
			"by-project": string;
		};
	};
}

export class IndexedDbPlanarTrackingResultEntryStorage
	implements PlanarTrackingResultEntryStorage
{
	private databasePromise?: Promise<IDBPDatabase<PlanarTrackingDatabase>>;

	private database(): Promise<IDBPDatabase<PlanarTrackingDatabase>> {
		if (typeof indexedDB === "undefined") {
			return Promise.reject(
				new Error("IndexedDB planar tracking storage is unavailable.")
			);
		}
		this.databasePromise ??= openDB<PlanarTrackingDatabase>(
			DATABASE_NAME,
			DATABASE_VERSION,
			{
				upgrade(database) {
					const results = database.createObjectStore(STORE_NAME, {
						keyPath: "key",
					});
					results.createIndex("by-project", "projectId");
				},
			}
		);
		return this.databasePromise;
	}

	async get({
		key,
	}: {
		key: string;
	}): Promise<PlanarTrackingResultEntry | null> {
		return (await (await this.database()).get(STORE_NAME, key)) ?? null;
	}

	async put({ entry }: { entry: PlanarTrackingResultEntry }): Promise<void> {
		await (await this.database()).put(STORE_NAME, entry);
	}

	async remove({ key }: { key: string }): Promise<void> {
		await (await this.database()).delete(STORE_NAME, key);
	}
}
