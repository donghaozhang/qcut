/**
 * Semantic document diff (JYI-017).
 *
 * Compares two DraftInteropDocumentV1s — source vs re-imported, or
 * pre-writeback vs post-writeback — and classifies every difference:
 *
 *   breaking   the round-trip lost or changed user-visible meaning
 *   tolerable  inside the caller's declared thresholds (e.g. sub-frame
 *              timing drift)
 *   info       environment-dependent fields that legitimately differ
 *
 * Pure, deterministic, JSON-serializable. Assessment-side fields
 * (capability, issues, resource status) and binding keys (foreignRef) are
 * excluded by default: they describe OUR pipeline, not the draft.
 *
 * @module @qcut/editor-core/draft-interop/semantic-diff
 */

import type {
	DraftInteropDocumentV1,
	InteropResource,
	InteropSegment,
	InteropTimeline,
	InteropTrack,
	InteropTransition,
} from "./document.js";
import { diffInteropTextSemantics } from "./semantic-text-diff.js";
import { diffInteropMediaVisualSemantics } from "./semantic-visual-diff.js";

export type SemanticDiffSeverity = "breaking" | "tolerable" | "info";

export type SemanticDiffKind = "missing" | "extra" | "changed";

export interface SemanticDiffEntry {
	/** JSON-pointer-like location in the LEFT document's coordinates. */
	path: string;
	kind: SemanticDiffKind;
	severity: SemanticDiffSeverity;
	/** Semantic id of the node the entry is about, when it has one. */
	subjectId?: string;
	left?: unknown;
	right?: unknown;
}

export interface SemanticDiffOptions {
	/** Absolute per-boundary timing drift allowed before it turns breaking. */
	timeToleranceUs?: number;
	/** Absolute speed drift allowed before it turns breaking. */
	speedTolerance?: number;
}

export interface SemanticDiffResultV1 {
	schemaVersion: 1;
	identical: boolean;
	breakingCount: number;
	tolerableCount: number;
	infoCount: number;
	entries: SemanticDiffEntry[];
}

/**
 * Half a frame at the given fps, in integer microseconds — the natural
 * profile threshold for timing drift that no renderer can show.
 */
export function halfFrameToleranceUs({ fps }: { fps: number }): number {
	if (!Number.isFinite(fps) || fps <= 0) {
		return 0;
	}
	return Math.floor(1_000_000 / fps / 2);
}

interface DiffContext {
	entries: SemanticDiffEntry[];
	timeToleranceUs: number;
	speedTolerance: number;
}

function report({
	context,
	path,
	kind,
	severity,
	subjectId,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	kind: SemanticDiffKind;
	severity: SemanticDiffSeverity;
	subjectId?: string;
	left?: unknown;
	right?: unknown;
}): void {
	context.entries.push({
		path,
		kind,
		severity,
		...(subjectId === undefined ? {} : { subjectId }),
		...(left === undefined ? {} : { left }),
		...(right === undefined ? {} : { right }),
	});
}

function diffScalar({
	context,
	path,
	subjectId,
	left,
	right,
	severity = "breaking",
}: {
	context: DiffContext;
	path: string;
	subjectId?: string;
	left: unknown;
	right: unknown;
	severity?: SemanticDiffSeverity;
}): void {
	if (left !== right) {
		report({
			context,
			path,
			kind: "changed",
			severity,
			...(subjectId === undefined ? {} : { subjectId }),
			left,
			right,
		});
	}
}

function diffScalarFields<Node extends object>({
	context,
	path,
	subjectId,
	fields,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	subjectId: string;
	fields: readonly (keyof Node)[];
	left: Node;
	right: Node;
}): void {
	for (const field of fields) {
		diffScalar({
			context,
			path: `${path}/${String(field)}`,
			subjectId,
			left: left[field],
			right: right[field],
		});
	}
}

function diffTimeValue({
	context,
	path,
	subjectId,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	subjectId?: string;
	left: number;
	right: number;
}): void {
	if (left === right) {
		return;
	}
	const severity: SemanticDiffSeverity =
		Math.abs(left - right) <= context.timeToleranceUs
			? "tolerable"
			: "breaking";
	report({
		context,
		path,
		kind: "changed",
		severity,
		...(subjectId === undefined ? {} : { subjectId }),
		left,
		right,
	});
}

