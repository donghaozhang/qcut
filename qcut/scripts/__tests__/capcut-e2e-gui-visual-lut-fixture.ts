import { join } from "node:path";
import {
	resolveGuiVisualFfmpeg,
	resolveGuiVisualFfprobe,
	runGuiVisualFfmpeg,
} from "../capcut-e2e/gui-visual-ffmpeg.js";
import { recomputeBoundLutMaskComparison } from "../capcut-e2e/gui-visual-lut-mask-verification.js";
import { CAPCUT_E2E_FIXTURE_SPEC } from "../capcut-e2e/spec.js";
import { buildLutMaskExpectedArgs } from "../capcut-e2e/visual-lut-mask.js";

async function createExportTemplate({
	ffmpegPath,
	path,
}: {
	ffmpegPath: string;
	path: string;
}) {
	await runGuiVisualFfmpeg({
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=0x112233:s=64x36:r=30:d=6",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-g",
			"1",
			"-bf",
			"0",
			"-y",
			path,
		],
		ffmpegPath,
	});
}

async function createLutMaskFixtureImages({
	ffmpegPath,
	rootDirectory,
}: {
	ffmpegPath: string;
	rootDirectory: string;
}) {
	const sourcePath = join(rootDirectory, "lut-mask-source.png");
	const expectedPath = join(rootDirectory, "lut-mask-expected.png");
	await runGuiVisualFfmpeg({
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			`color=c=0x203040:s=${CAPCUT_E2E_FIXTURE_SPEC.width}x${CAPCUT_E2E_FIXTURE_SPEC.height}:d=1`,
			"-frames:v",
			"1",
			"-c:v",
			"png",
			"-pix_fmt",
			"rgba",
			"-threads",
			"1",
			"-y",
			sourcePath,
		],
		ffmpegPath,
	});
	await runGuiVisualFfmpeg({
		args: buildLutMaskExpectedArgs({ outputPath: expectedPath, sourcePath }),
		ffmpegPath,
	});
	return { expectedPath, sourcePath };
}

export async function createGuiVisualMediaFixtures({
	rootDirectory,
}: {
	rootDirectory: string;
}) {
	const ffmpeg = await resolveGuiVisualFfmpeg({ projectRoot: process.cwd() });
	const exportTemplatePath = join(rootDirectory, "gui-export-template.mp4");
	const lutMask = await createLutMaskFixtureImages({
		ffmpegPath: ffmpeg.path,
		rootDirectory,
	});
	await createExportTemplate({
		ffmpegPath: ffmpeg.path,
		path: exportTemplatePath,
	});
	return { exportTemplatePath, lutMask };
}

export async function buildFixtureLutMaskComparison({
	capturePath,
	expectedPath,
	rootDirectory,
}: {
	capturePath: string;
	expectedPath: string;
	rootDirectory: string;
}) {
	const [ffmpeg, ffprobe] = await Promise.all([
		resolveGuiVisualFfmpeg({ projectRoot: process.cwd() }),
		resolveGuiVisualFfprobe({ projectRoot: process.cwd() }),
	]);
	return recomputeBoundLutMaskComparison({
		capturePath,
		expectedPath,
		ffmpegPath: ffmpeg.path,
		ffprobePath: ffprobe.path,
		temporaryParentDirectory: rootDirectory,
	});
}
