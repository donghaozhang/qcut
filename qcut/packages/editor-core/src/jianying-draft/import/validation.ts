/**
 * Raw draft graph validation (JYI-004).
 *
 * Turns structural defects in a {@link RawDraftGraph} into stable interop
 * issues: duplicate ids, dangling material references, invalid time ranges,
 * same-track target overlaps, and draft-reference cycles. Validation only
 * reports — capability downgrades and repair decisions belong to later
 * pipeline stages.
 *
 * @module @qcut/editor-core/jianying-draft/import/validation
 */

import type { InteropIssue } from "../../draft-interop/issues.js";
import { rangesOverlap } from "../../timeline/collision-policy.js";
import type {
	RawDraftGraph,
	RawGraphSegmentNode,
	RawGraphTimeRange,
} from "./graph-reader.js";

function isValidTimeRange(range: RawGraphTimeRange): boolean {
	return (
		Number.isSafeInteger(range.start) &&
		Number.isSafeInteger(range.duration) &&
		range.start >= 0 &&
		range.duration > 0
	);
}

function validateSegmentRanges({
	segment,
	issues,
}: {
	segment: RawGraphSegmentNode;
	issues: InteropIssue[];
}): void {
	const named: Array<[string, RawGraphTimeRange | undefined]> = [
		["source_timerange", segment.sourceRange],
		["target_timerange", segment.targetRange],
	];
	for (const [field, range] of named) {
		if (range !== undefined && !isValidTimeRange(range)) {
			issues.push({
				code: "TIME_RANGE_INVALID",
				severity: "error",
				message: `${field} must be non-negative integers with duration > 0`,
				path: `${segment.jsonPointer}/${field}`,
				subjectId: segment.id,
			});
		}
	}
}

function validateSegmentReferences({
	graph,
	segment,
	issues,
}: {
	graph: RawDraftGraph;
	segment: RawGraphSegmentNode;
	issues: InteropIssue[];
}): void {
	const refs = [
		...(segment.materialId === undefined ? [] : [segment.materialId]),
		...segment.extraMaterialRefs,
	];
	for (const ref of refs) {
		if (!graph.materialsById.has(ref)) {
			issues.push({
				code: "REF_BROKEN",
				severity: "error",
				message: `segment references missing material "${ref}"`,
				path: segment.jsonPointer,
				subjectId: segment.id,
			});
		}
	}
}

function validateTrackOverlaps({
	graph,
	issues,
}: {
	graph: RawDraftGraph;
	issues: InteropIssue[];
}): void {
	for (const track of graph.tracks) {
		const placed: Array<{ segment: RawGraphSegmentNode; end: number }> = [];
		for (const segmentId of track.segmentIds) {
			const segment = graph.segmentsById.get(segmentId);
			const range = segment?.targetRange;
			if (segment === undefined || range === undefined) {
				continue;
			}
			if (!isValidTimeRange(range)) {
				// Already reported as TIME_RANGE_INVALID; overlap math would lie.
				continue;
			}
			const current = {
				startTime: range.start,
				endTime: range.start + range.duration,
			};
			for (const previous of placed) {
				const previousRange = previous.segment.targetRange;
				if (
					previousRange !== undefined &&
					rangesOverlap(current, {
						startTime: previousRange.start,
						endTime: previous.end,
					})
				) {
					issues.push({
						code: "TRACK_OVERLAP",
						severity: "error",
						message: `segments "${previous.segment.id}" and "${segment.id}" overlap on track "${track.id}"`,
						path: segment.jsonPointer,
						subjectId: segment.id,
					});
				}
			}
			placed.push({ segment, end: current.endTime });
		}
	}
}

/**
 * Validates an indexed raw graph. Read issues from the graph pass through
 * unchanged so callers get one consolidated list.
 */
export function validateRawDraftGraph({
	graph,
}: {
	graph: RawDraftGraph;
}): InteropIssue[] {
	const issues: InteropIssue[] = [...graph.readIssues];

	for (const duplicate of graph.duplicateIds) {
		issues.push({
			code: "REF_DUPLICATE_ID",
			severity: "error",
			message: `${duplicate.kind} id "${duplicate.id}" is already in use`,
			path: duplicate.jsonPointer,
			subjectId: duplicate.id,
		});
	}

	for (const segment of graph.segmentsById.values()) {
		validateSegmentRanges({ segment, issues });
		validateSegmentReferences({ graph, segment, issues });
	}

	validateTrackOverlaps({ graph, issues });
	return issues;
}

/** Parent→child draft reference, however the caller extracted it. */
export interface DraftReferenceEdge {
	fromDraftId: string;
	toDraftId: string;
}

/**
 * Detects reference cycles among (compound) drafts.
 *
 * Edge extraction from real drafts is gated on JYR-007 — the compound child
 * binding is unverified — so this operates on caller-provided edges and
 * reports each cycle once, anchored at its lexicographically smallest member.
 */
export function detectDraftReferenceCycles({
	edges,
}: {
	edges: readonly DraftReferenceEdge[];
}): InteropIssue[] {
	const adjacency = new Map<string, string[]>();
	for (const edge of edges) {
		const targets = adjacency.get(edge.fromDraftId) ?? [];
		targets.push(edge.toDraftId);
		adjacency.set(edge.fromDraftId, targets);
	}

	const issues: InteropIssue[] = [];
	const reportedCycles = new Set<string>();
	const state = new Map<string, "visiting" | "done">();
	const stack: string[] = [];

	const visit = (node: string): void => {
		state.set(node, "visiting");
		stack.push(node);
		for (const target of adjacency.get(node) ?? []) {
			const targetState = state.get(target);
			if (targetState === "done") {
				continue;
			}
			if (targetState === "visiting") {
				const cycle = stack.slice(stack.indexOf(target));
				const anchor = [...cycle].sort()[0];
				const key = [...cycle].sort().join("\u001f");
				if (!reportedCycles.has(key)) {
					reportedCycles.add(key);
					issues.push({
						code: "REF_CYCLE",
						severity: "error",
						message: `draft reference cycle: ${cycle.join(" -> ")} -> ${target}`,
						subjectId: anchor,
					});
				}
				continue;
			}
			visit(target);
		}
		stack.pop();
		state.set(node, "done");
	};

	for (const node of adjacency.keys()) {
		if (!state.has(node)) {
			visit(node);
		}
	}
	return issues;
}
