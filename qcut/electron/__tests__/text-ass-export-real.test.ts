import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
	TextElement,
	TimelineTrack,
} from "../../apps/web/src/types/timeline";
import { buildTextASSOverlay } from "../../apps/web/src/lib/export-cli/filters/text-ass-overlay";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const ffmpegPath =
	process.env.QCUT_TEST_FFMPEG ??
	path.resolve(
		testDir,
		`../resources/ffmpeg/${process.platform}-${process.arch}/ffmpeg${
			process.platform === "win32" ? ".exe" : ""
		}`
	);
const tempDir = path.resolve(testDir, "../../.tmp/text-ass-export-test");

function runFFmpeg(args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync(ffmpegPath, args, {
		encoding: "utf8",
		timeout: 60_000,
	});
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Advanced text export - real FFmpeg",
	// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
	{ timeout: 60_000 },
	() => {
		let sourcePath: string;

		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
			sourcePath = path.join(tempDir, "source.mp4");
			const result = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=0x18212b:s=640x360:d=2:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				sourcePath,
			]);
			if (result.status !== 0) throw new Error(result.stderr?.toString());
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it("burns multiline styled text and produces a readable frame", () => {
			const element: TextElement = {
				id: "text-real",
				type: "text",
				name: "Text",
				content: "QCut Text\nExport Ready",
				fontSize: 48,
				fontFamily: "Arial",
				color: "#fff4cc",
				backgroundColor: "#000000",
				backgroundOpacity: 0.65,
				backgroundRadius: 16,
				backgroundPadding: 18,
				strokeColor: "#ffcc33",
				strokeWidth: 2,
				strokeOpacity: 1,
				shadowColor: "#000000",
				shadowOpacity: 0.75,
				shadowBlur: 3,
				shadowOffsetX: 5,
				shadowOffsetY: 5,
				glowColor: "#00d7ff",
				glowOpacity: 0.4,
				glowBlur: 6,
				letterSpacing: 2,
				lineHeight: 1.25,
				width: 520,
				height: 170,
				textAlign: "center",
				verticalAlign: "middle",
				fontWeight: "bold",
				fontStyle: "normal",
				textDecoration: "none",
				x: 0,
				y: 0,
				rotation: -5,
				opacity: 1,
				animationType: "slide-up",
				animationDuration: 0.4,
				duration: 2,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			};
			const track: TimelineTrack = {
				id: "text-track",
				name: "Text",
				type: "text",
				elements: [element],
			};
			const ass = buildTextASSOverlay({
				tracks: [track],
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 30,
			});
			const assPath = path.join(tempDir, "text.ass");
			fs.writeFileSync(assPath, ass.content, "utf8");

			const outputPath = path.join(tempDir, "output.mp4");
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 640,
				height: 360,
				fps: 30,
				quality: "medium",
				duration: 2,
				useVideoInput: true,
				videoInputPath: sourcePath,
				textAssLayers: [{ path: assPath, blendMode: "screen" }],
			});
			const exportResult = runFFmpeg(args);
			expect(exportResult.status, exportResult.stderr?.toString()).toBe(0);
			expect(fs.statSync(outputPath).size).toBeGreaterThan(5_000);

			const framePath = path.join(tempDir, "frame.png");
			const frameResult = runFFmpeg([
				"-y",
				"-ss",
				"1",
				"-i",
				outputPath,
				"-frames:v",
				"1",
				framePath,
			]);
			expect(frameResult.status, frameResult.stderr?.toString()).toBe(0);
			expect(fs.statSync(framePath).size).toBeGreaterThan(2_000);

			// A plain source frame also passes the size checks above — prove the
			// text overlay changed the pixels by comparing against a no-overlay
			// baseline frame from the solid-color source at the same timestamp.
			const baselinePath = path.join(tempDir, "baseline.png");
			const baselineResult = runFFmpeg([
				"-y",
				"-ss",
				"1",
				"-i",
				sourcePath,
				"-frames:v",
				"1",
				baselinePath,
			]);
			expect(baselineResult.status, baselineResult.stderr?.toString()).toBe(0);
			const frameBytes = fs.readFileSync(framePath);
			const baselineBytes = fs.readFileSync(baselinePath);
			expect(frameBytes.equals(baselineBytes)).toBe(false);
			// Text glyphs add entropy to the flat-color frame, so the overlaid
			// PNG must compress larger than the baseline.
			expect(frameBytes.length).toBeGreaterThan(baselineBytes.length);

			fs.copyFileSync(
				framePath,
				path.join(process.env.TMPDIR ?? "/tmp", "qcut-text-ass-export.png")
			);
		});
	}
);
