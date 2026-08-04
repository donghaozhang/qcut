import { describe, expect, it } from "vitest";
import type { DraftInteropDocumentV1 } from "@qcut/editor-core/draft-interop";
import {
	createImportPlanArtifact,
	redactImportPlanArtifactForLog,
	validateImportPlanArtifact,
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
} from "../import-plan-artifact.js";
import {
	ImportPlanBuildMismatchError,
	ImportPlanConsumedError,
	ImportPlanExpiredError,
	ImportPlanNotFoundError,
	ImportPlanStore,
	ImportPlanStoreFullError,
} from "../import-plan-store.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

/**
 * JYI-007 acceptance: TTL, build/schema mismatch, CAS consume, replay and
 * concurrency, and log redaction.
 */

const BUILD: ImportPlanBuildIdentity = {
	appVersion: "2026.08.04.1",
	interopSchemaVersion: 1,
};

const RESTRICTED_ROOT = "/Users/someone/Movies/JianyingPro Drafts/my-draft";

function createSnapshotFixture(): DraftSourceSnapshot {
	return {
		rootRealPath: RESTRICTED_ROOT,
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 128,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "42",
					size: "128",
					mtimeNanoseconds: "1000",
				},
			},
		],
		parsedJsonByPath: {},
		bytesByPath: {},
		issues: [],
	};
}

function createDocumentFixture({
	issues = [],
	resources = [],
}: {
	issues?: DraftInteropDocumentV1["issues"];
	resources?: DraftInteropDocumentV1["resources"];
} = {}): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "jianying",
			profileId: "jianying-synthetic-plaintext-5.9",
			platform: "macos",
			files: [],
		},
		project: { id: "p", name: "P", width: 1920, height: 1080, fps: 30 },
		timelines: [],
		resources,
		links: [],
		issues,
	};
}

function createArtifact({
	now = 1_000_000,
	ttl = 60_000,
	issues,
	planToken,
	resources,
}: {
	now?: number;
	ttl?: number;
	issues?: DraftInteropDocumentV1["issues"];
	planToken?: string;
	resources?: DraftInteropDocumentV1["resources"];
} = {}): ImportPlanArtifactV1 {
	return createImportPlanArtifact({
		snapshot: createSnapshotFixture(),
		document: createDocumentFixture({
			...(issues === undefined ? {} : { issues }),
			...(resources === undefined ? {} : { resources }),
		}),
		detectionOutcome: "exact",
		profileId: "jianying-synthetic-plaintext-5.9",
		buildIdentity: BUILD,
		nowUnixMilliseconds: now,
		planTtlMilliseconds: ttl,
		...(planToken === undefined ? {} : { planToken }),
	});
}

describe("createImportPlanArtifact", () => {
	it("splits warning and blocker fingerprints and gates canCommit", () => {
		const artifact = createArtifact({
			issues: [
				{
					code: "FEATURE_DOWNGRADED",
					severity: "warning",
					message: "text downgraded",
					subjectId: "s1",
				},
				{
					code: "REF_BROKEN",
					severity: "error",
					message: "missing material",
					subjectId: "s2",
				},
			],
		});
		expect(artifact.warningFingerprints).toHaveLength(1);
		expect(artifact.blockerFingerprints).toHaveLength(1);
		expect(artifact.canCommit).toBe(false);

		const clean = createArtifact();
		expect(clean.canCommit).toBe(true);
		expect(clean.issueSetFingerprint).not.toBe(artifact.issueSetFingerprint);
	});

	it("is deterministic for a fixed token and clock", () => {
		const first = createArtifact({ planToken: "token-1" });
		const second = createArtifact({ planToken: "token-1" });
		expect(second).toEqual(first);
	});

	it("binds resolved resource evidence independent of resource order", () => {
		const firstResource: DraftInteropDocumentV1["resources"][number] = {
			id: "resource-b",
			kind: "video",
			name: "clip.mp4",
			originHint: "local-media",
			sha256: "b".repeat(64),
			byteLength: 128,
			status: "resolved",
			capability: "exact",
		};
		const secondResource: DraftInteropDocumentV1["resources"][number] = {
			...firstResource,
			id: "resource-a",
			sha256: "a".repeat(64),
		};
		const first = createArtifact({
			resources: [firstResource, secondResource],
		});
		const reordered = createArtifact({
			resources: [secondResource, firstResource],
		});
		expect(reordered.requestFingerprint).toBe(first.requestFingerprint);

		const changed = createArtifact({
			resources: [secondResource, { ...firstResource, sha256: "c".repeat(64) }],
		});
		expect(changed.requestFingerprint).not.toBe(first.requestFingerprint);
	});

	it("rejects an out-of-range TTL", () => {
		expect(() => createArtifact({ ttl: 0 })).toThrow(/planTtlMilliseconds/);
		expect(() => createArtifact({ ttl: 25 * 60 * 60 * 1000 })).toThrow(
			/planTtlMilliseconds/
		);
	});

	it("redacts the restricted root for logs, structurally", () => {
		const artifact = createArtifact();
		expect(artifact.restricted.rootRealPath).toBe(RESTRICTED_ROOT);
		const redacted = redactImportPlanArtifactForLog({ artifact });
		expect("restricted" in redacted).toBe(false);
		expect(JSON.stringify(redacted)).not.toContain(RESTRICTED_ROOT);
		expect(JSON.stringify(redacted)).not.toContain("JianyingPro Drafts");
		// Loggable content survives.
		expect(redacted.planToken).toBe(artifact.planToken);
		expect(redacted.sourceFiles[0].relativePath).toBe("draft_info.json");
	});
});

