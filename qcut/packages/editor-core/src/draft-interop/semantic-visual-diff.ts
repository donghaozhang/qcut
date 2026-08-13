import type {
	InteropMediaVisual,
	InteropVisualKeyframe,
	InteropVisualKeyframeProperty,
} from "./document.js";

export interface SemanticVisualDiffEntry {
	path: string;
	kind: "missing" | "extra" | "changed";
	severity: "breaking" | "tolerable";
	subjectId: string;
	left?: unknown;
	right?: unknown;
}

const VISUAL_PROPERTIES = [
	"x",
	"y",
] as const satisfies readonly InteropVisualKeyframeProperty[];

function changed({
	path,
	subjectId,
	left,
	right,
	severity = "breaking",
}: {
	path: string;
	subjectId: string;
	left: unknown;
	right: unknown;
	severity?: SemanticVisualDiffEntry["severity"];
}): SemanticVisualDiffEntry {
	return { path, kind: "changed", severity, subjectId, left, right };
}

function diffKeyframe({
	path,
	subjectId,
	timeToleranceUs,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	timeToleranceUs: number;
	left: InteropVisualKeyframe;
	right: InteropVisualKeyframe;
}): SemanticVisualDiffEntry[] {
	const entries: SemanticVisualDiffEntry[] = [];
	if (left.timeOffsetUs !== right.timeOffsetUs) {
		entries.push(
			changed({
				path: `${path}/timeOffsetUs`,
				subjectId,
				left: left.timeOffsetUs,
				right: right.timeOffsetUs,
				severity:
					Math.abs(left.timeOffsetUs - right.timeOffsetUs) <= timeToleranceUs
						? "tolerable"
						: "breaking",
			})
		);
	}
	for (const field of ["value", "easing"] as const) {
		if (left[field] !== right[field]) {
			entries.push(
				changed({
					path: `${path}/${field}`,
					subjectId,
					left: left[field],
					right: right[field],
				})
			);
		}
	}
	return entries;
}

function diffKeyframeChannel({
	path,
	subjectId,
	timeToleranceUs,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	timeToleranceUs: number;
	left?: InteropVisualKeyframe[];
	right?: InteropVisualKeyframe[];
}): SemanticVisualDiffEntry[] {
	if (left === undefined && right === undefined) return [];
	if (left === undefined || right === undefined) {
		return [
			{
				path,
				kind: left === undefined ? "extra" : "missing",
				severity: "breaking",
				subjectId,
			},
		];
	}
	const entries: SemanticVisualDiffEntry[] = [];
	const entryCount = Math.max(left.length, right.length);
	for (let index = 0; index < entryCount; index += 1) {
		const leftKeyframe = left[index];
		const rightKeyframe = right[index];
		if (leftKeyframe === undefined || rightKeyframe === undefined) {
			entries.push({
				path: `${path}/${index}`,
				kind: leftKeyframe === undefined ? "extra" : "missing",
				severity: "breaking",
				subjectId,
			});
			continue;
		}
		entries.push(
			...diffKeyframe({
				path: `${path}/${index}`,
				subjectId,
				timeToleranceUs,
				left: leftKeyframe,
				right: rightKeyframe,
			})
		);
	}
	return entries;
}

/** Compares canvas/keyframe behavior while excluding raw keyframe identities. */
export function diffInteropMediaVisualSemantics({
	path,
	subjectId,
	timeToleranceUs,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	timeToleranceUs: number;
	left?: InteropMediaVisual;
	right?: InteropMediaVisual;
}): SemanticVisualDiffEntry[] {
	if (left === undefined && right === undefined) return [];
	if (left === undefined || right === undefined) {
		return [
			{
				path,
				kind: left === undefined ? "extra" : "missing",
				severity: "breaking",
				subjectId,
			},
		];
	}
	const entries: SemanticVisualDiffEntry[] = [];
	for (const field of ["xPx", "yPx"] as const) {
		if (left[field] !== right[field]) {
			entries.push(
				changed({
					path: `${path}/${field}`,
					subjectId,
					left: left[field],
					right: right[field],
				})
			);
		}
	}
	for (const property of VISUAL_PROPERTIES) {
		entries.push(
			...diffKeyframeChannel({
				path: `${path}/keyframes/${property}`,
				subjectId,
				timeToleranceUs,
				left: left.keyframes?.[property],
				right: right.keyframes?.[property],
			})
		);
	}
	return entries;
}
