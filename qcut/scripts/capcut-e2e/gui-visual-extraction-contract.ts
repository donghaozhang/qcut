import { join } from "node:path";
import { buildFrameExtractionArgs } from "./ffmpeg-args.js";
import type { CapCutGuiVisualExtractionFrame } from "./gui-visual-evidence-contract.js";
import type { VisualFileEvidence } from "./visual-contract.js";
import { getDissolveFileName, getDissolveSampleId } from "./visual-dissolve.js";
import { buildDissolveFramePlan } from "./visual-frame-plan.js";

export const CAPCUT_GUI_EXPORT_FRAME_RATE = Object.freeze({
	denominator: 1 as const,
	numerator: 30 as const,
});

export interface CapCutGuiVisualExportEvidence {
	dissolve: VisualFileEvidence;
	lutMask: VisualFileEvidence;
	nativeTextSticker: VisualFileEvidence;
}

export type CapCutGuiVisualExtractionFrameWithoutOutput = Omit<
	CapCutGuiVisualExtractionFrame,
	"output"
> & { outputPath: string };

function buildFrame({
	caseId,
	frameIndex,
	id,
	outputPath,
	sourceExport,
}: {
	caseId: CapCutGuiVisualExtractionFrame["caseId"];
	frameIndex: number;
	id: string;
	outputPath: string;
	sourceExport: VisualFileEvidence;
}): CapCutGuiVisualExtractionFrameWithoutOutput {
	return {
		caseId,
		command: {
			args: buildFrameExtractionArgs({
				frameIndex,
				inputPath: sourceExport.path,
				outputPath,
			}),
			contract: "ffmpeg-select-zero-based-frame-v1",
			crop: null,
			filter: `select=eq(n\\,${frameIndex})`,
		},
		frameRate: CAPCUT_GUI_EXPORT_FRAME_RATE,
		id,
		outputPath,
		sourceExport,
		timestamp: {
			microsecondsRounded: Math.round(
				(frameIndex * 1_000_000) / CAPCUT_GUI_EXPORT_FRAME_RATE.numerator
			),
			rational: `${frameIndex}/30`,
		},
		zeroBasedFrameIndex: frameIndex,
	};
}

function buildDissolveFramePlanForExtraction() {
	return buildDissolveFramePlan({
		fps: 30,
		intervalEvidence: null,
		intervalReason:
			"Extraction uses the locked expected seam candidate; this does not verify the observed transition interval.",
		intervalSource: "expected-seam-candidate",
		intervalStatus: "unverified",
		transitionDurationMicroseconds: 466_666,
		transitionFrameCount: 14,
		transitionStartFrameIndex: 83,
	});
}

export function buildCapCutGuiVisualExtractionFrames({
	capturesDirectory,
	exports,
}: {
	capturesDirectory: string;
	exports: CapCutGuiVisualExportEvidence;
}): CapCutGuiVisualExtractionFrameWithoutOutput[] {
	const framePlan = buildDissolveFramePlanForExtraction();
	return [
		buildFrame({
			caseId: "native-text-sticker",
			frameIndex: 90,
			id: "native-elements-export-frame",
			outputPath: join(
				capturesDirectory,
				"native-text-sticker",
				"export-frame-0091.png"
			),
			sourceExport: exports.nativeTextSticker,
		}),
		...framePlan.samples.map((sample) =>
			buildFrame({
				caseId: "dissolve",
				frameIndex: sample.timelineFrameIndex,
				id: `dissolve-${getDissolveSampleId({ nominalProgress: sample.nominalProgress })}`,
				outputPath: join(
					capturesDirectory,
					"dissolve",
					getDissolveFileName({ sample })
				),
				sourceExport: exports.dissolve,
			})
		),
		buildFrame({
			caseId: "lut-mask",
			frameIndex: 135,
			id: "lut-mask-export-frame",
			outputPath: join(capturesDirectory, "lut-mask", "export-frame-0136.png"),
			sourceExport: exports.lutMask,
		}),
	];
}
