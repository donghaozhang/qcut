// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTextRasterInputs } from "../ffmpeg/text-raster-input.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("text raster inputs", () => {
	it("loops a static transparent text image for the layer duration", async () => {
		const directory = await mkdtemp(join(tmpdir(), "qcut-text-raster-"));
		temporaryDirectories.push(directory);
		const imagePath = join(directory, "font-title.png");
		await writeFile(imagePath, new Uint8Array([137, 80, 78, 71]));
		const args: string[] = [];

		const resolved = appendTextRasterInputs({
			args,
			layers: [
				{
					elementId: "font-title",
					source: { kind: "image", path: imagePath },
					startTime: 1,
					endTime: 5,
					blendMode: "normal",
					x: 10,
					y: 20,
				},
			],
			startInputIndex: 2,
		});

		expect(args).toEqual(["-loop", "1", "-framerate", "1", "-i", imagePath]);
		expect(resolved[0]).toMatchObject({ inputIndex: 2, sourceIndex: 0 });
	});
});
