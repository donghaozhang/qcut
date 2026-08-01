import { join } from "node:path";
import { runFfmpeg } from "./runtime.js";
import {
	compareTransparentSticker,
	DEFAULT_STICKER_ALPHA_THRESHOLDS,
} from "./visual-alpha.js";
import {
	deriveVerificationStatus,
	type VisualFileEvidence,
	type VisualOracleManifest,
} from "./visual-contract.js";
import {
	describeStagedVisualFile,
	describeVisualCapture,
	type VisualOutputLayout,
} from "./visual-files.js";
import { decodeImage } from "./visual-ffmpeg.js";
import {
	buildLutMaskExpectedArgs,
	compareLutMaskProbes,
} from "./visual-lut-mask.js";

interface ObservedVisualContext {
	capturesDirectory: string;
	decodeDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	layout: VisualOutputLayout;
}

export async function buildStickerReopenedAssetResult({
	context,
	source,
}: {
	context: ObservedVisualContext;
	source: VisualFileEvidence;
}): Promise<VisualOracleManifest["sticker"]> {
	const reopenedAsset = await describeVisualCapture({
		capturesDirectory: context.capturesDirectory,
		path: join(context.capturesDirectory, "sticker", "reopened-icon.png"),
	});
	if (!reopenedAsset.exists) {
		return {
			comparison: null,
			reopenedAsset,
			source,
			status: "unverified",
		};
	}
	const [sourceImage, reopenedImage] = await Promise.all([
		decodeImage({
			ffmpegPath: context.ffmpegPath,
			ffprobePath: context.ffprobePath,
			imagePath: source.path,
			pixelFormat: "rgba",
			temporaryDirectory: context.decodeDirectory,
		}),
		decodeImage({
			ffmpegPath: context.ffmpegPath,
			ffprobePath: context.ffprobePath,
			imagePath: reopenedAsset.path,
			pixelFormat: "rgba",
			temporaryDirectory: context.decodeDirectory,
		}),
	]);
	const comparison = compareTransparentSticker({
		reopenedAssetGeometry: reopenedImage.geometry,
		reopenedAssetPixels: reopenedImage.pixels,
		sourceGeometry: sourceImage.geometry,
		sourcePixels: sourceImage.pixels,
		thresholds: DEFAULT_STICKER_ALPHA_THRESHOLDS,
	});
	return {
		comparison,
		reopenedAsset,
		source,
		status: deriveVerificationStatus({ pass: comparison.pass, present: true }),
	};
}

export async function buildLutMaskResult({
	context,
	frameAPath,
}: {
	context: ObservedVisualContext;
	frameAPath: string;
}): Promise<VisualOracleManifest["lutMask"]> {
	const stagingPath = join(
		context.layout.stagingDirectory,
		"lut-mask",
		"expected-invert-ellipse.png"
	);
	await runFfmpeg({
		args: buildLutMaskExpectedArgs({
			outputPath: stagingPath,
			sourcePath: frameAPath,
		}),
		ffmpegPath: context.ffmpegPath,
	});
	const expected = await describeStagedVisualFile({
		layout: context.layout,
		stagingPath,
	});
	const capture = await describeVisualCapture({
		capturesDirectory: context.capturesDirectory,
		path: join(context.capturesDirectory, "lut-mask", "reopened-lut-mask.png"),
	});
	if (!capture.exists) {
		return {
			capture,
			comparison: null,
			expected: expected.evidence,
			status: "unverified",
		};
	}
	const [expectedImage, capturedImage] = await Promise.all([
		decodeImage({
			ffmpegPath: context.ffmpegPath,
			ffprobePath: context.ffprobePath,
			imagePath: expected.stagingPath,
			pixelFormat: "rgba",
			temporaryDirectory: context.decodeDirectory,
		}),
		decodeImage({
			ffmpegPath: context.ffmpegPath,
			ffprobePath: context.ffprobePath,
			imagePath: capture.path,
			pixelFormat: "rgba",
			temporaryDirectory: context.decodeDirectory,
		}),
	]);
	const comparison = compareLutMaskProbes({
		candidateGeometry: capturedImage.geometry,
		candidatePixels: capturedImage.pixels,
		expectedGeometry: expectedImage.geometry,
		expectedPixels: expectedImage.pixels,
	});
	return {
		capture,
		comparison,
		expected: expected.evidence,
		status: deriveVerificationStatus({ pass: comparison.pass, present: true }),
	};
}