function diffSegment({
	context,
	path,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	left: InteropSegment;
	right: InteropSegment;
}): void {
	const subjectId = left.id;
	diffScalar({
		context,
		path: `${path}/kind`,
		subjectId,
		left: left.kind,
		right: right.kind,
	});
	diffScalar({
		context,
		path: `${path}/resourceId`,
		subjectId,
		left: left.resourceId,
		right: right.resourceId,
	});
	diffTimeValue({
		context,
		path: `${path}/targetRange/startUs`,
		subjectId,
		left: left.targetRange.startUs,
		right: right.targetRange.startUs,
	});
	diffTimeValue({
		context,
		path: `${path}/targetRange/durationUs`,
		subjectId,
		left: left.targetRange.durationUs,
		right: right.targetRange.durationUs,
	});
	const leftSource = left.sourceRange;
	const rightSource = right.sourceRange;
	if ((leftSource === undefined) !== (rightSource === undefined)) {
		report({
			context,
			path: `${path}/sourceRange`,
			kind: leftSource === undefined ? "extra" : "missing",
			severity: "breaking",
			subjectId,
			left: leftSource,
			right: rightSource,
		});
	} else if (leftSource !== undefined && rightSource !== undefined) {
		diffTimeValue({
			context,
			path: `${path}/sourceRange/startUs`,
			subjectId,
			left: leftSource.startUs,
			right: rightSource.startUs,
		});
		diffTimeValue({
			context,
			path: `${path}/sourceRange/durationUs`,
			subjectId,
			left: leftSource.durationUs,
			right: rightSource.durationUs,
		});
	}
	const leftSpeed = left.speed ?? 1;
	const rightSpeed = right.speed ?? 1;
	if (leftSpeed !== rightSpeed) {
		report({
			context,
			path: `${path}/speed`,
			kind: "changed",
			severity:
				Math.abs(leftSpeed - rightSpeed) <= context.speedTolerance
					? "tolerable"
					: "breaking",
			subjectId,
			left: leftSpeed,
			right: rightSpeed,
		});
	}
	for (const entry of diffInteropTextSemantics({
		path: `${path}/text`,
		subjectId,
		left: left.text,
		right: right.text,
	})) {
		report({ context, severity: "breaking", ...entry });
	}
	for (const entry of diffInteropMediaVisualSemantics({
		path: `${path}/visual`,
		subjectId,
		timeToleranceUs: context.timeToleranceUs,
		left: left.visual,
		right: right.visual,
	})) {
		report({ context, ...entry });
	}
}

function diffById<Node extends { id: string }>({
	context,
	path,
	leftNodes,
	rightNodes,
	diffNode,
}: {
	context: DiffContext;
	path: string;
	leftNodes: readonly Node[];
	rightNodes: readonly Node[];
	diffNode: (options: {
		path: string;
		left: Node;
		right: Node;
		index: number;
	}) => void;
}): void {
	const rightById = new Map(rightNodes.map((node) => [node.id, node]));
	const leftIds = new Set(leftNodes.map((node) => node.id));
	for (const [index, leftNode] of leftNodes.entries()) {
		const rightNode = rightById.get(leftNode.id);
		if (rightNode === undefined) {
			report({
				context,
				path: `${path}/${index}`,
				kind: "missing",
				severity: "breaking",
				subjectId: leftNode.id,
			});
			continue;
		}
		diffNode({
			path: `${path}/${index}`,
			left: leftNode,
			right: rightNode,
			index,
		});
	}
	for (const rightNode of rightNodes) {
		if (!leftIds.has(rightNode.id)) {
			report({
				context,
				path,
				kind: "extra",
				severity: "breaking",
				subjectId: rightNode.id,
				right: rightNode.id,
			});
		}
	}
}

function diffTrack({
	context,
	path,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	left: InteropTrack;
	right: InteropTrack;
}): void {
	diffScalar({
		context,
		path: `${path}/kind`,
		subjectId: left.id,
		left: left.kind,
		right: right.kind,
	});
	diffScalar({
		context,
		path: `${path}/order`,
		subjectId: left.id,
		left: left.order,
		right: right.order,
	});
	diffScalar({
		context,
		path: `${path}/isMain`,
		subjectId: left.id,
		left: left.isMain ?? false,
		right: right.isMain ?? false,
	});
	diffById({
		context,
		path: `${path}/segments`,
		leftNodes: left.segments,
		rightNodes: right.segments,
		diffNode: ({ path: segmentPath, left: leftSegment, right: rightSegment }) =>
			diffSegment({
				context,
				path: segmentPath,
				left: leftSegment,
				right: rightSegment,
			}),
	});
	diffById({
		context,
		path: `${path}/transitions`,
		leftNodes: left.transitions ?? [],
		rightNodes: right.transitions ?? [],
		diffNode: ({
			path: transitionPath,
			left: leftTransition,
			right: rightTransition,
		}) =>
			diffTransition({
				context,
				path: transitionPath,
				left: leftTransition,
				right: rightTransition,
			}),
	});
}

function diffTransition({
	context,
	path,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	left: InteropTransition;
	right: InteropTransition;
}): void {
	const subjectId = left.id;
	diffScalarFields({
		context,
		path,
		subjectId,
		fields: ["type", "fromSegmentId", "toSegmentId"],
		left,
		right,
	});
	diffTimeValue({
		context,
		path: `${path}/durationUs`,
		subjectId,
		left: left.durationUs,
		right: right.durationUs,
	});
}

