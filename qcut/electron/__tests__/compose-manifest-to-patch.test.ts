import { describe, expect, it } from "vitest";
import {
	ComposeManifestCompileError,
	compileComposeManifestToPatch,
	type ComposeManifestSourceInfo,
} from "../native-pipeline/compose/compose-manifest-to-patch.js";
import { parseComposeManifest } from "../native-pipeline/compose/compose-manifest.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	validateComposePatch,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";

const MANIFEST_SHA = "a".repeat(64);
const CREATED_AT = "2026-08-31T00:00:00.000Z";

function emptySnapshot(): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 0,
	};
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: CREATED_AT,
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media: [],
			captions: [],
		}),
		project,
		media: [],
		captions: [],
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function fixtureManifest() {
	return parseComposeManifest({
		value: {
			schemaVersion: 1,
			canvas: { width: 1920, height: 1080, fps: 30 },
			clips: [
				{
					id: "a",
					source: "a.mp4",
					trim: { in: 1, out: 11 },
					filters: [{ resourceId: "123", intensity: 60 }],
				},
				{ id: "b", source: "b.mp4" },
			],
			transitions: [
				{ between: ["a", "b"], preset: "crossfade", duration: 0.5 },
			],
			overlays: [
				{
					type: "sticker",
					source: "s.gif",
					start: 2,
					duration: 3,
					transform: { x: 0.5, y: -0.5, scale: 0.3, rotation: 10 },
					opacity: 0.9,
					fadeIn: 0.4,
					fadeOut: 0,
				},
			],
			audio: [
				{
					type: "sound-effect",
					source: "fx.mp3",
					start: 1,
					trim: { in: 0.5, out: 2.5 },
					volume: 0.8,
					fadeIn: 0.1,
					fadeOut: 0.2,
				},
			],
		},
	});
}

function fixtureSources(): Record<string, ComposeManifestSourceInfo> {
	return {
		"a.mp4": { durationSeconds: 12, mediaKind: "video" },
		"b.mp4": { durationSeconds: 5, mediaKind: "video" },
		"fx.mp3": { durationSeconds: 3, mediaKind: "audio" },
	};
}

function compileFixture() {
	return compileComposeManifestToPatch({
		manifest: fixtureManifest(),
		manifestSha256: MANIFEST_SHA,
		projectId: "project-1",
		snapshot: emptySnapshot(),
		sources: fixtureSources(),
		createdAt: CREATED_AT,
	});
}

