import { describe, expect, it } from "vitest";

import {
	CameraImageGenerator,
	collectVideoReferenceImages,
} from "../camera-generator.js";
import {
	CharacterPortraitRegistry,
	createCharacterPortrait,
} from "../../types/character.js";
import { createScene, createShotDescription } from "../../types/shot.js";
import { createImageOutput, createVideoOutput } from "../../types/output.js";
import type { StoryboardResult } from "../storyboard-artist.js";

describe("collectVideoReferenceImages", () => {
	it("combines shot, registry, and explicit references without duplicates", () => {
		const registry = new CharacterPortraitRegistry("project-1");
		registry.addPortrait(
			createCharacterPortrait({
				character_name: "Mara",
				front_view: "/tmp/portraits/mara-front.png",
				side_view: "/tmp/portraits/mara-side.png",
			})
		);
		registry.addPortrait(
			createCharacterPortrait({
				character_name: "Jon",
				front_view: "/tmp/portraits/jon-front.png",
			})
		);
		const shot = createShotDescription({
			shot_id: "s1",
			description: "Mara and Jon study a map",
			camera_angle: "front",
			characters: ["Mara", "Jon"],
			character_references: {
				Mara: "/tmp/portraits/mara-front.png",
				Jon: "/tmp/portraits/jon-front.png",
			},
			primary_reference_image: "/tmp/portraits/mara-front.png",
		});

		const references = collectVideoReferenceImages({
			shot,
			portraitRegistry: registry,
			extraReferenceImages: [
				"/tmp/style/reference.png",
				"/tmp/portraits/jon-front.png",
			],
			maxReferences: 3,
		});

		expect(references).toEqual([
			"/tmp/portraits/mara-front.png",
			"/tmp/portraits/jon-front.png",
			"/tmp/style/reference.png",
		]);
	});
});

describe("CameraImageGenerator video concurrency", () => {
	it("runs video tasks concurrently without reordering successful clips", async () => {
		const generator = new CameraImageGenerator({
			output_dir: "/tmp/qcut-camera-concurrency-test",
			video_concurrency: 2,
		});
		const events: string[] = [];
		let inFlight = 0;
		let maxInFlight = 0;

		const fakeAdapter = {
			generate: async (
				sourceImage: string,
				prompt: string,
				options: {
					duration: number;
					output_path: string;
					reference_images: string[];
					include_source_image: boolean;
				}
			) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				events.push(`start:${sourceImage}`);
				await new Promise((resolve) => setTimeout(resolve, 20));
				events.push(`end:${sourceImage}`);
				inFlight--;

				return createVideoOutput({
					video_path: options.output_path,
					source_image: sourceImage,
					prompt,
					model: "mock-video",
					duration: options.duration,
				});
			},
			concatenateVideos: async (
				videos: Array<{ duration: number }>,
				finalPath: string
			) =>
				createVideoOutput({
					video_path: finalPath,
					model: "mock-video",
					duration: videos.reduce((sum, video) => sum + video.duration, 0),
				}),
		};
		(
			generator as unknown as {
				_videoAdapter: typeof fakeAdapter;
			}
		)._videoAdapter = fakeAdapter;

		const storyboard: StoryboardResult = {
			title: "Parallel Clip Test",
			description: "",
			total_cost: 0,
			scenes: [
				createScene({
					scene_id: "scene-1",
					shots: [
						createShotDescription({
							shot_id: "shot-1",
							description: "first shot",
						}),
						createShotDescription({
							shot_id: "shot-2",
							description: "second shot",
						}),
						createShotDescription({
							shot_id: "shot-3",
							description: "third shot",
						}),
					],
				}),
			],
			images: [1, 2, 3].map((index) =>
				createImageOutput({
					image_path: `/tmp/source-${index}.png`,
					prompt: `source ${index}`,
					model: "mock-image",
				})
			),
		};

		const result = await generator.process(storyboard);

		expect(result.success).toBe(true);
		expect(maxInFlight).toBe(2);
		expect(events.slice(0, 2)).toEqual([
			"start:/tmp/source-1.png",
			"start:/tmp/source-2.png",
		]);
		expect(result.result?.videos.map((video) => video.video_path)).toEqual([
			"/tmp/qcut-camera-concurrency-test/Parallel_Clip_Test/shot-1.mp4",
			"/tmp/qcut-camera-concurrency-test/Parallel_Clip_Test/shot-2.mp4",
			"/tmp/qcut-camera-concurrency-test/Parallel_Clip_Test/shot-3.mp4",
		]);
	});
});
