import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JianyingTextOverlay } from "../claude/handlers/claude-export-handler/types.js";

const { renderJianyingText } = vi.hoisted(() => ({
	renderJianyingText: vi.fn(),
}));

vi.mock("../jianying-text-runtime/render.js", () => ({
	renderJianyingText,
}));

import { renderJianyingTextRasterLayers } from "../claude/handlers/claude-export-handler/jianying-text-raster.js";
import { buildTextRasterOverlayPassArgs } from "../claude/handlers/claude-export-handler/text-raster-overlay-pass.js";

const temporaryDirectories: string[] = [];

function createOverlay(): JianyingTextOverlay {
	return {
		id: "jianying-title",
		content: "花字",
		reference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: "7328639616670649634",
			packageHash: "22192237621ba88a20b84176ddb9d22a",
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
		startTime: 0.2,
		endTime: 1.2,
		sourceStart: 0.2,
		elementDuration: 2,
		fontSize: 48,
		x: 10,
		y: -5,
		width: 480,
		height: 320,
		rotation: 4,
		opacity: 0.8,
		blendMode: "normal",
		trackOrder: 2,
		elementOrder: 1,
	};
}

afterEach(async () => {
	vi.clearAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Claude export original Jianying text raster pass", () => {
	it("renders the full visible sequence at project FPS and export dimensions", async () => {
		renderJianyingText.mockImplementationOnce(async ({ request }) => ({
			requestId: request.requestId,
			resourceId: request.reference.resourceId,
			packageHash: request.reference.packageHash,
			templateDuration: 3,
			frameCount: request.frameCount,
			strategy: "runtime-parameters",
			cacheHit: false,
			x: 100,
			y: 200,
			width: 960,
			height: 640,
			source: {
				kind: "image-sequence",
				path: "/tmp/jianying/frame-%06d.png",
				frameRate: request.fps,
			},
		}));

		const layers = await renderJianyingTextRasterLayers({
			jobId: "export_job",
			overlays: [createOverlay()],
			projectCanvas: { width: 1920, height: 1080 },
			outputCanvas: { width: 3840, height: 2160 },
			projectFps: 24,
		});

		expect(renderJianyingText).toHaveBeenCalledWith({
			request: expect.objectContaining({
				content: "花字",
				fontSize: 96,
				canvasWidth: 3840,
				canvasHeight: 2160,
				sourceStart: 0.2,
				elementDuration: 2,
				frameCount: 24,
				fps: 24,
				transform: {
					x: 20,
					y: -10,
					width: 960,
					height: 640,
					rotation: 4,
					opacity: 0.8,
				},
			}),
		});
		expect(layers).toEqual([
			expect.objectContaining({
				elementId: "jianying-title",
				startTime: 0.2,
				endTime: 1.2,
				x: 100,
				y: 200,
				source: expect.objectContaining({ frameRate: 24 }),
			}),
		]);
	});

	it("builds a transparent sequence pass without an ASS fallback", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-export-"));
		temporaryDirectories.push(directory);
		await writeFile(path.join(directory, "frame-000000.png"), "png");
		const patternPath = path.join(directory, "frame-%06d.png");
		const args = buildTextRasterOverlayPassArgs({
			sourcePath: "/tmp/source.mp4",
			outputPath: "/tmp/output.mp4",
			layers: [
				{
					elementId: "jianying-title",
					source: {
						kind: "image-sequence",
						path: patternPath,
						frameRate: 24,
					},
					startTime: 0.2,
					endTime: 1.2,
					blendMode: "normal",
					x: 100,
					y: 200,
				},
			],
			settings: {
				engine: "native-cli",
				presetId: "youtube-1080p",
				width: 1920,
				height: 1080,
				fps: 30,
				format: "mp4",
				codec: "libx264",
				bitrate: "8Mbps",
			},
		});
		const filterComplex = args[args.indexOf("-filter_complex") + 1];

		expect(args).toContain(patternPath);
		expect(filterComplex).toContain("fps=30");
		expect(filterComplex).toContain("setpts=PTS-STARTPTS+0.2/TB");
		expect(filterComplex).toContain("x=100:y=200");
		expect(args.join(" ")).not.toContain("ass=");
	});
});
