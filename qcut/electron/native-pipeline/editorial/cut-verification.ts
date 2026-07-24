import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import {
	CUT_VERIFICATION_VERSION,
	EDIT_DECISION_LIST_VERSION,
	type CutCheck,
	type CutVerificationReport,
	type EditDecision,
	type EditDecisionList,
	type VerifiedCut,
} from "./types.js";
import {
	extractMonoPcm,
	extractRgbFrames,
	probeMedia,
} from "./media-process.js";
import { renderTimelineView } from "./timeline-view.js";
import { visualMetricsInternals } from "./visual-metrics.js";

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 90;
const AUDIO_SAMPLE_RATE = 8000;

function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function parseEditDecisionList({
	value,
}: {
	value: unknown;
}): EditDecisionList {
	const record = toRecord({ value });
	if (!record || record.version !== EDIT_DECISION_LIST_VERSION) {
		throw new Error(
			`Expected edit decision list version ${EDIT_DECISION_LIST_VERSION}`
		);
	}
	if (!Array.isArray(record.clips) || record.clips.length === 0) {
		throw new Error("EDL has no clips");
	}
	return record as unknown as EditDecisionList;
}

function rgbToGray({ frame }: { frame: Buffer }): Buffer {
	const pixels = Math.floor(frame.length / 3);
	const gray = Buffer.allocUnsafe(pixels);
	for (let index = 0; index < pixels; index += 1) {
		const offset = index * 3;
		gray[index] = Math.round(
			frame[offset] * 0.299 +
				frame[offset + 1] * 0.587 +
				frame[offset + 2] * 0.114
		);
	}
	return gray;
}

function frameDifference({
	left,
	right,
}: {
	left: Buffer;
	right: Buffer;
}): number {
	const length = Math.min(left.length, right.length);
	if (length === 0) return 0;
	let difference = 0;
	for (let index = 0; index < length; index += 1) {
		difference += Math.abs(left[index] - right[index]);
	}
	return difference / length / 255;
}

function dotProduct({
	left,
	right,
}: {
	left: { x: number; y: number; magnitude: number };
	right: { x: number; y: number; magnitude: number };
}): number | undefined {
	if (left.magnitude < 0.4 || right.magnitude < 0.4) return;
	return (
		(left.x * right.x + left.y * right.y) / (left.magnitude * right.magnitude)
	);
}

function median({ values }: { values: number[] }): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function audioSpikeRatio({
	pcm,
	windowSeconds,
}: {
	pcm: Int16Array;
	windowSeconds: number;
}): number | undefined {
	if (pcm.length === 0) return;
	const windowSamples = Math.max(1, Math.round(AUDIO_SAMPLE_RATE * 0.01));
	const rmsWindows = Array.from(
		{ length: Math.floor(pcm.length / windowSamples) },
		(_, windowIndex) => {
			let squared = 0;
			const start = windowIndex * windowSamples;
			for (let index = start; index < start + windowSamples; index += 1) {
				const normalized = pcm[index] / 32768;
				squared += normalized * normalized;
			}
			return Math.sqrt(squared / windowSamples);
		}
	);
	if (rmsWindows.length === 0) return;
	const baseline = median({
		values: rmsWindows.filter((value) => value > 0.0001),
	});
	const centerWindow = Math.round(windowSeconds / 0.01);
	const local = rmsWindows.slice(
		Math.max(0, centerWindow - 3),
		Math.min(rmsWindows.length, centerWindow + 4)
	);
	const peak = Math.max(...local, 0);
	if (baseline <= 0.0001) return peak > 0.05 ? Number.POSITIVE_INFINITY : 1;
	return peak / baseline;
}

function titleCheck({
	edl,
	cutTime,
}: {
	edl: EditDecisionList;
	cutTime: number;
}): CutCheck {
	const active = (edl.titles ?? []).filter(
		(title) => title.start <= cutTime && title.end >= cutTime
	);
	if (active.length === 0) {
		return {
			name: "title-occlusion",
			status: "not-applicable",
			severity: "info",
			message: "No declared title overlaps this cut.",
		};
	}
	const unsafe = active.find((title) => {
		if (
			title.x === undefined ||
			title.y === undefined ||
			title.width === undefined ||
			title.height === undefined
		) {
			return false;
		}
		return (
			title.x < 0.05 ||
			title.y < 0.05 ||
			title.x + title.width > 0.95 ||
			title.y + title.height > 0.95
		);
	});
	const nearAnimationEdge = active.find(
		(title) =>
			Math.abs(title.start - cutTime) < 0.15 ||
			Math.abs(title.end - cutTime) < 0.15
	);
	if (unsafe || nearAnimationEdge) {
		return {
			name: "title-occlusion",
			status: "warning",
			severity: "warning",
			value: (unsafe ?? nearAnimationEdge)?.id,
			message: unsafe
				? `Title '${unsafe.id}' extends beyond the 5% title-safe area.`
				: `Title '${nearAnimationEdge?.id}' begins or ends on the cut.`,
			suggestion: unsafe
				? "Move or resize the title inside the title-safe area."
				: "Move the title animation at least 0.15s away from the cut.",
		};
	}
	return {
		name: "title-occlusion",
		status: "pass",
		severity: "info",
		message: `${active.length} declared title layer(s) remain inside the safe area across the cut.`,
	};
}