describe("validateImportPlanArtifact", () => {
	it("flags expiry, build mismatch, and schema mismatch", () => {
		const artifact = createArtifact({ now: 1000, ttl: 500 });
		expect(
			validateImportPlanArtifact({
				artifact,
				buildIdentity: BUILD,
				nowUnixMilliseconds: 1400,
			})
		).toEqual([]);
		expect(
			validateImportPlanArtifact({
				artifact,
				buildIdentity: BUILD,
				nowUnixMilliseconds: 1500,
			})
		).toEqual(["expired"]);
		expect(
			validateImportPlanArtifact({
				artifact,
				buildIdentity: { ...BUILD, appVersion: "2026.08.05.1" },
				nowUnixMilliseconds: 1400,
			})
		).toEqual(["build-mismatch"]);
		const tampered = {
			...artifact,
			schemaVersion: 2 as unknown as ImportPlanArtifactV1["schemaVersion"],
		};
		expect(
			validateImportPlanArtifact({
				artifact: tampered,
				buildIdentity: BUILD,
				nowUnixMilliseconds: 1400,
			})
		).toContain("schema-mismatch");
	});
});

describe("ImportPlanStore", () => {
	function createStore({
		nowRef,
		maxStoredPlans,
	}: {
		nowRef: { value: number };
		maxStoredPlans?: number;
	}): ImportPlanStore {
		return new ImportPlanStore({
			buildIdentity: BUILD,
			now: () => nowRef.value,
			...(maxStoredPlans === undefined ? {} : { maxStoredPlans }),
		});
	}

	it("consumes exactly once and rejects replays", () => {
		const nowRef = { value: 1_000_000 };
		const store = createStore({ nowRef });
		const artifact = createArtifact({ planToken: "cas-token" });
		store.put({ artifact });

		expect(store.get({ planToken: "cas-token" }).planToken).toBe("cas-token");
		const consumed = store.consume({ planToken: "cas-token" });
		expect(consumed.planToken).toBe("cas-token");
		expect(() => store.consume({ planToken: "cas-token" })).toThrow(
			ImportPlanConsumedError
		);
	});

	it("rejects concurrent double-consume: one winner", async () => {
		const nowRef = { value: 1_000_000 };
		const store = createStore({ nowRef });
		store.put({ artifact: createArtifact({ planToken: "race-token" }) });

		const attempts = await Promise.allSettled([
			Promise.resolve().then(() => store.consume({ planToken: "race-token" })),
			Promise.resolve().then(() => store.consume({ planToken: "race-token" })),
			Promise.resolve().then(() => store.consume({ planToken: "race-token" })),
		]);
		const winners = attempts.filter(
			(attempt) => attempt.status === "fulfilled"
		);
		const losers = attempts.filter(
			(attempt) =>
				attempt.status === "rejected" &&
				attempt.reason instanceof ImportPlanConsumedError
		);
		expect(winners).toHaveLength(1);
		expect(losers).toHaveLength(2);
	});

	it("expires plans by TTL and deletes them on access", () => {
		const nowRef = { value: 1_000_000 };
		const store = createStore({ nowRef });
		store.put({
			artifact: createArtifact({
				planToken: "ttl-token",
				now: nowRef.value,
				ttl: 500,
			}),
		});
		nowRef.value += 501;
		expect(() => store.consume({ planToken: "ttl-token" })).toThrow(
			ImportPlanExpiredError
		);
		// Deleted, not resurrectable.
		expect(() => store.get({ planToken: "ttl-token" })).toThrow(
			ImportPlanNotFoundError
		);
	});

	it("refuses plans from another build", () => {
		const nowRef = { value: 1_000_000 };
		const store = new ImportPlanStore({
			buildIdentity: { ...BUILD, appVersion: "2099.01.01.1" },
			now: () => nowRef.value,
		});
		store.put({ artifact: createArtifact({ planToken: "build-token" }) });
		expect(() => store.consume({ planToken: "build-token" })).toThrow(
			ImportPlanBuildMismatchError
		);
	});

	it("bounds capacity: evicts consumed plans first, then refuses", () => {
		const nowRef = { value: 1_000_000 };
		const store = createStore({ nowRef, maxStoredPlans: 2 });
		store.put({ artifact: createArtifact({ planToken: "one" }) });
		store.put({ artifact: createArtifact({ planToken: "two" }) });
		store.consume({ planToken: "one" });
		// Consumed "one" is evicted to make room.
		store.put({ artifact: createArtifact({ planToken: "three" }) });
		expect(() => store.get({ planToken: "one" })).toThrow(
			ImportPlanNotFoundError
		);
		// Two live plans now; a third must be refused, not silently evicted.
		expect(() =>
			store.put({ artifact: createArtifact({ planToken: "four" }) })
		).toThrow(ImportPlanStoreFullError);
	});

	it("rejects duplicate tokens and unknown tokens", () => {
		const nowRef = { value: 1_000_000 };
		const store = createStore({ nowRef });
		store.put({ artifact: createArtifact({ planToken: "dup" }) });
		expect(() =>
			store.put({ artifact: createArtifact({ planToken: "dup" }) })
		).toThrow(/already stored/);
		expect(() => store.consume({ planToken: "nope" })).toThrow(
			ImportPlanNotFoundError
		);
	});
});
