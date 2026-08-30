import { describe, expect, it } from "vitest";
import {
	buildSmartPackagingPlan,
	buildSmartPackagingSnapshot,
	createSmartPackagingCloudJob,
	mergeSmartPackagingTimelinePatches,
	timelinePatchFromSmartPackagingPlan,
	transitionSmartPackagingCloudJob,
	validateSmartPackagingCloudJob,
	validateSmartPackagingSnapshot,
	type SmartPackagingSnapshot,
	type SmartPackagingTimelinePatch,
} from "../templates/index.js";

function snapshotFixture(): SmartPackagingSnapshot {
	return buildSmartPackagingSnapshot({
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: "fingerprint-1",
		project: {
			id: "project-1",
			fps: 30,
			canvasSize: { width: 1080, height: 1920 },
			duration: 6,
		},
		options: {
			style: "knowledge",
			clearExistingSmartPackaging: true,
			clearCurrentSubtitles: false,
			commercialMaterialsOnly: false,
			generateAsr: false,
			generateChapters: false,
			generateIntro: false,
			generateSubtitleAndTextTemplate: true,
			language: "zh",
		},
		media: [
			{
				id: "media-b",
				kind: "video",
				trackId: "track",
				elementId: "shot-b",
				startTime: 3,
				duration: 3,
				trimStart: 0,
			},
			{
				id: "media-a",
				kind: "video",
				trackId: "track",
				elementId: "shot-a",
				startTime: 0,
				duration: 3,
				trimStart: 0,
			},
		],
		captions: [
			{ id: "caption-b", text: "Second moment", startTime: 3.1, duration: 1.8 },
			{ id: "caption-a", text: "First moment!", startTime: 0.2, duration: 1.8 },
		],
		beats: [
			{ timestamp: 3.5, strength: 0.8 },
			{ timestamp: 0.5, strength: 0.9, downbeat: true },
		],
		shots: [
			{
				id: "shot-b",
				trackId: "track",
				elementId: "shot-b",
				startTime: 3,
				endTime: 6,
				transitionEligible: true,
			},
			{
				id: "shot-a",
				trackId: "track",
				elementId: "shot-a",
				startTime: 0,
				endTime: 3,
				transitionEligible: true,
			},
		],
	});
}

function patchFixture({
	patchId,
	operationText,
}: {
	patchId: string;
	operationText: string;
}): SmartPackagingTimelinePatch {
	return {
		schemaVersion: 1,
		id: patchId,
		source: "cloud",
		snapshotId: "snapshot-1",
		sourceFingerprint: "fingerprint-1",
		createdAt: "2026-08-30T00:01:00.000Z",
		provider: "qcut",
		operations: [
			{
				kind: "add-text-overlay",
				id: "text:caption-a:0",
				sourceCaptionId: "caption-a",
				text: operationText,
				textTemplateId: "knowledge-pop",
				startTime: 0.2,
				duration: 1.8,
			},
		],
		warnings: [],
		diagnostics: {
			sourceCounts: { captions: 2, beats: 2, shots: 2 },
			operationCounts: {
				"add-caption": 0,
				"add-text-overlay": 1,
				"add-sticker": 0,
				"add-sound-effect": 0,
				"update-media-zoom": 0,
				"upsert-transition": 0,
			},
		},
	};
}

describe("Smart Packaging protocol", () => {
	it("builds a sorted, validated snapshot contract", () => {
		const snapshot = snapshotFixture();

		expect(snapshot.schemaVersion).toBe(1);
		expect(snapshot.media.map((item) => item.id)).toEqual([
			"media-a",
			"media-b",
		]);
		expect(snapshot.captions.map((caption) => caption.id)).toEqual([
			"caption-a",
			"caption-b",
		]);
		expect(snapshot.beats.map((beat) => beat.timestamp)).toEqual([0.5, 3.5]);
		expect(validateSmartPackagingSnapshot({ snapshot })).toEqual([]);
	});

	it("reports snapshot inputs that cannot be packaged", () => {
		const empty = buildSmartPackagingSnapshot({
			...snapshotFixture(),
			media: [],
			captions: [],
			beats: [],
			shots: [],
		});

		expect(validateSmartPackagingSnapshot({ snapshot: empty })).toEqual([
			expect.objectContaining({ code: "empty-snapshot" }),
			expect.objectContaining({ code: "missing-main-media" }),
		]);
	});

	it("creates a resumable cloud job and validates completed results", () => {
		const snapshot = snapshotFixture();
		const job = createSmartPackagingCloudJob({
			id: "job-1",
			provider: "qcut",
			snapshot,
			createdAt: "2026-08-30T00:00:10.000Z",
			remoteTaskId: "remote-1",
			uploadObjectIds: ["upload-1"],
		});
		const patch = patchFixture({
			patchId: "patch-1",
			operationText: "First moment!",
		});
		const completed = transitionSmartPackagingCloudJob({
			job,
			status: "completed",
			updatedAt: "2026-08-30T00:00:30.000Z",
			progress: 0.7,
			resultPatch: patch,
		});

		expect(job).toMatchObject({
			status: "queued",
			progress: 0,
			attempt: 1,
			snapshotFingerprint: "fingerprint-1",
		});
		expect(completed).toMatchObject({
			status: "completed",
			progress: 1,
			resultPatch: patch,
		});
		expect(
			validateSmartPackagingCloudJob({ job: completed, snapshot })
		).toEqual([]);
	});

	it("converts local packaging plans into provider-neutral timeline patches", () => {
		const snapshot = snapshotFixture();
		const plan = buildSmartPackagingPlan({
			captions: snapshot.captions,
			beats: snapshot.beats,
			shots: snapshot.shots,
		});
		const patch = timelinePatchFromSmartPackagingPlan({
			plan,
			patchId: "patch-1",
			snapshotId: snapshot.id,
			sourceFingerprint: snapshot.sourceFingerprint,
			createdAt: "2026-08-30T00:01:00.000Z",
		});

		expect(patch).toMatchObject({
			schemaVersion: 1,
			source: "local-heuristic",
			snapshotId: "snapshot-1",
			sourceFingerprint: "fingerprint-1",
			provider: "local",
		});
		expect(patch.diagnostics.operationCounts).toMatchObject({
			"add-text-overlay": 2,
			"add-sticker": 2,
			"add-sound-effect": 2,
			"update-media-zoom": 2,
			"upsert-transition": 1,
		});
		expect(
			patch.operations.find(
				(operation) =>
					operation.kind === "add-text-overlay" &&
					operation.sourceCaptionId === "caption-a"
			)
		).toMatchObject({
			kind: "add-text-overlay",
			sourceCaptionId: "caption-a",
		});
	});

	it("merges cloud patches by operation id and rejects snapshot mismatches", () => {
		const base = patchFixture({
			patchId: "base",
			operationText: "Old text",
		});
		const incoming = {
			...patchFixture({
				patchId: "incoming",
				operationText: "New text",
			}),
			warnings: ["provider changed wording"],
		};
		const merged = mergeSmartPackagingTimelinePatches({
			base,
			incoming,
			patchId: "merged",
			createdAt: "2026-08-30T00:02:00.000Z",
		});

		expect(merged.operations).toHaveLength(1);
		expect(merged.operations[0]).toMatchObject({ text: "New text" });
		expect(merged.warnings).toEqual(["provider changed wording"]);
		expect(() =>
			mergeSmartPackagingTimelinePatches({
				base,
				incoming: { ...incoming, sourceFingerprint: "other" },
				patchId: "bad",
				createdAt: "2026-08-30T00:02:00.000Z",
			})
		).toThrow(/different snapshots/);
	});
});