function makeVisualChecks({
	grayscaleFrames,
}: {
	grayscaleFrames: Buffer[];
}): CutCheck[] {
	if (grayscaleFrames.length !== 6) {
		throw new Error("Cut verification requires six ordered frames");
	}
	const beforeFar = grayscaleFrames[0];
	const beforeNear = grayscaleFrames[2];
	const afterNear = grayscaleFrames[3];
	const afterFar = grayscaleFrames[5];
	const appearances = grayscaleFrames.map((frame) =>
		visualMetricsInternals.analyzeFrame({
			frame,
			width: ANALYSIS_WIDTH,
			height: ANALYSIS_HEIGHT,
		})
	);
	const transientBefore = Math.abs(
		appearances[1].luma - (appearances[0].luma + appearances[2].luma) / 2
	);
	const transientAfter = Math.abs(
		appearances[4].luma - (appearances[3].luma + appearances[5].luma) / 2
	);
	const flashScore = Math.max(transientBefore, transientAfter);
	const flashCheck: CutCheck =
		flashScore >= 0.2
			? {
					name: "flash-frame",
					status: "warning",
					severity: "warning",
					value: Number(flashScore.toFixed(4)),
					message: "A one-frame luminance transient is likely around the cut.",
					suggestion:
						"Shift the cut by 2-4 frames or remove the transient frame.",
				}
			: {
					name: "flash-frame",
					status: "pass",
					severity: "info",
					value: Number(flashScore.toFixed(4)),
					message: "No strong one-frame luminance transient detected.",
				};

	const pixelJump = frameDifference({ left: beforeNear, right: afterNear });
	const focusJump = Math.hypot(
		appearances[2].focus.x - appearances[3].focus.x,
		appearances[2].focus.y - appearances[3].focus.y
	);
	const visualJumpScore = pixelJump * 0.75 + Math.min(1, focusJump) * 0.25;
	const visualJumpCheck: CutCheck =
		visualJumpScore >= 0.42
			? {
					name: "visual-jump",
					status: "warning",
					severity: "warning",
					value: Number(visualJumpScore.toFixed(4)),
					message: "The cut has a large appearance or composition jump.",
					suggestion:
						"Try a nearby in/out point with a closer visual focus, or use a 0.2-0.35s dissolve.",
				}
			: {
					name: "visual-jump",
					status: "pass",
					severity: "info",
					value: Number(visualJumpScore.toFixed(4)),
					message: "Composition change is within the review threshold.",
				};

	const incoming = visualMetricsInternals.estimateMotion({
		previous: beforeFar,
		current: beforeNear,
		width: ANALYSIS_WIDTH,
		height: ANALYSIS_HEIGHT,
	});
	const outgoing = visualMetricsInternals.estimateMotion({
		previous: afterNear,
		current: afterFar,
		width: ANALYSIS_WIDTH,
		height: ANALYSIS_HEIGHT,
	});
	const motionDot = dotProduct({ left: incoming, right: outgoing });
	const motionCheck: CutCheck =
		motionDot !== undefined && motionDot < -0.25
			? {
					name: "motion-direction",
					status: "warning",
					severity: "warning",
					value: Number(motionDot.toFixed(4)),
					message: "Screen motion reverses direction across the cut.",
					suggestion:
						"Choose a matching-motion candidate or cut after motion settles.",
				}
			: {
					name: "motion-direction",
					status: "pass",
					severity: "info",
					value:
						motionDot === undefined
							? "one side is static"
							: Number(motionDot.toFixed(4)),
					message:
						motionDot === undefined
							? "At least one side is visually static."
							: "Screen motion remains directionally compatible.",
				};
	return [flashCheck, visualJumpCheck, motionCheck];
}

