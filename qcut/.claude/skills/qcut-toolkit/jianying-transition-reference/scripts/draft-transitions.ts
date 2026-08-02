import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import path from "node:path";
import {
	booleanValue,
	numberValue,
	objectArray,
	objectValue,
	stringArray,
	stringValue,
} from "./json-values";

interface DraftTimeRange {
	start: number;
	duration: number;
}

export interface DraftTransitionOwner {
	trackIndex: number;
	trackId: string;
	trackType: string;
	segmentIndex: number;
	segmentId: string;
	materialId: string;
	targetTimeRange: DraftTimeRange | null;
	nextSegment: {
		segmentIndex: number;
		segmentId: string;
		materialId: string;
		targetTimeRange: DraftTimeRange | null;
	} | null;
	seamDeltaMicroseconds: number | null;
	isAdjacentSeam: boolean | null;
}

export interface DraftTransitionEvidence {
	sourcePath: string;
	sourceKind: "backup" | "subdraft" | "draft";
	modifiedAt: string;
	project: {
		id: string;
		name: string;
		fps: number | null;
		durationMicroseconds: number | null;
		version: number | null;
		newVersion: string;
		appVersion: string;
	};
	material: {
		id: string;
		name: string;
		categoryId: string;
		categoryName: string;
		durationMicroseconds: number;
		draftEffectId: string;
		resourceId: string;
		isOverlap: boolean | null;
		packagePath: string;
		requestId: string;
		platform: string;
		type: string;
	};
	owners: DraftTransitionOwner[];
	ownershipState: "owned" | "missing" | "ambiguous";
	frameQuantization: {
		frameCount: number | null;
		exactFrameCount: number | null;
		errorMicroseconds: number | null;
	};
}

export interface DraftTransitionScan {
	rootPaths: string[];
	scannedFiles: number;
	parsedFiles: number;
	skippedFiles: number;
	evidence: DraftTransitionEvidence[];
}

function isDraftCandidate({ filePath }: { filePath: string }): boolean {
	const base = path.basename(filePath);
	return (
		base === "draft_info.json" ||
		base === "draft_info.json.bak" ||
		base === "draft_content.json" ||
		(filePath.includes(`${path.sep}.backup${path.sep}`) && base.endsWith(".bak"))
	);
}

function walkCandidateFiles({ rootPath }: { rootPath: string }): string[] {
	if (!existsSync(rootPath)) return [];
	const rootStats = statSync(rootPath);
	if (rootStats.isFile()) return isDraftCandidate({ filePath: rootPath }) ? [rootPath] : [];
	const files: string[] = [];
	const pending = [rootPath];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const candidate = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(candidate);
				continue;
			}
			if (entry.isFile() && isDraftCandidate({ filePath: candidate })) {
				files.push(candidate);
			}
		}
	}
	return files.sort();
}

function sourceKind({
	filePath,
}: {
	filePath: string;
}): DraftTransitionEvidence["sourceKind"] {
	if (filePath.includes(`${path.sep}.backup${path.sep}`)) return "backup";
	if (filePath.includes(`${path.sep}subdraft${path.sep}`)) return "subdraft";
	return "draft";
}

function timeRange({ value }: { value: unknown }): DraftTimeRange | null {
	const object = objectValue({ value });
	if (!object) return null;
	const start = numberValue({ value: object.start });
	const duration = numberValue({ value: object.duration });
	if (start === null || duration === null) return null;
	return { start, duration };
}

function ownershipState({
	owners,
}: {
	owners: DraftTransitionOwner[];
}): DraftTransitionEvidence["ownershipState"] {
	if (owners.length === 0) return "missing";
	if (owners.length === 1) return "owned";
	return "ambiguous";
}

interface OrderedSegment {
	segment: Record<string, unknown>;
	segmentIndex: number;
}

/**
 * Segments sorted by target_timerange.start, keeping the original index so the
 * report still points at the draft's own numbering. Entries without a range
 * keep their relative array order at the end.
 */
function timelineOrdered({
	segments,
}: {
	segments: Record<string, unknown>[];
}): OrderedSegment[] {
	return segments
		.map((segment, segmentIndex) => ({ segment, segmentIndex }))
		.sort((left, right) => {
			const leftStart = timeRange({ value: left.segment.target_timerange })?.start;
			const rightStart = timeRange({ value: right.segment.target_timerange })?.start;
			if (leftStart === undefined && rightStart === undefined) {
				return left.segmentIndex - right.segmentIndex;
			}
			if (leftStart === undefined) return 1;
			if (rightStart === undefined) return -1;
			if (leftStart !== rightStart) return leftStart - rightStart;
			return left.segmentIndex - right.segmentIndex;
		});
}

function segmentSummary({
	segment,
	segmentIndex,
}: {
	segment: Record<string, unknown>;
	segmentIndex: number;
}) {
	return {
		segmentIndex,
		segmentId: stringValue({ value: segment.id }),
		materialId: stringValue({ value: segment.material_id }),
		targetTimeRange: timeRange({ value: segment.target_timerange }),
	};
}

