import { join } from "node:path";
import { runFfmpeg } from "./runtime.js";
import {
	deriveVerificationStatus,
	type VisualCaptureEvidence,
	type VisualDissolveSample,
	VISUAL_ORACLE_RMSE_THRESHOLD,
} from "./visual-contract.js";
import {
	describeStagedVisualFile,
	describeVisualCapture,
	type StagedVisualFile,
	type VisualOutputLayout,
} from "./visual-files.js";
import {
	buildDissolveExpectedArgs,
	compareRgbImages,
	type ImageRegion,
} from "./visual-ffmpeg.js";
import type {
	DissolveFramePlan,
	DissolveFrameSamplePlan,
} from "./visual-frame-plan.js";

interface DissolveVisualContext {
	capturesDirectory: string;
	comparisonRoi: ImageRegion;
	decodeDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	layout: VisualOutputLayout;
}

export function getDissolveSampleId({
	nominalProgress,
}: {
	nominalProgress: number;
}): string {
	return `p${Math.round(nominalProgress * 100)
		.toString()
		.padStart(3, "0")}`;
}

export function getDissolveFileName({
	sample,
}: {
	sample: DissolveFrameSamplePlan;
}): string {
	return `dissolve-${getDissolveSampleId({ nominalProgress: sample.nominalProgress })}-timeline-frame-${sample.timelineFrameNumber.toString().padStart(4, "0")}.png`;
}

async function generateDissolveExpected({
	context,
	frameAPath,
	frameBPath,
	sample,
}: {
	context: DissolveVisualContext;
	frameAPath: string;
	frameBPath: string;
	sample: DissolveFrameSamplePlan;
}): Promise<StagedVisualFile> {
	const stagingPath = join(
		context.layout.stagingDirectory,
		"dissolve",
		getDissolveFileName({ sample })
	);
	await runFfmpeg({
		args: buildDissolveExpectedArgs({
			frameAPath,
			frameBPath,
			mixWeight: sample.realizedProgress,
			outputPath: stagingPath,
		}),
		ffmpegPath: context.ffmpegPath,
	});
	return describeStagedVisualFile({ layout: context.layout, stagingPath });
}

async function compareDissolveSample({
	capture,
	context,
	expected,
	sample,
}: {
	capture: VisualCaptureEvidence;
	context: DissolveVisualContext;
	expected: StagedVisualFile;
	sample: DissolveFrameSamplePlan;
}): Promise<VisualDissolveSample> {
	const comparison = capture.exists
		? await compareRgbImages({
				actualPath: capture.path,
				comparisonRoi: context.comparisonRoi,
				expectedPath: expected.stagingPath,
				ffmpegPath: context.ffmpegPath,
				ffprobePath: context.ffprobePath,
				rmseThreshold: VISUAL_ORACLE_RMSE_THRESHOLD,
				temporaryDirectory: context.decodeDirectory,
			})
		: null;
	return {
		capture,
		comparison,
		expected: expected.evidence,
		frameOffset: sample.frameOffset,
		id: getDissolveSampleId({ nominalProgress: sample.nominalProgress }),
		nominalProgress: sample.nominalProgress,
		realizedProgress: sample.realizedProgress,
		status: deriveVerificationStatus({
			pass: comparison?.pass ?? null,
			present: capture.exists,
		}),
		timelineFrameIndex: sample.timelineFrameIndex,
		timelineFrameNumber: sample.timelineFrameNumber,
		transitionFrameNumber: sample.transitionFrameNumber,
	};
}

export async function buildDissolveSamples({
	context,
	frameAPath,
	frameBPath,
	framePlan,
}: {
	context: DissolveVisualContext;
	frameAPath: string;
	frameBPath: string;
	framePlan: DissolveFramePlan;
}): Promise<VisualDissolveSample[]> {
	const expectedFiles = await Promise.all(
		framePlan.samples.map((sample) =>
			generateDissolveExpected({
				context,
				frameAPath,
				frameBPath,
				sample,
			})
		)
	);
	return Promise.all(
		framePlan.samples.map(async (sample, index) => {
			const expected = expectedFiles[index];
			if (!expected)
				throw new Error(`Missing expected dissolve sample ${index}.`);
			const capture = await describeVisualCapture({
				capturesDirectory: context.capturesDirectory,
				path: join(
					context.capturesDirectory,
					"dissolve",
					getDissolveFileName({ sample })
				),
			});
			return compareDissolveSample({ capture, context, expected, sample });
		})
	);
}
