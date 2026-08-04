export type FrameSampleReasonKind =
	| "project-first"
	| "project-last"
	| "segment-start"
	| "segment-end-before"
	| "segment-end-after"
	| "text-start"
	| "text-end-before"
	| "text-end-after"
	| "transition-before"
	| "transition-middle"
	| "transition-after"
	| "longest-stable-middle"
	| "seeded-random";

export interface FrameSampleReason {
	kind: FrameSampleReasonKind;
	subjectId?: string;
}

export interface FrameSample {
	frameIndex: number;
	reasons: FrameSampleReason[];
	timestampUs: number;
}

export interface FrameSamplePlan {
	coverage: {
		keyframes: "unsupported-by-interop-v1";
		transitionInterval: "semantic-seam-candidate";
	};
	durationUs: number;
	fps: number;
	frameCount: number;
	randomSampleCount: number;
	requestedRandomSampleCount: number;
	samples: FrameSample[];
	seed: number;
}

interface SamplePlanSegment {
	id: string;
	kind: string;
	targetRange: { durationUs: number; startUs: number };
}

interface SamplePlanTransition {
	durationUs: number;
	fromSegmentId: string;
	id: string;
	toSegmentId: string;
}

interface SamplePlanDocument {
	project: { durationUs?: number; fps: number };
	timelines: Array<{
		isRoot: boolean;
		tracks: Array<{
			segments: SamplePlanSegment[];
			transitions?: SamplePlanTransition[];
		}>;
	}>;
}

interface MutableSample {
	frameIndex: number;
	reasons: Map<string, FrameSampleReason>;
}

const DEFAULT_RANDOM_SAMPLE_COUNT = 8;
const DEFAULT_RANDOM_SEED = 0x5143_5554;
const MAX_RANDOM_SAMPLE_COUNT = 64;
const MAX_TOTAL_SAMPLES = 256;

function requirePositiveFinite({
	label,
	value,
}: {
	label: string;
	value: number;
}): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
}

function frameAtOrAfter({ fps, timeUs }: { fps: number; timeUs: number }) {
	const framePosition = (timeUs * fps) / 1_000_000;
	const nearestFrame = Math.round(framePosition);
	if (Math.abs(framePosition - nearestFrame) < 0.001) return nearestFrame;
	return Math.ceil(framePosition);
}

function timestampForFrame({
	fps,
	frameIndex,
}: {
	fps: number;
	frameIndex: number;
}) {
	return Math.round((frameIndex * 1_000_000) / fps);
}

function reasonKey({ reason }: { reason: FrameSampleReason }): string {
	return `${reason.kind}\u001f${reason.subjectId ?? ""}`;
}

function addSample({
	frameCount,
	frameIndex,
	reason,
	samples,
}: {
	frameCount: number;
	frameIndex: number;
	reason: FrameSampleReason;
	samples: Map<number, MutableSample>;
}): void {
	if (
		!Number.isSafeInteger(frameIndex) ||
		frameIndex < 0 ||
		frameIndex >= frameCount
	) {
		return;
	}
	const sample = samples.get(frameIndex) ?? {
		frameIndex,
		reasons: new Map<string, FrameSampleReason>(),
	};
	sample.reasons.set(reasonKey({ reason }), reason);
	samples.set(frameIndex, sample);
}

function addBoundarySamples({
	endFrame,
	frameCount,
	samples,
	segment,
	startFrame,
}: {
	endFrame: number;
	frameCount: number;
	samples: Map<number, MutableSample>;
	segment: SamplePlanSegment;
	startFrame: number;
}): void {
	const isText = segment.kind === "text";
	addSample({
		frameCount,
		frameIndex: startFrame,
		reason: {
			kind: isText ? "text-start" : "segment-start",
			subjectId: segment.id,
		},
		samples,
	});
	addSample({
		frameCount,
		frameIndex: endFrame - 1,
		reason: {
			kind: isText ? "text-end-before" : "segment-end-before",
			subjectId: segment.id,
		},
		samples,
	});
	addSample({
		frameCount,
		frameIndex: endFrame,
		reason: {
			kind: isText ? "text-end-after" : "segment-end-after",
			subjectId: segment.id,
		},
		samples,
	});
}

function nextRandomState({ state }: { state: number }): number {
	let next = state >>> 0;
	next ^= next << 13;
	next ^= next >>> 17;
	next ^= next << 5;
	return next >>> 0;
}

function collectRootTimeline({
	document,
}: {
	document: SamplePlanDocument;
}): SamplePlanDocument["timelines"][number] {
	const roots = document.timelines.filter(({ isRoot }) => isRoot);
	if (roots.length !== 1 || !roots[0]) {
		throw new Error("Frame sampling requires exactly one root timeline.");
	}
	return roots[0];
}

function deriveDurationUs({
	document,
	segments,
}: {
	document: SamplePlanDocument;
	segments: SamplePlanSegment[];
}): number {
	if (document.project.durationUs !== undefined) {
		return document.project.durationUs;
	}
	return segments.reduce(
		(maximum, { targetRange }) =>
			Math.max(maximum, targetRange.startUs + targetRange.durationUs),
		0
	);
}