function transitionOwners({
	content,
	transitionId,
}: {
	content: Record<string, unknown>;
	transitionId: string;
}): DraftTransitionOwner[] {
	const owners: DraftTransitionOwner[] = [];
	for (const [trackIndex, track] of objectArray({ value: content.tracks }).entries()) {
		const segments = objectArray({ value: track.segments });
		// formats.md pairs a transition with the next segment along the timeline,
		// which is only the next array element when the draft happens to store
		// them in order. Ordering here keeps the seam evidence honest either way.
		const ordered = timelineOrdered({ segments });
		for (const [orderIndex, entry] of ordered.entries()) {
			const { segment, segmentIndex } = entry;
			if (!stringArray({ value: segment.extra_material_refs }).includes(transitionId)) {
				continue;
			}
			const current = segmentSummary({ segment, segmentIndex });
			const following = ordered.at(orderIndex + 1);
			const next = following
				? segmentSummary({
						segment: following.segment,
						segmentIndex: following.segmentIndex,
					})
				: null;
			const seamDeltaMicroseconds =
				current.targetTimeRange && next?.targetTimeRange
					? next.targetTimeRange.start -
						(current.targetTimeRange.start + current.targetTimeRange.duration)
					: null;
			owners.push({
				trackIndex,
				trackId: stringValue({ value: track.id }),
				trackType: stringValue({ value: track.type }),
				...current,
				nextSegment: next,
				seamDeltaMicroseconds,
				isAdjacentSeam:
					seamDeltaMicroseconds === null
						? null
						: Math.abs(seamDeltaMicroseconds) <= 1,
			});
		}
	}
	return owners;
}

function frameQuantization({
	durationMicroseconds,
	fps,
}: {
	durationMicroseconds: number;
	fps: number | null;
}): DraftTransitionEvidence["frameQuantization"] {
	if (!(fps && fps > 0)) {
		return { frameCount: null, exactFrameCount: null, errorMicroseconds: null };
	}
	const frameCount = (durationMicroseconds / 1_000_000) * fps;
	const exactFrameCount = Math.round(frameCount);
	const quantizedDuration = (exactFrameCount / fps) * 1_000_000;
	return {
		frameCount,
		exactFrameCount:
			Math.abs(frameCount - exactFrameCount) <= 0.001 ? exactFrameCount : null,
		errorMicroseconds: durationMicroseconds - quantizedDuration,
	};
}

function evidenceFromContent({
	content,
	filePath,
}: {
	content: Record<string, unknown>;
	filePath: string;
}): DraftTransitionEvidence[] {
	const materials = objectValue({ value: content.materials }) ?? {};
	const fps = numberValue({ value: content.fps });
	const platform = objectValue({ value: content.platform }) ?? {};
	return objectArray({ value: materials.transitions }).flatMap((material) => {
		const id = stringValue({ value: material.id });
		const durationMicroseconds = numberValue({ value: material.duration });
		if (!(id && durationMicroseconds !== null)) return [];
		const owners = transitionOwners({ content, transitionId: id });
		return [
			{
				sourcePath: filePath,
				sourceKind: sourceKind({ filePath }),
				modifiedAt: statSync(filePath).mtime.toISOString(),
				project: {
					id: stringValue({ value: content.id }),
					name: stringValue({ value: content.name }),
					fps,
					durationMicroseconds: numberValue({ value: content.duration }),
					version: numberValue({ value: content.version }),
					newVersion: stringValue({ value: content.new_version }),
					appVersion: stringValue({ value: platform.app_version }),
				},
				material: {
					id,
					name: stringValue({ value: material.name }),
					categoryId: stringValue({ value: material.category_id }),
					categoryName: stringValue({ value: material.category_name }),
					durationMicroseconds,
					draftEffectId: stringValue({ value: material.effect_id }),
					resourceId: stringValue({ value: material.resource_id }),
					isOverlap: booleanValue({ value: material.is_overlap }),
					packagePath: stringValue({ value: material.path }),
					requestId: stringValue({ value: material.request_id }),
					platform: stringValue({ value: material.platform }),
					type: stringValue({ value: material.type }),
				},
				owners,
				ownershipState: ownershipState({ owners }),
				frameQuantization: frameQuantization({ durationMicroseconds, fps }),
			},
		];
	});
}

export function scanDraftTransitions({
	rootPaths,
}: {
	rootPaths: string[];
}): DraftTransitionScan {
	const files = [
		...new Set(rootPaths.flatMap((rootPath) => walkCandidateFiles({ rootPath }))),
	];
	let parsedFiles = 0;
	let skippedFiles = 0;
	const evidence: DraftTransitionEvidence[] = [];
	for (const filePath of files) {
		try {
			const content = objectValue({ value: JSON.parse(readFileSync(filePath, "utf8")) });
			if (!content) {
				skippedFiles += 1;
				continue;
			}
			parsedFiles += 1;
			evidence.push(...evidenceFromContent({ content, filePath }));
		} catch {
			skippedFiles += 1;
		}
	}
	return {
		rootPaths,
		scannedFiles: files.length,
		parsedFiles,
		skippedFiles,
		evidence: evidence.sort((left, right) =>
			left.sourcePath.localeCompare(right.sourcePath)
		),
	};
}

export function matchingDraftTransitions({
	evidence,
	title,
	resourceId,
}: {
	evidence: DraftTransitionEvidence[];
	title?: string;
	resourceId?: string;
}): DraftTransitionEvidence[] {
	return evidence.filter((entry) => {
		if (resourceId && entry.material.resourceId === resourceId) return true;
		return Boolean(title && entry.material.name === title);
	});
}
