import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TimelineTrack } from "../../apps/web/src/types/timeline";
import { buildTextASSOverlay } from "../../apps/web/src/lib/export-cli/filters/text-ass-overlay";
import {
	TEXT_VISUAL_AUDIT_CASES,
	TEXT_VISUAL_AUDIT_ROOT,
} from "../../apps/web/src/test/e2e/text-visual-audit-cases";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const exportOutputDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "export");
const workDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "work");
const sourcePath = path.join(workDir, "source.mp4");

function runFFmpeg(args: string[]) {
	return spawnSync(ffmpegPath, args, {
		encoding: "utf8",
		timeout: 60_000,
	});
}

function expectFFmpegSuccess(result: ReturnType<typeof runFFmpeg>) {
	expect(result.status, result.stderr?.toString().slice(-4_000)).toBe(0);
}

function extractFrame({
	videoPath,
	time,
	outputPath,
}: {
	videoPath: string;
	time: number;
	outputPath: string;
}) {
	const result = runFFmpeg([
		"-y",
		"-ss",
		String(Math.max(0.01, time)),
		"-i",
		videoPath,
		"-frames:v",
		"1",
		outputPath,
	]);
	expectFFmpegSuccess(result);
	expect(fs.statSync(outputPath).size).toBeGreaterThan(1_000);
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Text visual audit - real FFmpeg",
	// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
	{ timeout: 60_000 },
	() => {
		beforeAll(() => {
			fs.rmSync(exportOutputDir, { recursive: true, force: true });
			fs.rmSync(workDir, { recursive: true, force: true });
			fs.mkdirSync(exportOutputDir, { recursive: true });
			fs.mkdirSync(workDir, { recursive: true });
			const sourceResult = runFFmpeg([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=0x355070:s=960x540:d=2.2:r=30",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				sourcePath,
			]);
			expectFFmpegSuccess(sourceResult);
		});

		it("exports every text effect and the screen regression comparison", () => {
			let screenAssPath = "";
			let screenScreenshotPath = "";

			for (const auditCase of TEXT_VISUAL_AUDIT_CASES) {
				const track: TimelineTrack = {
					id: `track-${auditCase.id}`,
					name: auditCase.label,
					type: "text",
					elements: [auditCase.element],
				};
				const ass = buildTextASSOverlay({
					tracks: [track],
					canvasWidth: 1920,
					canvasHeight: 1080,
					fps: 30,
				});
				expect(ass.content).not.toBe("");

				const caseWorkDir = path.join(workDir, auditCase.id);
				const groupOutputDir = path.join(exportOutputDir, auditCase.group);
				fs.mkdirSync(caseWorkDir, { recursive: true });
				fs.mkdirSync(groupOutputDir, { recursive: true });
				const assPath = path.join(caseWorkDir, "text.ass");
				const videoPath = path.join(caseWorkDir, "output.mp4");
				const screenshotPath = path.join(groupOutputDir, `${auditCase.id}.png`);
				fs.writeFileSync(assPath, ass.content, "utf8");

				const args = buildFFmpegArgs({
					inputDir: caseWorkDir,
					outputFile: videoPath,
					width: 960,
					height: 540,
					fps: 30,
					quality: "medium",
					duration: 2,
					useVideoInput: true,
					videoInputPath: sourcePath,
					textAssLayers: [
						{
							path: assPath,
							blendMode: auditCase.element.blendMode ?? "normal",
						},
					],
				});
				expectFFmpegSuccess(runFFmpeg(args));
				extractFrame({
					videoPath,
					time: auditCase.captureTime,
					outputPath: screenshotPath,
				});

				if (auditCase.id === "blend-screen") {
					screenAssPath = assPath;
					screenScreenshotPath = screenshotPath;
				}
			}

			expect(screenAssPath).not.toBe("");
			const comparisonDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "comparison");
			fs.mkdirSync(comparisonDir, { recursive: true });
			fs.copyFileSync(
				screenScreenshotPath,
				path.join(comparisonDir, "screen-after.png")
			);

			const beforeVideoPath = path.join(workDir, "screen-before.mp4");
			const beforeFilter = [
				`color=c=black@0.0:s=960x540:d=2:r=30,format=rgba,ass=filename='${screenAssPath}':alpha=1[text]`,
				"[0:v]format=rgba,split=2[base_original][base_blend]",
				"[text]split=2[text_blend][text_alpha]",
				"[base_blend][text_blend]blend=all_mode=screen[blended]",
				"[text_alpha]alphaextract[mask]",
				"[base_original][blended][mask]maskedmerge[out]",
			].join(";");
			const beforeResult = runFFmpeg([
				"-y",
				"-i",
				sourcePath,
				"-t",
				"2",
				"-filter_complex",
				beforeFilter,
				"-map",
				"[out]",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				beforeVideoPath,
			]);
			expectFFmpegSuccess(beforeResult);
			extractFrame({
				videoPath: beforeVideoPath,
				time: 0.8,
				outputPath: path.join(comparisonDir, "screen-before.png"),
			});
		}, 180_000);
	}
);