function addTransitionSamples({
	boundaries,
	fps,
	frameCount,
	samples,
	segmentsById,
	transition,
}: {
	boundaries: Set<number>;
	fps: number;
	frameCount: number;
	samples: Map<number, MutableSample>;
	segmentsById: Map<string, SamplePlanSegment>;
	transition: SamplePlanTransition;
}): void {
	const outgoing = segmentsById.get(transition.fromSegmentId);
	const incoming = segmentsById.get(transition.toSegmentId);
	if (!outgoing || !incoming || transition.durationUs <= 0) return;
	const seamUs = outgoing.targetRange.startUs + outgoing.targetRange.durationUs;
	const halfDurationUs = transition.durationUs / 2;
	const frames = [
		{
			kind: "transition-before" as const,
			timeUs: seamUs - halfDurationUs,
		},
		{ kind: "transition-middle" as const, timeUs: seamUs },
		{
			kind: "transition-after" as const,
			timeUs: seamUs + halfDurationUs,
		},
	];
	for (const { kind, timeUs } of frames) {
		const frameIndex = frameAtOrAfter({ fps, timeUs });
		boundaries.add(frameIndex);
		addSample({
			frameCount,
			frameIndex,
			reason: { kind, subjectId: transition.id },
			samples,
		});
	}
}

function addLongestStableSample({
	boundaries,
	frameCount,
	samples,
}: {
	boundaries: Set<number>;
	frameCount: number;
	samples: Map<number, MutableSample>;
}): void {
	const sorted = [...boundaries]
		.filter((frame) => frame >= 0 && frame <= frameCount)
		.sort((left, right) => left - right);
	let bestStart = 0;
	let bestEnd = 0;
	let bestLength = -1;
	for (let index = 1; index < sorted.length; index += 1) {
		const start = sorted[index - 1];
		const end = sorted[index];
		if (start !== undefined && end !== undefined && end - start > bestLength) {
			bestStart = start;
			bestEnd = end;
			bestLength = end - start;
		}
	}
	addSample({
		frameCount,
		frameIndex: Math.floor((bestStart + bestEnd - 1) / 2),
		reason: { kind: "longest-stable-middle" },
		samples,
	});
}

export function buildFrameSamplePlan({
	document,
	randomSampleCount = DEFAULT_RANDOM_SAMPLE_COUNT,
	seed = DEFAULT_RANDOM_SEED,
}: {
	document: SamplePlanDocument;
	randomSampleCount?: number;
	seed?: number;
}): FrameSamplePlan {
	requirePositiveFinite({ label: "Project FPS", value: document.project.fps });
	if (
		!Number.isSafeInteger(randomSampleCount) ||
		randomSampleCount < 0 ||
		randomSampleCount > MAX_RANDOM_SAMPLE_COUNT ||
		!Number.isSafeInteger(seed)
	) {
		throw new Error("Frame sampling seed or random sample count is invalid.");
	}
	const root = collectRootTimeline({ document });
	const segments = root.tracks.flatMap(({ segments: trackSegments }) =>
		trackSegments.map((segment) => segment)
	);
	const durationUs = deriveDurationUs({ document, segments });
	requirePositiveFinite({ label: "Project duration", value: durationUs });
	const fps = document.project.fps;
	const frameCount = frameAtOrAfter({ fps, timeUs: durationUs });
	if (!Number.isSafeInteger(frameCount) || frameCount <= 0) {
		throw new Error("Project frame count is invalid.");
	}
	const samples = new Map<number, MutableSample>();
	const boundaries = new Set<number>([0, frameCount]);
	const segmentsById = new Map(
		segments.map((segment) => [segment.id, segment])
	);
	addSample({
		frameCount,
		frameIndex: 0,
		reason: { kind: "project-first" },
		samples,
	});
	addSample({
		frameCount,
		frameIndex: frameCount - 1,
		reason: { kind: "project-last" },
		samples,
	});
	for (const segment of segments) {
		const startFrame = frameAtOrAfter({
			fps,
			timeUs: segment.targetRange.startUs,
		});
		const endFrame = frameAtOrAfter({
			fps,
			timeUs: segment.targetRange.startUs + segment.targetRange.durationUs,
		});
		boundaries.add(startFrame);
		boundaries.add(endFrame);
		addBoundarySamples({
			endFrame,
			frameCount,
			samples,
			segment,
			startFrame,
		});
	}
	for (const track of root.tracks) {
		for (const transition of track.transitions ?? []) {
			addTransitionSamples({
				boundaries,
				fps,
				frameCount,
				samples,
				segmentsById,
				transition,
			});
		}
	}
	addLongestStableSample({ boundaries, frameCount, samples });
	let randomState = seed >>> 0 || DEFAULT_RANDOM_SEED;
	const randomFrames = new Set<number>();
	const targetRandomSampleCount = Math.min(randomSampleCount, frameCount);
	for (
		let attempt = 0;
		randomFrames.size < targetRandomSampleCount && attempt < 4096;
		attempt += 1
	) {
		randomState = nextRandomState({ state: randomState });
		randomFrames.add(randomState % frameCount);
	}
	if (randomFrames.size !== targetRandomSampleCount) {
		throw new Error("Frame sampling could not produce unique random frames.");
	}
	for (const frameIndex of randomFrames) {
		addSample({
			frameCount,
			frameIndex,
			reason: { kind: "seeded-random" },
			samples,
		});
	}
	if (samples.size > MAX_TOTAL_SAMPLES) {
		throw new Error("Frame sample plan exceeds the bounded sample limit.");
	}
	return {
		coverage: {
			keyframes: "unsupported-by-interop-v1",
			transitionInterval: "semantic-seam-candidate",
		},
		durationUs,
		fps,
		frameCount,
		randomSampleCount: randomFrames.size,
		requestedRandomSampleCount: randomSampleCount,
		samples: [...samples.values()]
			.sort((left, right) => left.frameIndex - right.frameIndex)
			.map(({ frameIndex, reasons }) => ({
				frameIndex,
				reasons: [...reasons.values()].sort((left, right) =>
					reasonKey({ reason: left }).localeCompare(
						reasonKey({ reason: right })
					)
				),
				timestampUs: timestampForFrame({ fps, frameIndex }),
			})),
		seed,
	};
}
