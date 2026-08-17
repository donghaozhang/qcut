import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	applyJianyingTimelineEffects,
	collectJianyingEffectRequests,
} from "../export-engine-cli-jianying-effects";

function trackWithEffects({
	effects,
	startTime = 0,
	duration = 5,
	muted = false,
	hidden = false,
	trackHidden = false,
}: {
	effects: unknown[];
	startTime?: number;
	duration?: number;
	muted?: boolean;
	hidden?: boolean;
	trackHidden?: boolean;
}) {
	return [
		{
			id: "track-1",
			name: "Track",
			type: "media",
			muted,
			hidden: trackHidden,
			elements: [
				{
					id: "element-1",
					type: "media",
					mediaId: "media-1",
					name: "clip",
					startTime,
					duration,
					trimStart: 0,
					trimEnd: 0,
					hidden,
					effects,
				},
			],
		},
	] as unknown as TimelineTrack[];
}

function labEffect(overrides: Record<string, unknown> = {}) {
	return {
		id: "a",
		presetId: "jy-effect-1",
		name: "胶片框",
		effectType: "motion",
		parameters: {},
		duration: 3,
		enabled: true,
		engine: "jianying-local",
		packageHash: "ec4c71da4734c48f5511d698cf9daa90",
		...overrides,
	};
}

describe("collectJianyingEffectRequests", () => {
	it("ignores effects rendered by QCut's own stages", () => {
		const tracks = trackWithEffects({
			effects: [
				{
					id: "a",
					presetId: "dynamic-camera-shake",
					name: "Shake",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: true,
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([]);
	});

	it("offsets a clip-local range by the clip's timeline position", () => {
		const tracks = trackWithEffects({
			startTime: 4,
			effects: [
				{
					id: "a",
					presetId: "jy-effect-7399495765409746216",
					name: "抖动",
					effectType: "motion",
					parameters: {},
					duration: 3,
					enabled: true,
					engine: "jianying-local",
					packageHash: "42112d384ec900b128be844abd220835",
					timelineRange: { startTime: 1.5, duration: 2 },
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([
			{
				effectId: "jy-effect-7399495765409746216",
				packageHash: "42112d384ec900b128be844abd220835",
				startSeconds: 5.5,
				durationSeconds: 2,
			},
		]);
	});

	it("carries the effect's slider values into the render request", () => {
		const adjustValues = [
			{ key: "effects_adjust_speed", value: 0.8 },
			{ key: "effects_adjust_background_animation", value: 0.2 },
		];
		const tracks = trackWithEffects({
			effects: [labEffect({ adjustValues })],
		});

		expect(collectJianyingEffectRequests({ tracks })[0].adjustValues).toEqual(
			adjustValues
		);
	});

	it("skips effects on hidden clips, hidden tracks, and muted tracks", () => {
		expect(
			collectJianyingEffectRequests({
				tracks: trackWithEffects({ effects: [labEffect()], hidden: true }),
			})
		).toEqual([]);
		expect(
			collectJianyingEffectRequests({
				tracks: trackWithEffects({ effects: [labEffect()], trackHidden: true }),
			})
		).toEqual([]);
		expect(
			collectJianyingEffectRequests({
				tracks: trackWithEffects({ effects: [labEffect()], muted: true }),
			})
		).toEqual([]);
	});

	it("skips disabled effects and those missing a package", () => {
		const tracks = trackWithEffects({
			effects: [
				{
					id: "a",
					presetId: "jy-effect-1",
					name: "off",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: false,
					engine: "jianying-local",
					packageHash: "hash",
				},
				{
					id: "b",
					presetId: "jy-effect-2",
					name: "no package",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: true,
					engine: "jianying-local",
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([]);
	});
});

describe("applyJianyingTimelineEffects", () => {
	afterEach(() => {
		Reflect.deleteProperty(window, "electronAPI");
		vi.restoreAllMocks();
	});

	it("keeps a muxable extension on every intermediate pass", async () => {
		const render = vi
			.fn()
			.mockImplementation(({ outputPath }: { outputPath: string }) =>
				Promise.resolve({ outputPath })
			);
		Object.defineProperty(window, "electronAPI", {
			value: { jianyingEffects: { render } },
			configurable: true,
			writable: true,
		});

		const output = await applyJianyingTimelineEffects({
			inputPath: "/tmp/export/out-jianying.mp4",
			requests: [
				{
					effectId: "jy-effect-1",
					packageHash: "hash-1",
					startSeconds: 0,
					durationSeconds: 2,
				},
				{
					effectId: "jy-effect-2",
					packageHash: "hash-2",
					startSeconds: 3,
					durationSeconds: 1,
				},
			],
			fps: 30,
			width: 1920,
			height: 1080,
		});

		const paths = render.mock.calls.map((call) => call[0].outputPath);
		expect(paths).toEqual([
			"/tmp/export/out-jianying-jy-effect-0.mp4",
			"/tmp/export/out-jianying-jy-effect-1.mp4",
		]);
		expect(output.endsWith(".mp4")).toBe(true);
		expect(render.mock.calls.map((call) => call[0].packageHash)).toEqual([
			"hash-1",
			"hash-2",
		]);
	});

	it("stops before the next pass when the export is cancelled", async () => {
		const render = vi
			.fn()
			.mockImplementation(({ outputPath }: { outputPath: string }) =>
				Promise.resolve({ outputPath })
			);
		Object.defineProperty(window, "electronAPI", {
			value: { jianyingEffects: { render } },
			configurable: true,
			writable: true,
		});

		await expect(
			applyJianyingTimelineEffects({
				inputPath: "/tmp/export/out.mp4",
				requests: [
					{
						effectId: "jy-effect-1",
						packageHash: "hash-1",
						startSeconds: 0,
						durationSeconds: 1,
					},
				],
				fps: 30,
				width: 1920,
				height: 1080,
				shouldCancel: () => true,
			})
		).rejects.toThrow("导出已取消");
		expect(render).not.toHaveBeenCalled();
	});
});
