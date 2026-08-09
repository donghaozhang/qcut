import { describe, expect, it } from "vitest";
import {
	ImportJournalRecordCorruptError,
	parseImportJournalRecordV1,
	type ImportJournalRecordV1,
} from "../import-journal-validation";

const STARTED_AT = "2026-08-05T00:00:00.000Z";
const UPDATED_AT = "2026-08-05T00:00:01.000Z";

function createRecord(): ImportJournalRecordV1 {
	return {
		schemaVersion: 1,
		importId: "import-1",
		bundleDigest: "a".repeat(64),
		phase: "staging",
		projectId: "project-1",
		sceneId: "scene-1",
		mediaItemIds: ["media-1", "media-2"],
		startedAtIso: STARTED_AT,
		updatedAtIso: UPDATED_AT,
	};
}

function expectCorrupt({
	storageKey = "import-1",
	value,
}: {
	storageKey?: string;
	value: unknown;
}): void {
	expect(() => parseImportJournalRecordV1({ storageKey, value })).toThrow(
		ImportJournalRecordCorruptError
	);
}

describe("parseImportJournalRecordV1", () => {
	it("accepts canonical records and strips the IndexedDB key field", () => {
		const record = createRecord();
		expect(
			parseImportJournalRecordV1({
				storageKey: record.importId,
				value: { id: record.importId, ...record },
			})
		).toEqual(record);
	});

	it("rejects records whose identity or exact shape is untrusted", () => {
		const record = createRecord();
		expectCorrupt({ storageKey: "other-import", value: record });
		expectCorrupt({ value: { ...record, id: "other-import" } });
		expectCorrupt({ value: { ...record, projectId: "../project" } });
		expectCorrupt({ value: { ...record, unexpected: true } });
		const missingSceneId: Record<string, unknown> = { ...record };
		Reflect.deleteProperty(missingSceneId, "sceneId");
		expectCorrupt({ value: missingSceneId });
	});

	it("rejects invalid digests, media ids, phases, and timestamps", () => {
		const record = createRecord();
		expectCorrupt({ value: { ...record, bundleDigest: "A".repeat(64) } });
		expectCorrupt({
			value: { ...record, mediaItemIds: ["media-1", "media-1"] },
		});
		expectCorrupt({ value: { ...record, phase: "committed" } });
		expectCorrupt({ value: { ...record, startedAtIso: "not-a-date" } });
		expectCorrupt({
			value: {
				...record,
				startedAtIso: UPDATED_AT,
				updatedAtIso: STARTED_AT,
			},
		});
	});
});
