import { describe, it, expect } from "vitest";
import {
	createNovel2MovieConfig,
	filterScriptToClipShotKeys,
	selectShortestClipShotKeys,
	splitNovelText,
} from "../novel2movie";
import type { Script } from "../../agents/screenwriter";
import {
	CameraMovement,
	ShotType,
	createScene,
	createShotDescription,
} from "../../types/shot";

function makeScript({
	title,
	durations,
}: {
	title: string;
	durations: number[];
}): Script {
	return {
		title,
		logline: "",
		total_duration: durations.reduce((sum, duration) => sum + duration, 0),
		scenes: [
			createScene({
				scene_id: `${title}-scene`,
				title: `${title} scene`,
				shots: durations.map((duration, index) =>
					createShotDescription({
						shot_id: `${title}-shot-${index + 1}`,
						description: `${title} shot ${index + 1}`,
						duration_seconds: duration,
						shot_type: ShotType.MEDIUM,
						camera_movement: CameraMovement.STATIC,
					})
				),
			}),
		],
	};
}

describe("splitNovelText", () => {
	it("throws when overlap is greater than or equal to chunk_size", () => {
		expect(() =>
			splitNovelText("short text", { chunk_size: 100, overlap: 100 })
		).toThrow(/overlap/);
	});

	it("throws when overlap exceeds 70% of chunk_size (prevents infinite loop)", () => {
		// Regression: the paragraph-snap branch can reduce the stride to
		// (0.7 * chunk_size + 2 - overlap); if overlap > 70% of chunk_size
		// the stride goes ≤ 0 and `start` walks backwards forever.
		expect(() =>
			splitNovelText("paragraph one.\n\nparagraph two.", {
				chunk_size: 100,
				overlap: 80,
			})
		).toThrow(/70%|forward progress/);
	});

	it("returns a single chunk when text fits in one chunk_size", () => {
		const text = "Hello world";
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 10 });
		expect(chunks).toEqual([text]);
	});

	it("splits text into overlapping chunks", () => {
		const text = "a".repeat(250);
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 20 });
		// Stride 80 produces chunks starting at 0, 80, 160, 240 — the
		// final iteration still emits a tiny tail chunk (matches the
		// original novel2movie behaviour we're preserving).
		expect(chunks.length).toBe(4);
		expect(chunks[0].length).toBe(100);
	});

	it("prefers paragraph boundary when one is close to the end", () => {
		const first = "First paragraph text.".padEnd(90, " ");
		const second = "Second paragraph text.".padEnd(90, " ");
		const text = `${first}\n\n${second}`;
		const chunks = splitNovelText(text, { chunk_size: 100, overlap: 10 });
		// First chunk should end on paragraph break (not mid-word).
		expect(chunks[0].endsWith("\n\n")).toBe(true);
	});
});

describe("novel2movie clip selection", () => {
	it("selects the globally shortest shots while preserving original order in filtered scripts", () => {
		const scripts = [
			makeScript({ title: "chunk-a", durations: [8, 3, 6] }),
			makeScript({ title: "chunk-b", durations: [2, 7, 4] }),
		];

		const selectedKeys = selectShortestClipShotKeys({ scripts, maxClips: 3 });
		const firstChunk = filterScriptToClipShotKeys({
			script: scripts[0],
			chunkIndex: 0,
			selectedKeys,
		});
		const secondChunk = filterScriptToClipShotKeys({
			script: scripts[1],
			chunkIndex: 1,
			selectedKeys,
		});

		expect(firstChunk.scenes.flatMap((scene) => scene.shots)).toHaveLength(1);
		expect(
			firstChunk.scenes[0]?.shots.map((shot) => shot.duration_seconds)
		).toEqual([3]);
		expect(
			secondChunk.scenes[0]?.shots.map((shot) => shot.duration_seconds)
		).toEqual([2, 4]);
	});

	it("breaks equal-duration ties by original script order", () => {
		const scripts = [
			makeScript({ title: "chunk-a", durations: [5, 3] }),
			makeScript({ title: "chunk-b", durations: [3, 2] }),
		];

		const selectedKeys = selectShortestClipShotKeys({ scripts, maxClips: 2 });
		const firstChunk = filterScriptToClipShotKeys({
			script: scripts[0],
			chunkIndex: 0,
			selectedKeys,
		});
		const secondChunk = filterScriptToClipShotKeys({
			script: scripts[1],
			chunkIndex: 1,
			selectedKeys,
		});

		expect(
			firstChunk.scenes[0]?.shots.map((shot) => shot.duration_seconds)
		).toEqual([3]);
		expect(
			secondChunk.scenes[0]?.shots.map((shot) => shot.duration_seconds)
		).toEqual([2]);
	});
});

describe("novel2movie defaults", () => {
	it("uses Seedance Ref2V so default video generation can consume multiple references", () => {
		const config = createNovel2MovieConfig();

		expect(config.video_model).toBe("imarouter_seedance_2_0_ref2v");
		expect(config.video_reference_mode).toBe("storyboard+references");
		expect(config.video_concurrency).toBe(1);
	});
});