function diffTimeline({
	context,
	path,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	left: InteropTimeline;
	right: InteropTimeline;
}): void {
	diffScalar({
		context,
		path: `${path}/isRoot`,
		subjectId: left.id,
		left: left.isRoot,
		right: right.isRoot,
	});
	diffById({
		context,
		path: `${path}/tracks`,
		leftNodes: left.tracks,
		rightNodes: right.tracks,
		diffNode: ({ path: trackPath, left: leftTrack, right: rightTrack }) =>
			diffTrack({
				context,
				path: trackPath,
				left: leftTrack,
				right: rightTrack,
			}),
	});
}

function diffResource({
	context,
	path,
	left,
	right,
}: {
	context: DiffContext;
	path: string;
	left: InteropResource;
	right: InteropResource;
}): void {
	diffScalar({
		context,
		path: `${path}/kind`,
		subjectId: left.id,
		left: left.kind,
		right: right.kind,
	});
	// Names drift across relinks without changing meaning.
	diffScalar({
		context,
		path: `${path}/name`,
		subjectId: left.id,
		left: left.name,
		right: right.name,
		severity: "info",
	});
	// A known-on-both-sides hash mismatch means different bytes: breaking.
	if (
		left.sha256 !== undefined &&
		right.sha256 !== undefined &&
		left.sha256 !== right.sha256
	) {
		report({
			context,
			path: `${path}/sha256`,
			kind: "changed",
			severity: "breaking",
			subjectId: left.id,
			left: left.sha256,
			right: right.sha256,
		});
	}
	if (
		left.durationUs !== undefined &&
		right.durationUs !== undefined &&
		left.durationUs !== right.durationUs
	) {
		diffTimeValue({
			context,
			path: `${path}/durationUs`,
			subjectId: left.id,
			left: left.durationUs,
			right: right.durationUs,
		});
	}
}

function linkKey(link: { type: string; fromId: string; toId: string }): string {
	return [link.type, link.fromId, link.toId].join("\u001f");
}

/**
 * Diffs two semantic documents. `left` is the reference (source) and
 * `right` the candidate (re-imported / post-writeback).
 */
export function diffDraftInteropDocuments({
	left,
	right,
	options = {},
}: {
	left: DraftInteropDocumentV1;
	right: DraftInteropDocumentV1;
	options?: SemanticDiffOptions;
}): SemanticDiffResultV1 {
	const context: DiffContext = {
		entries: [],
		timeToleranceUs: options.timeToleranceUs ?? 0,
		speedTolerance: options.speedTolerance ?? 0,
	};

	diffScalar({
		context,
		path: "/project/width",
		left: left.project.width,
		right: right.project.width,
	});
	diffScalar({
		context,
		path: "/project/height",
		left: left.project.height,
		right: right.project.height,
	});
	diffScalar({
		context,
		path: "/project/fps",
		left: left.project.fps,
		right: right.project.fps,
	});
	if (
		left.project.durationUs !== undefined &&
		right.project.durationUs !== undefined
	) {
		diffTimeValue({
			context,
			path: "/project/durationUs",
			left: left.project.durationUs,
			right: right.project.durationUs,
		});
	}

	diffById({
		context,
		path: "/timelines",
		leftNodes: left.timelines,
		rightNodes: right.timelines,
		diffNode: ({ path, left: leftTimeline, right: rightTimeline }) =>
			diffTimeline({
				context,
				path,
				left: leftTimeline,
				right: rightTimeline,
			}),
	});
	diffById({
		context,
		path: "/resources",
		leftNodes: left.resources,
		rightNodes: right.resources,
		diffNode: ({ path, left: leftResource, right: rightResource }) =>
			diffResource({
				context,
				path,
				left: leftResource,
				right: rightResource,
			}),
	});

	const leftLinks = new Map(left.links.map((link) => [linkKey(link), link]));
	const rightLinks = new Map(right.links.map((link) => [linkKey(link), link]));
	for (const [key, link] of leftLinks) {
		if (!rightLinks.has(key)) {
			report({
				context,
				path: "/links",
				kind: "missing",
				severity: "breaking",
				subjectId: link.id,
				left: key,
			});
		}
	}
	for (const [key, link] of rightLinks) {
		if (!leftLinks.has(key)) {
			report({
				context,
				path: "/links",
				kind: "extra",
				severity: "breaking",
				subjectId: link.id,
				right: key,
			});
		}
	}

	let breakingCount = 0;
	let tolerableCount = 0;
	let infoCount = 0;
	for (const entry of context.entries) {
		if (entry.severity === "breaking") breakingCount += 1;
		else if (entry.severity === "tolerable") tolerableCount += 1;
		else infoCount += 1;
	}
	return {
		schemaVersion: 1,
		identical: context.entries.length === 0,
		breakingCount,
		tolerableCount,
		infoCount,
		entries: context.entries,
	};
}