describe("compose manifest compiler", () => {
	it("lays out clips adjacently with half-transition handle trims", () => {
		const { patch, timelineDuration } = compileFixture();
		const clips = patch.operations.filter(
			(operation) => operation.kind === "insert-media-clip"
		);
		expect(clips).toHaveLength(2);
		const [clipA, clipB] = clips;
		expect(clipA).toMatchObject({
			startTime: 0,
			duration: 9.75,
			trimStart: 1,
			trimEnd: 1.25,
			sourceDuration: 12,
			trackRole: "main-video",
		});
		expect(clipB).toMatchObject({
			startTime: 9.75,
			duration: 4.75,
			trimStart: 0.25,
			trimEnd: 0,
			sourceDuration: 5,
		});
		expect(timelineDuration).toBeCloseTo(14.5, 6);
	});

	it("bridges transitions between the pending clip operation ids", () => {
		const { patch } = compileFixture();
		const clips = patch.operations.filter(
			(operation) => operation.kind === "insert-media-clip"
		);
		const transition = patch.operations.find(
			(operation) => operation.kind === "upsert-transition"
		);
		expect(transition).toMatchObject({
			trackId: "main-video",
			fromElementId: clips[0].id,
			toElementId: clips[1].id,
			presetId: "crossfade",
			startTime: 9.5,
			duration: 0.5,
		});
	});

	it("emits filter stacks bound to the pending clip id", () => {
		const { patch } = compileFixture();
		const clipA = patch.operations.find(
			(operation) => operation.kind === "insert-media-clip"
		);
		const stack = patch.operations.find(
			(operation) => operation.kind === "set-media-filter-stack"
		);
		expect(stack).toBeDefined();
		if (stack?.kind !== "set-media-filter-stack" || !clipA) return;
		expect(stack.trackId).toBe(clipA.id);
		expect(stack.elementId).toBe(clipA.id);
		expect(stack.filters).toEqual([
			{
				id: `${clipA.id}-f0`,
				asset: { provider: "local", assetType: "filter", assetId: "123" },
				intensity: 60,
				enabled: true,
			},
		]);
	});

	it("maps overlays and audio into sticker and sound operations", () => {
		const { patch } = compileFixture();
		const sticker = patch.operations.find(
			(operation) => operation.kind === "add-sticker"
		);
		expect(sticker).toMatchObject({
			startTime: 2,
			duration: 3,
			x: 0.75,
			y: 0.25,
			width: 0.3,
			rotation: 10,
			opacity: 0.9,
			maintainAspectRatio: true,
			animationInType: "fade",
			animationInDuration: 0.4,
			animationOutType: "none",
		});
		const sound = patch.operations.find(
			(operation) => operation.kind === "add-sound-effect"
		);
		expect(sound).toMatchObject({
			startTime: 1,
			duration: 2,
			volume: 0.8,
			trimStart: 0.5,
			trimEnd: 0.5,
			fadeIn: 0.1,
			fadeOut: 0.2,
		});
	});

	it("is deterministic and keyed by project id", () => {
		const first = compileFixture();
		const second = compileFixture();
		expect(second.patch).toEqual(first.patch);
		for (const operation of first.patch.operations) {
			expect(operation.id).toMatch(/^cmp-[0-9a-f]{24}$/);
		}
		const other = compileComposeManifestToPatch({
			manifest: fixtureManifest(),
			manifestSha256: MANIFEST_SHA,
			projectId: "project-2",
			snapshot: emptySnapshot(),
			sources: fixtureSources(),
			createdAt: CREATED_AT,
		});
		expect(other.patch.operations[0].id).not.toBe(first.patch.operations[0].id);
	});

	it("produces a patch that passes protocol validation", () => {
		const snapshot = emptySnapshot();
		const { patch } = compileFixture();
		expect(validateComposePatch({ snapshot, patch })).toEqual([]);
	});

	it("refuses missing probes, bad transitions, and empty segments", () => {
		const missingProbe = () =>
			compileComposeManifestToPatch({
				manifest: fixtureManifest(),
				manifestSha256: MANIFEST_SHA,
				projectId: "project-1",
				snapshot: emptySnapshot(),
				sources: { "fx.mp3": { durationSeconds: 3, mediaKind: "audio" } },
				createdAt: CREATED_AT,
			});
		expect(missingProbe).toThrow(ComposeManifestCompileError);
		expect(missingProbe).toThrow(/no probe info/);

		const nonAdjacent = parseComposeManifest({
			value: {
				schemaVersion: 1,
				clips: [
					{ id: "a", source: "a.mp4" },
					{ id: "b", source: "b.mp4" },
					{ id: "c", source: "b.mp4" },
				],
				transitions: [{ between: ["a", "c"], duration: 0.5 }],
			},
		});
		expect(() =>
			compileComposeManifestToPatch({
				manifest: nonAdjacent,
				manifestSha256: MANIFEST_SHA,
				projectId: "project-1",
				snapshot: emptySnapshot(),
				sources: fixtureSources(),
				createdAt: CREATED_AT,
			})
		).toThrow(/not adjacent/);

		const eaten = parseComposeManifest({
			value: {
				schemaVersion: 1,
				clips: [{ id: "a", source: "a.mp4", trim: { in: 11.95, out: 12 } }],
			},
		});
		expect(() =>
			compileComposeManifestToPatch({
				manifest: eaten,
				manifestSha256: MANIFEST_SHA,
				projectId: "project-1",
				snapshot: emptySnapshot(),
				sources: fixtureSources(),
				createdAt: CREATED_AT,
			})
		).toThrow(/remain after trims/);
	});

	it("requires image clips to declare a display duration", () => {
		const manifest = parseComposeManifest({
			value: {
				schemaVersion: 1,
				clips: [{ id: "img", source: "still.png" }],
			},
		});
		expect(() =>
			compileComposeManifestToPatch({
				manifest,
				manifestSha256: MANIFEST_SHA,
				projectId: "project-1",
				snapshot: emptySnapshot(),
				sources: { "still.png": { mediaKind: "image" } },
				createdAt: CREATED_AT,
			})
		).toThrow(/image clips need trim.out/);
	});
});