async function verifyCut({
	video,
	edl,
	fromClip,
	toClip,
	cutTime,
	cutIndex,
	cutWindow,
	outputDir,
	duration,
	signal,
}: {
	video: string;
	edl: EditDecisionList;
	fromClip: EditDecision;
	toClip: EditDecision;
	cutTime: number;
	cutIndex: number;
	cutWindow: number;
	outputDir: string;
	duration: number;
	signal?: AbortSignal;
}): Promise<VerifiedCut> {
	const nearOffset = Math.min(0.05, cutWindow / 4);
	const middleOffset = Math.min(0.12, cutWindow * 0.45);
	const farOffset = Math.min(0.24, cutWindow * 0.7);
	const times = [
		Math.max(0, cutTime - farOffset),
		Math.max(0, cutTime - middleOffset),
		Math.max(0, cutTime - nearOffset),
		Math.min(duration - 0.01, cutTime + nearOffset),
		Math.min(duration - 0.01, cutTime + middleOffset),
		Math.min(duration - 0.01, cutTime + farOffset),
	];
	const [rgbFrames, pcm] = await Promise.all([
		extractRgbFrames({
			path: video,
			times,
			width: ANALYSIS_WIDTH,
			height: ANALYSIS_HEIGHT,
			signal,
		}),
		extractMonoPcm({
			path: video,
			start: Math.max(0, cutTime - cutWindow),
			end: Math.min(duration, cutTime + cutWindow),
			sampleRate: AUDIO_SAMPLE_RATE,
			signal,
		}).catch(() => new Int16Array()),
	]);
	const grayscaleFrames = rgbFrames.map((frame) => rgbToGray({ frame }));
	const checks = makeVisualChecks({ grayscaleFrames });
	const spikeRatio = audioSpikeRatio({ pcm, windowSeconds: cutWindow });
	checks.push(
		spikeRatio === undefined
			? {
					name: "audio-spike",
					status: "not-applicable",
					severity: "info",
					message: "The rendered video has no analyzable audio at this cut.",
				}
			: spikeRatio >= 4
				? {
						name: "audio-spike",
						status: "warning",
						severity: "warning",
						value: Number(spikeRatio.toFixed(3)),
						message:
							"A short audio peak is substantially louder than its context.",
						suggestion:
							"Add a 20-40ms audio fade or move the edit away from the transient.",
					}
				: {
						name: "audio-spike",
						status: "pass",
						severity: "info",
						value: Number(spikeRatio.toFixed(3)),
						message: "No isolated audio spike detected.",
					}
	);
	checks.push(titleCheck({ edl, cutTime }));
	const evidencePath = resolve(
		outputDir,
		"cuts",
		`cut-${String(cutIndex + 1).padStart(2, "0")}-${cutTime.toFixed(3)}s.png`
	);
	const words = edl.beats.flatMap((beat) => beat.words);
	await renderTimelineView({
		source: video,
		start: Math.max(0, cutTime - cutWindow),
		end: Math.min(duration, cutTime + cutWindow),
		outputPath: evidencePath,
		sceneBoundaries: [cutTime],
		narration: video,
		narrationStart: Math.max(0, cutTime - cutWindow),
		narrationEnd: Math.min(duration, cutTime + cutWindow),
		words,
		signal,
	});
	return {
		id: `cut-${String(cutIndex + 1).padStart(2, "0")}`,
		time: cutTime,
		fromClip: fromClip.id,
		toClip: toClip.id,
		evidencePath,
		checks,
	};
}

export async function verifyEdit({
	edlPath,
	video,
	outputDir,
	cutWindow,
	signal,
}: {
	edlPath: string;
	video: string;
	outputDir: string;
	cutWindow: number;
	signal?: AbortSignal;
}): Promise<{ report: CutVerificationReport; reportPath: string }> {
	if (!Number.isFinite(cutWindow) || cutWindow <= 0) {
		throw new Error("cutWindow must be greater than zero");
	}
	const edl = parseEditDecisionList({
		value: JSON.parse(await fs.readFile(resolve(edlPath), "utf8")) as unknown,
	});
	if (edl.clips.length > 100) {
		throw new Error("Verification supports at most 100 cuts per run");
	}
	const probe = await probeMedia({ path: resolve(video) });
	const cuts = await Promise.all(
		edl.clips.slice(1).map((toClip, index) => {
			const fromClip = edl.clips[index];
			const cutTime = toClip.timelineStart;
			return verifyCut({
				video: resolve(video),
				edl,
				fromClip,
				toClip,
				cutTime,
				cutIndex: index,
				cutWindow,
				outputDir,
				duration: probe.duration,
				signal,
			});
		})
	);
	const allChecks = cuts.flatMap((cut) => cut.checks);
	const warningCount = allChecks.filter(
		(check) => check.status === "warning"
	).length;
	const errorCount = allChecks.filter(
		(check) => check.severity === "error"
	).length;
	const warnings: string[] = [];
	if (Math.abs(probe.duration - edl.duration) > 0.25) {
		warnings.push(
			`Rendered duration ${probe.duration.toFixed(3)}s differs from EDL duration ${edl.duration.toFixed(3)}s`
		);
	}
	const report: CutVerificationReport = {
		version: CUT_VERIFICATION_VERSION,
		createdAt: new Date().toISOString(),
		video: resolve(video),
		edl: resolve(edlPath),
		duration: probe.duration,
		cutWindow,
		passed: warningCount === 0 && errorCount === 0 && warnings.length === 0,
		summary: {
			cuts: cuts.length,
			warnings: warningCount + warnings.length,
			errors: errorCount,
		},
		cuts,
		warnings,
	};
	await fs.mkdir(resolve(outputDir), { recursive: true });
	const reportPath = resolve(outputDir, "verification.json");
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	return { report, reportPath };
}

export const cutVerificationInternals = {
	audioSpikeRatio,
	frameDifference,
	makeVisualChecks,
	parseEditDecisionList,
	rgbToGray,
	titleCheck,
};
