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
			{
				alias: "title:1",
				// The operation id doubles as the requested element id for replays.
				id: "title:1",
				type: "text",
				content: "Opening title",
			},
		]);
		expect(captionTrack.elements).toMatchObject([
			{
				alias: "caption:1",
				id: "caption:1",
				type: "captions",
				content: "hello",
				language: "en",
			},
		]);
		expect(overlayTrack.elements).toMatchObject([
			{
				alias: "sticker:1",
				id: "sticker:1",
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
			{
				alias: "sound:1",
				id: "sound:1",
				media: "media:sound:1",
				volume: 0.82,
			},
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

	it("preserves prepared Sticker, Sound, and Jianying runtime controls", () => {
		const stickerRuntime = {
			kind: "png-sequence" as const,
			cycleDurationSeconds: 1,
			frames: [
				{
					startSeconds: 0,
					durationSeconds: 1,
					source: "$primary",
				},
			],
			repeat: { kind: "infinite" as const },
			completion: "freeze-last" as const,
		};
		const plan = timelineManifestFromComposePatch({
			projectId: "project-1",
			patch: makePatch({
				operations: [
					{
						kind: "add-sticker",
						id: "sticker:runtime",
						startTime: 1,
						duration: 3,
						x: 0.25,
						y: 0.75,
						rotation: 12,
						opacity: 0.7,
						maintainAspectRatio: true,
						animationInType: "slide",
						animationInDuration: 0.25,
						animationOutType: "scale",
						animationOutDuration: 0.4,
						animationLoopType: "float",
						animationLoopIntensity: 0.6,
						asset: {
							provider: "local",
							assetType: "sticker",
							assetId: "sticker-lab:batch-01:18001",
						},
					},
					{
						kind: "add-sound-effect",
						id: "sound:trimmed",
						startTime: 2,
						duration: 2,
						volume: 0.65,
						trimStart: 0.5,
						trimEnd: 0.25,
						fadeIn: 0.2,
						fadeOut: 0.3,
						playbackRate: 1.5,
						asset: {
							provider: "qcut",
							assetType: "sound-effect",
							assetId: "sound-effects-lab:impact-1",
							localPath: "/assets/impact.wav",
						},
					},
					{
						kind: "upsert-transition",
						id: "transition:jianying",
						trackId: "track-video",
						fromElementId: "element-1",
						toElementId: "element-2",
						startTime: 3.5,
						duration: 1,
						presetId: "jianying-local-white-flash",
					},
				],
			}),
			bindings: {
				"sticker:runtime": {
					sticker: {
						mediaId: "imported-sticker-media",
						stickerAssetId: "sticker-lab:batch-01:18001",
						stickerRuntime,
					},
				},
				"transition:jianying": {
					transition: {
						presetId: "jianying-local-white-flash",
						engine: "jianying-local",
						packageHash: "a".repeat(32),
						type: "fade-white",
						easing: "easeInOut",
						tuning: { intensity: 0.8 },
					},
				},
			},
		});

		const tracks = plan.manifest.tracks as Array<Record<string, unknown>>;
		const stickerTrack = tracks.find((track) => track.type === "sticker");
		const audioTrack = tracks.find((track) => track.type === "audio");
		expect(stickerTrack?.elements).toMatchObject([
			{
				mediaId: "imported-sticker-media",
				stickerAssetId: "sticker-lab:batch-01:18001",
				stickerRuntime,
				x: 25,
				y: 75,
				rotation: 12,
				opacity: 0.7,
				maintainAspectRatio: true,
				animationInType: "slide-up",
				animationInDuration: 0.25,
				animationOutType: "zoom-out",
				animationOutDuration: 0.4,
				animationLoopType: "drift",
				animationLoopIntensity: 0.6,
			},
		]);
		expect(audioTrack?.elements).toMatchObject([
			{
				duration: 3.75,
				trimStart: 0.5,
				trimEnd: 0.25,
				audioFadeIn: 0.2,
				audioFadeOut: 0.3,
				playbackRate: 1.5,
			},
		]);
		expect(plan.manifest.media).toEqual([
			{ alias: "media:sound:trimmed", path: "/assets/impact.wav" },
		]);
		expect(plan.manifest.transitions).toMatchObject([
			{
				presetId: "jianying-local-white-flash",
				engine: "jianying-local",
				packageHash: "a".repeat(32),
				type: "fade-white",
				easing: "easeInOut",
				tuning: { intensity: 0.8 },
			},
		]);
	});
});

describe("compose manifest lane partitioning", () => {
	it("splits overlapping sounds and stickers onto parallel tracks", () => {
		const plan = timelineManifestFromComposePatch({
			patch: makePatch({
				operations: [
					{
						kind: "add-sound-effect",
						id: "sfx:a",
						startTime: 39.5,
						duration: 3,
						volume: 0.8,
						asset: {
							provider: "qcut",
							assetType: "sound-effect",
							assetId: "sound-effects-lab:a",
							localPath: "/assets/a.wav",
						},
					},
					{
						kind: "add-sound-effect",
						id: "sfx:b",
						startTime: 41,
						duration: 2.5,
						volume: 0.8,
						asset: {
							provider: "qcut",
							assetType: "sound-effect",
							assetId: "sound-effects-lab:b",
							localPath: "/assets/b.wav",
						},
					},
					{
						kind: "add-sound-effect",
						id: "sfx:c",
						startTime: 44,
						duration: 1,
						volume: 0.8,
						asset: {
							provider: "qcut",
							assetType: "sound-effect",
							assetId: "sound-effects-lab:c",
							localPath: "/assets/c.wav",
						},
					},
				],
			}),
		});
		const tracks = (
			plan.manifest.tracks as Array<{
				alias: string;
				elements: Array<{ alias: string }>;
			}>
		).filter((track) => track.alias.startsWith("compose-audio"));
		// sfx:a (39.5–42.5) and sfx:b (41–43.5) overlap; sfx:c (44–45)
		// reuses the first lane after it frees up.
		expect(tracks.map((track) => track.alias)).toEqual([
			"compose-audio",
			"compose-audio-2",
		]);
		expect(tracks[0].elements.map(({ alias }) => alias)).toEqual([
			"sfx:a",
			"sfx:c",
		]);
		expect(tracks[1].elements.map(({ alias }) => alias)).toEqual(["sfx:b"]);
		expect(plan.plannedOperationIds).toEqual(["sfx:a", "sfx:b", "sfx:c"]);
	});

	it("skips unbound clips and filter operations instead of dropping them", () => {
		const plan = timelineManifestFromComposePatch({
			projectId: "project-1",
			patch: makePatch({
				operations: [
					{
						kind: "insert-media-clip",
						id: "clip:a",
						startTime: 0,
						duration: 10,
						asset: {
							provider: "local",
							assetType: "media",
							assetId: "manifest:a.mp4",
						},
						mediaKind: "video",
						trackRole: "main-video",
						trimStart: 1,
						trimEnd: 1,
						sourceDuration: 12,
					},
					{
						kind: "set-media-filter-stack",
						id: "stack:a",
						startTime: 0,
						duration: 10,
						trackId: "clip:a",
						elementId: "clip:a",
						filters: [
							{
								id: "step-1",
								asset: {
									provider: "local",
									assetType: "filter",
									assetId: "123",
								},
								intensity: 60,
								enabled: true,
							},
						],
					},
					{
						kind: "upsert-transition",
						id: "transition:a-b",
						startTime: 9.75,
						duration: 0.5,
						trackId: "main-video",
						fromElementId: "clip:a",
						toElementId: "clip:b",
						presetId: "crossfade",
					},
				],
			}),
		});
		expect(plan.plannedOperationIds).toEqual([]);
		expect(plan.plannedTransitionOperationIds).toEqual([]);
		expect(plan.skipped.map(({ operationId }) => operationId)).toEqual([
			"clip:a",
			"stack:a",
			"transition:a-b",
		]);
	});

	it("plans bound media clips onto the main track with pending transitions", () => {
		const clipAsset = (source: string) => ({
			provider: "local" as const,
			assetType: "media" as const,
			assetId: `manifest:${source}`,
			localPath: `/abs/${source}`,
		});
		const plan = timelineManifestFromComposePatch({
			projectId: "project-1",
			mainVideoTrackId: "track-main",
			patch: makePatch({
				operations: [
					{
						kind: "insert-media-clip",
						id: "clip:a",
						startTime: 0,
						duration: 9.75,
						asset: clipAsset("a.mp4"),
						mediaKind: "video",
						trackRole: "main-video",
						trimStart: 1,
						trimEnd: 1.25,
						sourceDuration: 12,
					},
					{
						kind: "insert-media-clip",
						id: "clip:b",
						startTime: 9.75,
						duration: 4.75,
						asset: clipAsset("b.mp4"),
						mediaKind: "video",
						trackRole: "main-video",
						trimStart: 0.25,
						trimEnd: 0,
						sourceDuration: 5,
					},
					{
						kind: "upsert-transition",
						id: "transition:a-b",
						startTime: 9.5,
						duration: 0.5,
						trackId: "main-video",
						fromElementId: "clip:a",
						toElementId: "clip:b",
						presetId: "crossfade",
					},
				],
			}),
		});
		expect(plan.skipped).toEqual([]);
		expect(plan.plannedOperationIds).toEqual(["clip:a", "clip:b"]);
		expect(plan.plannedTransitionOperationIds).toEqual(["transition:a-b"]);
		expect(plan.manifest.media).toEqual([
			{ alias: "media:clip:a", path: "/abs/a.mp4" },
			{ alias: "media:clip:b", path: "/abs/b.mp4" },
		]);
		const tracks = plan.manifest.tracks as Array<{
			alias: string;
			trackId?: string;
			elements: Array<Record<string, unknown>>;
		}>;
		const mainTrack = tracks.find((track) => track.alias === "main-video");
		expect(mainTrack?.trackId).toBe("track-main");
		expect(mainTrack?.elements.map((element) => element.alias)).toEqual([
			"clip:a",
			"clip:b",
		]);
		expect(mainTrack?.elements[0]).toMatchObject({
			type: "media",
			media: "media:clip:a",
			trimStart: 1,
			trimEnd: 1.25,
			startTime: 0,
			duration: 9.75,
		});
		const transitions = plan.manifest.transitions as Array<
			Record<string, unknown>
		>;
		expect(transitions).toHaveLength(1);
		expect(transitions[0]).toMatchObject({
			track: "main-video",
			from: "clip:a",
			to: "clip:b",
			presetId: "dissolve",
			duration: 0.5,
		});
	});
});
