import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createEditPlan,
	createTimelineManifest,
	editPlanInternals,
} from "../edit-plan.js";
import { buildScriptBeats } from "../narration.js";
import {
	EDIT_DECISION_LIST_VERSION,
	MEDIA_INDEX_VERSION,
	type EditDecisionList,
	type IndexedMediaSource,
	type MediaIndex,
	type RangeMetrics,
} from "../types.js";

const RANGE_METRICS: RangeMetrics = {
	sharpness: 0.82,
	stability: 0.88,
	exposure: 0.8,
	motionDirection: "right",
	motionMagnitude: 1.2,
	subjectPosition: "center",
	subjectX: 0.5,
	subjectY: 0.5,
};

function source({
	id,
	filename,
	tags,
	start,
}: {
	id: string;
	filename: string;
	tags: string[];
	start: number;
}): IndexedMediaSource {
	return {
		id,
		source: `/media/${filename}`,
		filename,
		bytes: 1000,
		modifiedAt: "2026-07-24T00:00:00.000Z",
		fingerprint: id.repeat(8),
		probe: {
			duration: 20,
			width: 1920,
			height: 1080,
			fps: 30,
			hasAudio: false,
		},
		sceneBoundaries: [0],
		samples: [],
		scenes: [
			{
				id: `${id}-scene-1`,
				start: 0,
				end: 20,
				duration: 20,
				representativeTime: start + 3,
				description: tags.join(" "),
				tags,
				metrics: RANGE_METRICS,
				stableRanges: [],
				candidates: [
					{
						id: `${id}-candidate-1`,
						start,
						end: start + 6,
						duration: 6,
						score: 0.9,
						metrics: RANGE_METRICS,
						reason: "stable composition, high sharpness",
					},
				],
			},
		],
		stableRanges: [],
		candidates: [],
		semantics: {
			summary: tags.join(" "),
			tags,
			locations: ["Melbourne"],
			subjects: tags,
			scenes: [],
			model: "test-model",
		},
		warnings: [],
	};
}

function mediaIndex(): MediaIndex {
	return {
		version: MEDIA_INDEX_VERSION,
		createdAt: "2026-07-24T00:00:00.000Z",
		root: "/media",
		options: {
			sampleFps: 2,
			sceneThreshold: 0.32,
			candidateDuration: 6,
			recursive: true,
		},
		sources: [
			source({
				id: "yarra",
				filename: "pexels-yarra-riverfront.mp4",
				tags: ["yarra", "river", "waterfront"],
				start: 2,
			}),
			source({
				id: "tram",
				filename: "melbourne-tram.mp4",
				tags: ["tram", "streetcar", "city"],
				start: 5,
			}),
		],
		warnings: [],
	};
}

describe("editorial edit planning", () => {
	it("matches narration beats to semantic candidates and writes source trims", async () => {
		const root = await fs.mkdtemp(resolve(tmpdir(), "qcut-edit-plan-"));
		const index = mediaIndex();
		const beats = buildScriptBeats({
			script: "YARRA: Yarra river.\nTRAM: City tram.",
			duration: 12,
		});

		try {
			const result = await createEditPlan({
				index,
				indexPath: resolve(root, "index.json"),
				scriptPath: resolve(root, "narration.en.txt"),
				language: "en",
				beats,
				duration: 12,
				transitionDuration: 0.3,
				outputDir: root,
			});

			expect(result.edl.clips).toHaveLength(2);
			expect(result.edl.clips[0]).toMatchObject({
				sourceId: "yarra",
				start: 2,
				end: 8,
				beat: "YARRA",
			});
			expect(result.edl.clips[1]).toMatchObject({
				sourceId: "tram",
				start: 5,
				end: 11,
				beat: "TRAM",
			});
			expect(result.manifest.tracks[0].elements[0]).toMatchObject({
				duration: 20,
				trimStart: 2,
				trimEnd: 12,
				startTime: 0,
			});
			expect(result.manifest.transitions[0]).toMatchObject({
				from: "clip-01",
				to: "clip-02",
				type: "dissolve",
				duration: 0.3,
			});
			await expect(fs.stat(result.edlPath)).resolves.toBeDefined();
			await expect(fs.stat(result.manifestPath)).resolves.toBeDefined();
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("adds narration as an audio track without changing source-space trim semantics", () => {
		const index = mediaIndex();
		const edl: EditDecisionList = {
			version: EDIT_DECISION_LIST_VERSION,
			createdAt: "2026-07-24T00:00:00.000Z",
			index: "/media/index.json",
			narration: "/media/narration.wav",
			language: "en",
			duration: 6,
			beats: [],
			clips: [
				{
					id: "clip-01",
					source: "pexels-yarra-riverfront.mp4",
					sourceId: "yarra",
					start: 2,
					end: 8,
					timelineStart: 0,
					timelineEnd: 6,
					beat: "YARRA",
					beatText: "The Yarra River.",
					reason: "test",
					score: 1,
					motionDirection: "right",
					subjectPosition: "center",
				},
			],
			warnings: [],
		};

		const manifest = createTimelineManifest({
			index,
			edl,
			narrationDuration: 7,
		});

		expect(manifest.tracks.map((track) => track.type)).toEqual([
			"media",
			"audio",
		]);
		expect(manifest.tracks[1].elements[0]).toMatchObject({
			duration: 7,
			trimStart: 0,
			trimEnd: 1,
		});
	});

	it("uses one timeline boundary for adjacent clips and matching source trims", async () => {
		const root = await fs.mkdtemp(resolve(tmpdir(), "qcut-edit-timing-"));
		const index = mediaIndex();
		const beats = buildScriptBeats({
			script:
				"OPEN: Melbourne wakes beside the river.\nCITY: Trams cross the city grid.\nDUSK: The skyline settles into dusk.",
			duration: 17,
		});

		try {
			const result = await createEditPlan({
				index,
				indexPath: resolve(root, "index.json"),
				language: "en",
				beats,
				duration: 17,
				transitionDuration: 0,
				outputDir: root,
			});
			const elements = result.manifest.tracks[0].elements;

			expect(result.manifest.transitions).toEqual([]);
			for (let index = 1; index < result.edl.clips.length; index++) {
				expect(result.edl.clips[index].timelineStart).toBe(
					result.edl.clips[index - 1].timelineEnd
				);
			}
			for (const [index, clip] of result.edl.clips.entries()) {
				const element = elements[index];
				const timelineDuration = clip.timelineEnd - clip.timelineStart;
				const sourceDuration = clip.end - clip.start;
				const manifestDuration =
					element.duration - element.trimStart - element.trimEnd;

				expect(sourceDuration).toBeCloseTo(timelineDuration, 6);
				expect(manifestDuration).toBeCloseTo(timelineDuration, 6);
			}
			expect(result.edl.clips.at(-1)?.timelineEnd).toBe(17);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("penalizes opposite motion while preserving semantic relevance", () => {
		const score = editPlanInternals.continuityScore({
			previous: {
				id: "previous",
				source: "a.mp4",
				sourceId: "a",
				start: 0,
				end: 6,
				timelineStart: 0,
				timelineEnd: 6,
				beat: "A",
				beatText: "A",
				reason: "A",
				score: 1,
				motionDirection: "right",
				subjectPosition: "center",
			},
			candidate: {
				source: mediaIndex().sources[1],
				scene: mediaIndex().sources[1].scenes[0],
				range: {
					...mediaIndex().sources[1].scenes[0].candidates[0],
					metrics: { ...RANGE_METRICS, motionDirection: "left" },
				},
				corpus: "tram",
			},
		});

		expect(score).toBeLessThan(0.5);
	});
});
