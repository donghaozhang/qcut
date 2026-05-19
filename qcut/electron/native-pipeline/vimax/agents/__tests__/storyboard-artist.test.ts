import { describe, expect, it } from "vitest";
import { ImageGeneratorAdapter } from "../../adapters/image-adapter.js";
import type { Script } from "../screenwriter.js";
import { StoryboardArtist } from "../storyboard-artist.js";
import { createImageOutput, type ImageOutput } from "../../types/output.js";
import {
	createScene,
	createShotDescription,
	ShotType,
} from "../../types/shot.js";

function wait({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptWithShots({ count }: { count: number }): Script {
	return {
		title: "Concurrency Test",
		logline: "A controlled storyboard concurrency test.",
		total_duration: count * 5,
		scenes: [
			createScene({
				scene_id: "scene-1",
				title: "Observatory",
				location: "Glass observatory",
				time: "Sunrise",
				shots: Array.from({ length: count }, (_, index) =>
					createShotDescription({
						shot_id: `shot-${index + 1}`,
						shot_type: ShotType.WIDE,
						description: `Storyboard beat ${index + 1}`,
					})
				),
			}),
		],
	};
}

describe("StoryboardArtist", () => {
	it("runs storyboard image generation concurrently without exceeding six", async () => {
		const artist = new StoryboardArtist({
			concurrency: 99,
			output_dir: "/tmp/qcut-storyboard-concurrency-test",
		});
		let active = 0;
		let maxActive = 0;

		const fakeAdapter: Pick<ImageGeneratorAdapter, "generate"> = {
			async generate(
				prompt: string,
				options?: { output_path?: string }
			): Promise<ImageOutput> {
				active++;
				maxActive = Math.max(maxActive, active);
				await wait({ ms: 20 });
				active--;
				return createImageOutput({
					image_path: options?.output_path ?? "/tmp/missing.png",
					prompt,
					model: "fake",
					cost: 1,
				});
			},
		};

		const internals = artist as unknown as {
			_imageAdapter: ImageGeneratorAdapter;
		};
		internals._imageAdapter = fakeAdapter as unknown as ImageGeneratorAdapter;

		const result = await artist.process(scriptWithShots({ count: 8 }));

		expect(result.success).toBe(true);
		expect(maxActive).toBe(6);
		expect(result.metadata.concurrency).toBe(6);
		expect(result.metadata.cost).toBe(8);
		expect(result.result?.images).toHaveLength(8);
		expect(result.result?.images.map((image) => image.image_path)).toEqual([
			expect.stringContaining("shot_001"),
			expect.stringContaining("shot_002"),
			expect.stringContaining("shot_003"),
			expect.stringContaining("shot_004"),
			expect.stringContaining("shot_005"),
			expect.stringContaining("shot_006"),
			expect.stringContaining("shot_007"),
			expect.stringContaining("shot_008"),
		]);
	});
});
