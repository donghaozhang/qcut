import { describe, expect, it } from "vitest";
import {
	parseQCutImportBundleV1,
	type DraftInteropDocumentV1,
	type DraftSourceDescriptor,
} from "@qcut/editor-core/draft-interop";
import {
	buildJianyingDraft,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
	PLAINTEXT_5_9_PROFILE_ID,
	type QCutImportTimelinePlanV1,
} from "@qcut/editor-core/jianying-draft";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { createImportPlanArtifact } from "../import-plan-artifact.js";
import {
	buildQCutImportBundle,
	computeQCutImportBundleDigest,
	verifyQCutImportBundleDigest,
} from "../qcut-import-bundle-builder.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

/**
 * JYI-009 acceptance: one shared schema, fail-closed runtime validation,
 * digest, deterministic internal ids, and conflict policy.
 */

function createExportSnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 5,
				height: 1080,
				id: "video-1",
				name: "clip.mp4",
				sourcePath: "/source/clip.mp4",
				type: "video",
				width: 1920,
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Bundle Fixture",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { "clip-1": 5 },
		tracks: [
			{
				elements: [
					{
						duration: 5,
						id: "clip-1",
						mediaId: "video-1",
						name: "clip-1",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				hidden: false,
				id: "track-1",
				muted: false,
				name: "Video",
				order: 0,
				type: "media",
			},
		],
	};
}

function createSource(): DraftSourceDescriptor {
	return {
		product: "jianying",
		profileId: PLAINTEXT_5_9_PROFILE_ID,
		platform: "macos",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 4096,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
			},
		],
	};
}

interface Fixture {
	document: DraftInteropDocumentV1;
	timelinePlan: QCutImportTimelinePlanV1;
	snapshot: DraftSourceSnapshot;
}

function createFixture(): Fixture {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/qcut-fixture/draft",
		snapshot: createExportSnapshot(),
		targetPlatform: "macos",
	});
	const normalized = normalizeRawDraft({
		content: JSON.parse(JSON.stringify(content)),
		source: createSource(),
		contentFileName: "draft_info.json",
	});
	const timelinePlan = mapInteropDocumentToQCutPlan({
		document: normalized.document,
	});
	const snapshot: DraftSourceSnapshot = {
		rootRealPath: "/restricted/root",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 4096,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "7",
					size: "4096",
					mtimeNanoseconds: "12345",
				},
			},
		],
		parsedJsonByPath: {},
		issues: [],
	};
	return { document: normalized.document, timelinePlan, snapshot };
}

function createBundle({
	fixture = createFixture(),
	planToken = "bundle-token",
}: {
	fixture?: Fixture;
	planToken?: string;
} = {}) {
	const artifact = createImportPlanArtifact({
		snapshot: fixture.snapshot,
		document: fixture.document,
		detectionOutcome: "exact",
		profileId: PLAINTEXT_5_9_PROFILE_ID,
		buildIdentity: { appVersion: "2026.08.04.1", interopSchemaVersion: 1 },
		nowUnixMilliseconds: 1_000_000,
		planToken,
	});
	const result = buildQCutImportBundle({
		artifact,
		document: fixture.document,
		timelinePlan: fixture.timelinePlan,
	});
	expect(result.ok).toBe(true);
	if (!result.ok) {
		throw new Error("bundle build failed");
	}
	return { artifact, bundle: result.bundle, fixture };
}

describe("buildQCutImportBundle", () => {
	it("builds a bundle that passes the shared validator and digest check", () => {
		const { bundle } = createBundle();
		expect(verifyQCutImportBundleDigest({ bundle })).toBe(true);
		const reparsed = parseQCutImportBundleV1(
			JSON.parse(JSON.stringify(bundle))
		);
		expect(reparsed.ok).toBe(true);
		expect(bundle.conflictPolicy.projectName).toBe("rename");
	});

	it("derives deterministic internal ids from the request fingerprint", () => {
		const fixture = createFixture();
		const first = createBundle({ fixture, planToken: "t-1" });
		const second = createBundle({ fixture, planToken: "t-2" });
		// Same source → same request fingerprint → same internal ids,
		// regardless of the (random) plan token.
		expect(second.bundle.internalIdBySemanticId).toEqual(
			first.bundle.internalIdBySemanticId
		);
		const ids = Object.values(first.bundle.internalIdBySemanticId);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
		}
	});

	it("stages only resources the plan references, with safe keys", () => {
		const { bundle, fixture } = createBundle();
		expect(bundle.resourceStaging.map((entry) => entry.resourceId)).toEqual(
			fixture.timelinePlan.resourceIds
		);
		for (const entry of bundle.resourceStaging) {
			expect(entry.stagingKey).not.toContain("/");
			expect(entry.stagingKey).not.toContain("..");
		}
	});
});

describe("parseQCutImportBundleV1", () => {
	it("rejects tampered digests at the byte level", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.timelinePlan.project.name = "evil";
		// Structure is still valid...
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(true);
		// ...but the digest no longer matches.
		if (parsed.ok) {
			expect(verifyQCutImportBundleDigest({ bundle: parsed.bundle })).toBe(
				false
			);
			expect(computeQCutImportBundleDigest({ bundle: parsed.bundle })).not.toBe(
				parsed.bundle.bundleDigest
			);
		}
	});

	it("rejects unknown schema versions and malformed digests", () => {
		const { bundle } = createBundle();
		const wrongVersion = {
			...JSON.parse(JSON.stringify(bundle)),
			schemaVersion: 2,
		};
		expect(parseQCutImportBundleV1(wrongVersion).ok).toBe(false);
		const badDigest = {
			...JSON.parse(JSON.stringify(bundle)),
			bundleDigest: "not-a-digest",
		};
		expect(parseQCutImportBundleV1(badDigest).ok).toBe(false);
	});

	it("rejects a plan element that references an unstaged resource", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.resourceStaging = [];
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.issues[0].path).toContain("resourceId");
		}
	});

	it("rejects a plan node without a deterministic internal id", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.internalIdBySemanticId = {};
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.issues[0].message).toContain("internal id");
		}
	});

	it("rejects path-like staging keys", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.resourceStaging[0].stagingKey = "../escape";
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(false);
	});

	it("rejects unknown conflict policies", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.conflictPolicy.projectName = "overwrite";
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(false);
	});

	it("rejects a staging entry for an undeclared resource", () => {
		const { bundle } = createBundle();
		const tampered = JSON.parse(JSON.stringify(bundle));
		tampered.resourceStaging.push({
			resourceId: "ghost",
			stagingKey: "import-ghost",
			kind: "video",
			status: "pending",
		});
		const parsed = parseQCutImportBundleV1(tampered);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.issues[0].message).toContain("undeclared resource");
		}
	});
});
