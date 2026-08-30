import { describe, expect, it } from "vitest";
import {
	computeComposeSourceFingerprint as coreFingerprint,
	validateComposeJob as coreValidateJob,
	validateComposePatch as coreValidatePatch,
	validateComposeSnapshot as coreValidateSnapshot,
	type ComposeJob as CoreComposeJob,
	type ComposePatch as CoreComposePatch,
	type ComposeSnapshot as CoreComposeSnapshot,
} from "@qcut/editor-core/compose";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint as mirrorFingerprint,
	validateComposeJob as mirrorValidateJob,
	validateComposePatch as mirrorValidatePatch,
	validateComposeSnapshot as mirrorValidateSnapshot,
	type ComposeJob,
	type ComposePatch,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";

function fixtureSnapshot(): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 30,
	};
	const media = [
		{
			id: "media-1",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-1",
			startTime: 0,
			duration: 20,
			trimStart: 0,
		},
		{
			id: "media-1",
			kind: "video" as const,
			trackId: "track-b",
			elementId: "element-2",
			startTime: 0,
			duration: 10,
			trimStart: 0,
		},
	];
	const captions = [
		{ id: "caption-1", text: "hello", startTime: 1, duration: 2 },
	];
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: mirrorFingerprint({ project, media, captions }),
		project,
		media,
		captions,
		beats: [{ id: "beat:0", timestamp: 3 }],
		shots: [{ id: "shot-1", startTime: 0, duration: 10 }],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function fixturePatch({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "patch-1",
		source: "local-heuristic",
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: snapshot.id,
		sourceFingerprint: snapshot.sourceFingerprint,
		createdAt: "2026-08-30T00:01:00.000Z",
		operations: [
			{
				kind: "add-sticker",
				id: "sticker:1",
				startTime: 2,
				duration: 3,
				asset: { provider: "local", assetType: "sticker", assetId: " " },
			},
			{
				kind: "update-media-zoom",
				id: "zoom:1",
				trackId: "track-video",
				elementId: "element-missing",
				startTime: 25,
				duration: 10,
				fromScale: 1,
				toScale: 1.2,
			},
		],
		warnings: [],
	};
}

describe("compose protocol mirror stays equivalent to editor-core", () => {
	it("computes identical fingerprints", () => {
		const snapshot = fixtureSnapshot();
		expect(
			coreFingerprint({
				project: snapshot.project,
				media: snapshot.media,
				captions: snapshot.captions,
			})
		).toBe(snapshot.sourceFingerprint);
	});

	it("emits identical snapshot validation issues", () => {
		const snapshot = fixtureSnapshot();
		const broken = {
			...snapshot,
			media: [],
			captions: [],
			beats: [{ id: "beat:0", timestamp: -1 }],
			shots: [{ id: "shot-1", startTime: 0, duration: 0 }],
		};
		expect(mirrorValidateSnapshot({ snapshot: broken })).toEqual(
			coreValidateSnapshot({
				snapshot: broken as unknown as CoreComposeSnapshot,
			})
		);
	});

	it("emits identical job validation issues", () => {
		const snapshot = fixtureSnapshot();
		const job: ComposeJob = {
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			id: "job-1",
			provider: "local",
			intentKind: "smart-packaging",
			snapshotId: "other-snapshot",
			snapshotFingerprint: "0".repeat(64),
			status: "completed",
			progress: 2,
			createdAt: "2026-08-30T00:00:00.000Z",
			updatedAt: "2026-08-30T00:01:00.000Z",
			attempt: 1,
		};
		expect(mirrorValidateJob({ job, snapshot })).toEqual(
			coreValidateJob({
				job: job as unknown as CoreComposeJob,
				snapshot: snapshot as unknown as CoreComposeSnapshot,
			})
		);
	});

	it("emits identical patch validation issues", () => {
		const snapshot = fixtureSnapshot();
		const patch = fixturePatch({ snapshot });
		expect(mirrorValidatePatch({ snapshot, patch })).toEqual(
			coreValidatePatch({
				snapshot: snapshot as unknown as CoreComposeSnapshot,
				patch: patch as unknown as CoreComposePatch,
			})
		);
	});
});
