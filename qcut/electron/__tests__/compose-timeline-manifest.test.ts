import { describe, expect, it } from "vitest";
import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposePatch,
} from "../native-pipeline/compose/compose-protocol.js";
import { timelineManifestFromComposePatch } from "../native-pipeline/compose/compose-timeline-manifest.js";

function makePatch({
	operations,
}: {
	operations: ComposePatch["operations"];
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "patch-1",
		source: "local-heuristic",
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: "snapshot-1",
		sourceFingerprint: "f".repeat(64),
		createdAt: "2026-08-30T00:01:00.000Z",
		operations,
		warnings: [],
	};
}

describe("timelineManifestFromComposePatch", () => {
	it("plans additive operations on dedicated compose tracks", () => {
		const plan = timelineManifestFromComposePatch({
			projectId: "project-1",
			patch: makePatch({
				operations: [
					{
						kind: "add-text-overlay",
						id: "title:1",
						text: "Opening title",
						textTemplateId: "plain",
						startTime: 1,
						duration: 2,
					},
					{
						kind: "add-caption",
						id: "caption:1",
						text: "hello",
						language: "en",
						startTime: 1,
						duration: 2,
					},
					{
						kind: "add-sticker",
						id: "sticker:1",
						startTime: 2,
						duration: 3,
						x: 0.7,
						y: 0.2,
						width: 0.18,
						height: 0.18,
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-1",
							localPath: "/assets/sticker.webp",
						},
					},
					{
						kind: "add-sound-effect",
						id: "sound:1",
						startTime: 4,
						duration: 1,
						volume: 0.82,
						asset: {
							provider: "local",
							assetType: "sound-effect",
							assetId: "sound-1",
							localPath: "/assets/pop.wav",
						},
					},
					{
						kind: "upsert-transition",
						id: "transition:1",
						trackId: "track-video",
						fromElementId: "element-1",
						toElementId: "element-2",
						startTime: 19.5,
						duration: 1,
						presetId: "dissolve",
					},
				],
			}),
		});

		expect(plan.manifest.projectId).toBe("project-1");
		const tracks = plan.manifest.tracks as Array<Record<string, unknown>>;
		expect(tracks.map((track) => track.type)).toEqual([
			"text",
			"captions",
			"sticker",
			"audio",
		]);
		const [textTrack, captionTrack, overlayTrack, audioTrack] = tracks;
		expect(textTrack.elements).toMatchObject([
			{ alias: "title:1", type: "text", content: "Opening title" },
		]);
		expect(captionTrack.elements).toMatchObject([
			{
				alias: "caption:1",
				type: "captions",
				content: "hello",
				language: "en",
			},
		]);
		expect(overlayTrack.elements).toMatchObject([
			{
				alias: "sticker:1",
				type: "sticker",
				mediaId: "media:sticker:1",
				stickerId: "sticker:1",
				x: 70,
				y: 20,
				width: 18,
				height: 18,
				stickerGeometrySpace: "canvas-percent",
			},
		]);
		expect(audioTrack.elements).toMatchObject([
			{ alias: "sound:1", media: "media:sound:1", volume: 0.82 },
		]);
		expect(plan.manifest.media).toMatchObject([
			{ alias: "media:sticker:1", path: "/assets/sticker.webp" },
			{ alias: "media:sound:1", path: "/assets/pop.wav" },
		]);
		expect(plan.manifest.transitions).toMatchObject([
			{
				track: "track-video",
				from: "element-1",
				to: "element-2",
				presetId: "dissolve",
				duration: 1,
			},
		]);
		expect(plan.plannedOperationIds).toEqual([
			"title:1",
			"caption:1",
			"sticker:1",
			"sound:1",
		]);
		expect(plan.plannedTransitionOperationIds).toEqual(["transition:1"]);
		expect(plan.skipped).toEqual([]);
	});

	it("plans zoom updates and reports unresolved assets as skipped", () => {
		const plan = timelineManifestFromComposePatch({
			patch: makePatch({
				operations: [
					{
						kind: "update-media-zoom",
						id: "zoom:1",
						trackId: "track-video",
						elementId: "element-1",
						startTime: 4,
						duration: 2,
						fromScale: 1,
						toScale: 1.2,
					},
					{
						kind: "add-sticker",
						id: "sticker:unresolved",
						startTime: 2,
						duration: 3,
						asset: {
							provider: "qcut",
							assetType: "sticker",
							assetId: "cloud-only",
						},
					},
				],
			}),
		});
		expect(plan.plannedOperationIds).toEqual(["zoom:1"]);
		expect(plan.plannedTransitionOperationIds).toEqual([]);
		expect(plan.skipped.map(({ operationId }) => operationId)).toEqual([
			"sticker:unresolved",
		]);
		expect(plan.manifest.updates).toMatchObject([
			{
				alias: "zoom:1",
				elementId: "element-1",
				trackId: "track-video",
				keyframes: {
					scaleX: [
						{ frame: 0, value: 1 },
						{ frame: 60, value: 1.2 },
					],
					scaleY: [
						{ frame: 0, value: 1 },
						{ frame: 60, value: 1.2 },
					],
				},
			},
		]);
		expect(plan.manifest.tracks).toEqual([]);
		expect(plan.manifest.media).toBeUndefined();
	});

	it("normalizes the compose crossfade alias for the editor runtime", () => {
		const plan = timelineManifestFromComposePatch({
			patch: makePatch({
				operations: [
					{
						kind: "upsert-transition",
						id: "transition:crossfade",
						trackId: "track-video",
						fromElementId: "element-1",
						toElementId: "element-2",
						startTime: 4.5,
						duration: 1,
						presetId: "crossfade",
					},
				],
			}),
		});

		expect(plan.manifest.transitions).toMatchObject([
			{ type: "dissolve", presetId: "dissolve" },
		]);
	});
});
