import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "qcut-sound-effects-lab-offline";
const DATABASE_VERSION = 1;

export interface SoundEffectsLabOfflinePackRecord {
	catalogId: string;
	generatedAt: string;
	installedAt: number;
	itemCount: number;
	manifestJson: string;
	ownerEmail: string;
	persistentStorage: boolean;
	totalBytes: number;
}

export interface SoundEffectsLabOfflinePackStorage {
	get: ({
		ownerEmail,
	}: {
		ownerEmail: string;
	}) => Promise<SoundEffectsLabOfflinePackRecord | null>;
	list: () => Promise<SoundEffectsLabOfflinePackRecord[]>;
	put: ({
		record,
	}: {
		record: SoundEffectsLabOfflinePackRecord;
	}) => Promise<void>;
	remove: ({ ownerEmail }: { ownerEmail: string }) => Promise<void>;
}

interface SoundEffectsLabOfflineDatabase extends DBSchema {
	packs: {
		key: string;
		value: SoundEffectsLabOfflinePackRecord;
	};
}

export function normalizeSoundEffectsLabOfflineOwner({
	ownerEmail,
}: {
	ownerEmail: string;
}): string {
	return ownerEmail.trim().toLocaleLowerCase();
}

export class IndexedDbSoundEffectsLabOfflinePackStorage
	implements SoundEffectsLabOfflinePackStorage
{
	private databasePromise?: Promise<
		IDBPDatabase<SoundEffectsLabOfflineDatabase>
	>;

	private database(): Promise<IDBPDatabase<SoundEffectsLabOfflineDatabase>> {
		if (typeof indexedDB === "undefined") {
			return Promise.reject(
				new Error("Sound Effects Lab offline storage is unavailable")
			);
		}
		this.databasePromise ??= openDB<SoundEffectsLabOfflineDatabase>(
			DATABASE_NAME,
			DATABASE_VERSION,
			{
				upgrade(database) {
					database.createObjectStore("packs", { keyPath: "ownerEmail" });
				},
			}
		);
		return this.databasePromise;
	}

	async get({
		ownerEmail,
	}: {
		ownerEmail: string;
	}): Promise<SoundEffectsLabOfflinePackRecord | null> {
		const key = normalizeSoundEffectsLabOfflineOwner({ ownerEmail });
		if (!key) return null;
		return (await (await this.database()).get("packs", key)) ?? null;
	}

	async list(): Promise<SoundEffectsLabOfflinePackRecord[]> {
		return (await this.database()).getAll("packs");
	}

	async put({
		record,
	}: {
		record: SoundEffectsLabOfflinePackRecord;
	}): Promise<void> {
		const ownerEmail = normalizeSoundEffectsLabOfflineOwner({
			ownerEmail: record.ownerEmail,
		});
		if (!ownerEmail) {
			throw new Error("Sound Effects Lab offline pack requires an owner");
		}
		await (await this.database()).put("packs", { ...record, ownerEmail });
	}

	async remove({ ownerEmail }: { ownerEmail: string }): Promise<void> {
		const key = normalizeSoundEffectsLabOfflineOwner({ ownerEmail });
		if (!key) return;
		await (await this.database()).delete("packs", key);
	}
}

let defaultStorage: SoundEffectsLabOfflinePackStorage | undefined;

export function getSoundEffectsLabOfflinePackStorage(): SoundEffectsLabOfflinePackStorage {
	defaultStorage ??= new IndexedDbSoundEffectsLabOfflinePackStorage();
	return defaultStorage;
}
