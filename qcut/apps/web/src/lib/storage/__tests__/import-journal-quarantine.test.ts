import { webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportJournal, type ImportJournalRecordV1 } from "../import-journal";
import type { ImportJournalQuarantineMarkerV1 } from "../import-journal-quarantine";
import { createMapStorageAdapter } from "./support/map-storage-adapter";

const NOW_ISO = "2026-08-05T00:00:00.000Z";

function createRecord({
	importId = "import-token",
}: {
	importId?: string;
} = {}): ImportJournalRecordV1 {
	return {
		schemaVersion: 1,
		importId,
		bundleDigest: "a".repeat(64),
		phase: "staging",
		projectId: "project-id",
		sceneId: "scene-id",
		mediaItemIds: [],
		startedAtIso: NOW_ISO,
		updatedAtIso: NOW_ISO,
	};
}

beforeAll(() => {
	if (globalThis.crypto?.subtle === undefined) {
		Object.defineProperty(globalThis, "crypto", { value: webcrypto });
	}
});

describe("ImportJournal corrupt-record quarantine", () => {
	let journalAdapter: ReturnType<
		typeof createMapStorageAdapter<ImportJournalRecordV1>
	>;
	let quarantineAdapter: ReturnType<
		typeof createMapStorageAdapter<ImportJournalQuarantineMarkerV1>
	>;
	let journal: ImportJournal;

	beforeEach(() => {
		journalAdapter = createMapStorageAdapter<ImportJournalRecordV1>();
		quarantineAdapter =
			createMapStorageAdapter<ImportJournalQuarantineMarkerV1>();
		journal = new ImportJournal({
			adapter: journalAdapter,
			quarantineAdapter,
			now: () => new Date(NOW_ISO),
		});
	});

	it("isolates a corrupt record by fingerprint without removing or exposing it", async () => {
		const corruptRecord = createRecord({ importId: "claimed-import" });
		corruptRecord.projectId = "victim-project";
		journalAdapter.map.set("different-storage-key", corruptRecord);
		const remove = vi.spyOn(journalAdapter, "remove");

		await expect(journal.quarantineCorruptRecords()).resolves.toEqual({
			newlyQuarantinedRecordCount: 1,
			corruptRecordCount: 0,
			quarantinedRecordCount: 1,
		});
		expect(remove).not.toHaveBeenCalled();
		expect(journalAdapter.map.get("different-storage-key")).toBe(corruptRecord);
		expect(quarantineAdapter.map.size).toBe(1);
		const [fingerprint, marker] = [...quarantineAdapter.map.entries()][0];
		expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
		expect(marker.sourceFingerprintSha256).toBe(fingerprint);
		expect(JSON.stringify(marker)).not.toContain("different-storage-key");
		expect(JSON.stringify(marker)).not.toContain("victim-project");
		await expect(journal.audit()).resolves.toEqual({
			records: [],
			corruptRecordCount: 0,
			quarantinedRecordCount: 1,
		});
		await expect(journal.quarantineCorruptRecords()).resolves.toMatchObject({
			newlyQuarantinedRecordCount: 0,
		});
	});

	it("never quarantines a valid journal record", async () => {
		journalAdapter.map.set("import-token", createRecord());

		await expect(journal.quarantineCorruptRecords()).resolves.toEqual({
			newlyQuarantinedRecordCount: 0,
			corruptRecordCount: 0,
			quarantinedRecordCount: 0,
		});
		expect(quarantineAdapter.map.size).toBe(0);
		await expect(journal.list()).resolves.toEqual([createRecord()]);
	});

	it("invalidates quarantine when the corrupt source record changes", async () => {
		const corruptRecord = createRecord({ importId: "claimed-import" });
		journalAdapter.map.set("different-storage-key", corruptRecord);
		await journal.quarantineCorruptRecords();
		journalAdapter.map.set("different-storage-key", {
			...corruptRecord,
			projectId: "different-victim",
		});

		await expect(journal.audit()).resolves.toEqual({
			records: [],
			corruptRecordCount: 1,
			quarantinedRecordCount: 0,
		});
	});

	it("treats a damaged quarantine marker as active corruption", async () => {
		journalAdapter.map.set(
			"different-storage-key",
			createRecord({ importId: "claimed-import" })
		);
		await journal.quarantineCorruptRecords();
		const [fingerprint] = [...quarantineAdapter.map.keys()];
		quarantineAdapter.map.set(fingerprint, {
			schemaVersion: 1,
			sourceFingerprintSha256: "0".repeat(64),
			quarantinedAtIso: NOW_ISO,
		});

		await expect(journal.audit()).resolves.toMatchObject({
			corruptRecordCount: 1,
			quarantinedRecordCount: 0,
		});
	});

	it("leaves the source active when marker persistence fails", async () => {
		journalAdapter.map.set(
			"different-storage-key",
			createRecord({ importId: "claimed-import" })
		);
		vi.spyOn(quarantineAdapter, "set").mockRejectedValue(new Error("quota"));

		await expect(journal.quarantineCorruptRecords()).resolves.toEqual({
			newlyQuarantinedRecordCount: 0,
			corruptRecordCount: 1,
			quarantinedRecordCount: 0,
		});
		expect(journalAdapter.map.has("different-storage-key")).toBe(true);
	});

	it("refuses to fingerprint an oversized corrupt record", async () => {
		journalAdapter.map.set("different-storage-key", {
			...createRecord({ importId: "claimed-import" }),
			oversized: "x".repeat(1024 * 1024),
		} as ImportJournalRecordV1);

		await expect(journal.quarantineCorruptRecords()).resolves.toMatchObject({
			newlyQuarantinedRecordCount: 0,
			corruptRecordCount: 1,
		});
		expect(quarantineAdapter.map.size).toBe(0);
	});
});
