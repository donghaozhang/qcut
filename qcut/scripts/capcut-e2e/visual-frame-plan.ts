export const DISSOLVE_SAMPLE_PROGRESS = [0, 0.25, 0.5, 0.75, 1] as const;

export type DissolveIntervalSource =
	| "capture-discovered"
	| "expected-seam-candidate";

export type DissolveIntervalStatus = "unverified" | "verified";

export interface DissolveIntervalEvidence {
	bytes: number;
	path: string;
	sha256: string;
}

export interface DissolveFrameSamplePlan {
	frameOffset: number;
	nominalProgress: number;
	realizedProgress: number;
	timelineFrameIndex: number;
	timelineFrameNumber: number;
	transitionFrameNumber: number;
}

export interface DissolveFramePlan {
	fps: number;
	intervalEvidence: DissolveIntervalEvidence | null;
	intervalReason: string;
	intervalSource: DissolveIntervalSource;
	intervalStatus: DissolveIntervalStatus;
	sampleFormula: "k=round(p*(N-1))";
	samples: DissolveFrameSamplePlan[];
	transitionDurationMicroseconds: number;
	transitionFrameCount: number;
	transitionStartFrameIndex: number;
}

function roundProgress({ value }: { value: number }): number {
	return Number(value.toFixed(9));
}

function validateIntervalEvidence({
	intervalEvidence,
	intervalSource,
	intervalStatus,
}: {
	intervalEvidence: DissolveIntervalEvidence | null;
	intervalSource: DissolveIntervalSource;
	intervalStatus: DissolveIntervalStatus;
}): void {
	if (intervalStatus === "verified") {
		if (intervalSource !== "capture-discovered" || !intervalEvidence) {
			throw new Error(
				"A verified dissolve interval requires capture-discovered file evidence."
			);
		}
		return;
	}
	if (intervalSource !== "expected-seam-candidate" || intervalEvidence) {
		throw new Error(
			"An unverified dissolve interval must be an evidence-free expected-model candidate."
		);
	}
}

export function buildDissolveFramePlan({
	fps,
	intervalEvidence,
	intervalReason,
	intervalSource,
	intervalStatus,
	transitionDurationMicroseconds,
	transitionFrameCount,
	transitionStartFrameIndex,
}: {
	fps: number;
	intervalEvidence: DissolveIntervalEvidence | null;
	intervalReason: string;
	intervalSource: DissolveIntervalSource;
	intervalStatus: DissolveIntervalStatus;
	transitionDurationMicroseconds: number;
	transitionFrameCount: number;
	transitionStartFrameIndex: number;
}): DissolveFramePlan {
	if (
		!Number.isFinite(fps) ||
		fps <= 0 ||
		intervalReason.length === 0 ||
		!Number.isSafeInteger(transitionDurationMicroseconds) ||
		transitionDurationMicroseconds <= 0 ||
		!Number.isSafeInteger(transitionFrameCount) ||
		transitionFrameCount < 2 ||
		!Number.isSafeInteger(transitionStartFrameIndex) ||
		transitionStartFrameIndex < 0
	) {
		throw new Error("Dissolve frame-plan inputs are invalid.");
	}
	validateIntervalEvidence({
		intervalEvidence,
		intervalSource,
		intervalStatus,
	});
	const samples = DISSOLVE_SAMPLE_PROGRESS.map((nominalProgress) => {
		const frameOffset = Math.round(
			nominalProgress * (transitionFrameCount - 1)
		);
		const timelineFrameIndex = transitionStartFrameIndex + frameOffset;
		return {
			frameOffset,
			nominalProgress,
			realizedProgress: roundProgress({
				value: frameOffset / (transitionFrameCount - 1),
			}),
			timelineFrameIndex,
			timelineFrameNumber: timelineFrameIndex + 1,
			transitionFrameNumber: frameOffset + 1,
		};
	});
	return {
		fps,
		intervalEvidence,
		intervalReason,
		intervalSource,
		intervalStatus,
		sampleFormula: "k=round(p*(N-1))",
		samples,
		transitionDurationMicroseconds,
		transitionFrameCount,
		transitionStartFrameIndex,
	};
}
