// @vitest-environment node
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths.js";
import type { JianyingTextRuntimePackageKind } from "../jianying-text-runtime-contract.js";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import {
	alphaCoverage,
	framePathFromPattern,
	runProcess,
} from "./jianying-text-real-e2e-helpers.js";

const RESOURCE_ID = process.env.QCUT_JIANYING_TEXT_E2E_RESOURCE_ID;
const PACKAGE_HASH = process.env.QCUT_JIANYING_TEXT_E2E_PACKAGE_HASH;
const PACKAGE_KIND: JianyingTextRuntimePackageKind =
	process.env.QCUT_JIANYING_TEXT_E2E_PACKAGE_KIND === "TextStyle"
		? "TextStyle"
		: "ScriptInfoSticker";
const OUTPUT_PATH =
	process.env.QCUT_JIANYING_TEXT_E2E_OUTPUT ??
	path.join(os.tmpdir(), `qcut-jianying-${PACKAGE_KIND.toLowerCase()}-e2e.mp4`);
const E2E_ENABLED = Boolean(RESOURCE_ID && PACKAGE_HASH);
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const EFFECT_WIDTH = 960;
const EFFECT_HEIGHT = 540;
const FPS = 24;
const FRAME_COUNT = 48;

const describeRealVideo = E2E_ENABLED ? describe : describe.skip;

describeRealVideo("Jianying effectStyle real video E2E", () => {
	it("renders the formal runtime route and encodes a verifiable video", async () => {
		if (!(RESOURCE_ID && PACKAGE_HASH)) {
			throw new Error("Jianying text E2E resource identity is missing");
		}
		const runtime = await inspectJianyingTextRuntime({ refresh: true });
		expect(runtime.status.state).toBe("ready");
		await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
		await rm(OUTPUT_PATH, { force: true });
		const reference = {
			schemaVersion: 1 as const,
			source: "jianying-cache" as const,
			packageKind: PACKAGE_KIND,
			resourceId: RESOURCE_ID,
			packageHash: PACKAGE_HASH,
			editMode: "runtime-with-preload-fallback" as const,
			slotMapping: "line-to-widget" as const,
			timeMapping: "stretch" as const,
			templateDuration: 3,
		};
		const packageInfo = await resolveJianyingTextPackage({ reference });
		expect(packageInfo.capabilities).toEqual({
			staticTexture: true,
			multipleStrokes: true,
			animationComponents: PACKAGE_KIND === "ScriptInfoSticker",
			scriptInfoSticker: PACKAGE_KIND === "ScriptInfoSticker",
			shaderComponents: false,
			threeDimensional: false,
			feedbackComponents: false,
		});
		expect(packageInfo.diagnostics).toEqual([]);
		const result = await renderJianyingText({
			request: {
				requestId: `effect-style-e2e-${Date.now()}`,
				reference,
				content: "花字验证",
				fontSize: 72,
				canvasWidth: CANVAS_WIDTH,
				canvasHeight: CANVAS_HEIGHT,
				transform: {
					x: 0,
					y: 0,
					width: EFFECT_WIDTH,
					height: EFFECT_HEIGHT,
					rotation: 0,
					opacity: 1,
				},
				sourceStart: 0.4,
				elementDuration: 3,
				frameCount: FRAME_COUNT,
				fps: FPS,
				previewVideo: false,
			},
		});
		expect(result.source.kind).toBe("image-sequence");
		if (result.source.kind !== "image-sequence") {
			throw new Error("Expected an image-sequence render");
		}
		const ffmpegPath = getFFmpegPath();
		const middleFrame = framePathFromPattern({
			pattern: result.source.path,
			index: Math.floor(FRAME_COUNT / 2),
		});
		const rgba = await runProcess({
			command: ffmpegPath,
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-i",
				middleFrame,
				"-frames:v",
				"1",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgba",
				"pipe:1",
			],
		});
		expect(rgba).toHaveLength(EFFECT_WIDTH * EFFECT_HEIGHT * 4);
		const coverage = alphaCoverage({ bytes: rgba, width: EFFECT_WIDTH });
		expect(coverage.visible).toBeGreaterThan(1000);
		expect(coverage.transparent).toBeGreaterThan(1000);
		expect(coverage.edgeVisible).toBe(0);

		await runProcess({
			command: ffmpegPath,
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-f",
				"lavfi",
				"-i",
				`color=c=0x18212b:s=${CANVAS_WIDTH}x${CANVAS_HEIGHT}:r=${FPS}:d=${FRAME_COUNT / FPS}`,
				"-framerate",
				String(FPS),
				"-start_number",
				"0",
				"-i",
				result.source.path,
				"-filter_complex",
				`[0:v][1:v]overlay=${Math.round(result.x)}:${Math.round(result.y)}:format=auto,format=yuv420p`,
				"-frames:v",
				String(FRAME_COUNT),
				"-an",
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"18",
				"-movflags",
				"+faststart",
				OUTPUT_PATH,
			],
		});
		const metadata = await stat(OUTPUT_PATH);
		expect(metadata.size).toBeGreaterThan(20_000);
		const probeOutput = await runProcess({
			command: await getFFprobePath(),
			args: [
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=codec_name,width,height,nb_frames:format=duration",
				"-of",
				"json",
				OUTPUT_PATH,
			],
		});
		const probe = JSON.parse(probeOutput.toString("utf8")) as {
			streams?: Array<{
				codec_name?: string;
				width?: number;
				height?: number;
				nb_frames?: string;
			}>;
			format?: { duration?: string };
		};
		expect(probe.streams?.[0]).toMatchObject({
			codec_name: "h264",
			width: CANVAS_WIDTH,
			height: CANVAS_HEIGHT,
			nb_frames: String(FRAME_COUNT),
		});
		expect(Number(probe.format?.duration)).toBeCloseTo(FRAME_COUNT / FPS, 1);
	}, 180_000);
});
