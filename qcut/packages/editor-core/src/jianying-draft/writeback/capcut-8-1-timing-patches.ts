import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
	RawNodeBinding,
	SameProfileScalarPatch,
} from "../../draft-interop/index.js";
import type {
	MediaElement,
	TimelineElement,
	TimelineTrack,
} from "../../types/timeline.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import { secondsToMicroseconds } from "../time.js";
import type { QCutDraftExportSnapshotV1 } from "../types.js";

export type CapCut81TimingPatchIssueCode =
	| "WRITEBACK_PROFILE_MISMATCH"
	| "WRITEBACK_ROOT_TIMELINE_MISSING"
	| "WRITEBACK_BINDING_MISSING"
	| "WRITEBACK_BINDING_NOT_CAPTURED"
	| "WRITEBACK_TRACK_MISSING"
	| "WRITEBACK_TRACK_ADDED"
	| "WRITEBACK_TRACK_CHANGED"
	| "WRITEBACK_SEGMENT_MISSING"
	| "WRITEBACK_SEGMENT_ADDED"
	| "WRITEBACK_SEGMENT_MOVED"
	| "WRITEBACK_SEGMENT_TYPE_CHANGED"
	| "WRITEBACK_RESOURCE_CHANGED"
	| "WRITEBACK_SPEED_CHANGED"
	| "WRITEBACK_TIME_INVALID";

export interface CapCut81TimingPatchIssue {
	code: CapCut81TimingPatchIssueCode;
	message: string;
	semanticId?: string;
	internalId?: string;
}

export type PlanCapCut81TimingPatchesResult =
	| {
			ok: true;
			patches: SameProfileScalarPatch[];
			importedSegmentCount: number;
	  }
	| { ok: false; issues: CapCut81TimingPatchIssue[] };

interface CurrentElementLocation {
	element: TimelineElement;
	track: TimelineTrack;
}

interface ImportedTrackContext {
	semanticTrackId: string;
	internalTrackId: string;
	expectedType: TimelineTrack["type"];
	order: number;
	segmentIds: string[];
}

const IMPORTED_SEGMENT_KINDS = new Set(["video", "image", "audio"]);

function buildElementLocations({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): Map<string, CurrentElementLocation> {
	const locations = new Map<string, CurrentElementLocation>();
	for (const track of tracks) {
		for (const element of track.elements) {
			locations.set(element.id, { element, track });
		}
	}
	return locations;
}

function getExpectedTrackType({
	kind,
}: {
	kind: string;
}): TimelineTrack["type"] | null {
	if (kind === "audio") return "audio";
	if (kind === "video") return "media";
	return null;
}

function collectImportedTracks({
	document,
	internalIdBySemanticId,
}: {
	document: DraftInteropDocumentV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
}):
	| { ok: true; tracks: ImportedTrackContext[] }
	| { ok: false; issues: CapCut81TimingPatchIssue[] } {
	const root = document.timelines.find(({ isRoot }) => isRoot);
	if (root === undefined) {
		return {
			ok: false,
			issues: [
				{
					code: "WRITEBACK_ROOT_TIMELINE_MISSING",
					message: "The imported document has no root timeline.",
				},
			],
		};
	}

	const tracks: ImportedTrackContext[] = [];
	for (const track of root.tracks) {
		const internalTrackId = internalIdBySemanticId[track.id];
		const expectedType = getExpectedTrackType({ kind: track.kind });
		if (internalTrackId === undefined || expectedType === null) continue;
		const segmentIds = track.segments
			.filter(
				(segment) =>
					IMPORTED_SEGMENT_KINDS.has(segment.kind) &&
					internalIdBySemanticId[segment.id] !== undefined
			)
			.map(({ id }) => id);
		if (segmentIds.length === 0) continue;
		tracks.push({
			semanticTrackId: track.id,
			internalTrackId,
			expectedType,
			order: track.order,
			segmentIds,
		});
	}
	return { ok: true, tracks };
}

function findCapturedBinding({
	envelope,
	semanticId,
}: {
	envelope: ForeignDraftEnvelopeV1;
	semanticId: string;
}):
	| { ok: true; binding: RawNodeBinding }
	| { ok: false; issue: CapCut81TimingPatchIssue } {
	const binding = envelope.bindings.find(
		(candidate) => candidate.semanticId === semanticId
	);
	if (binding === undefined) {
		return {
			ok: false,
			issue: {
				code: "WRITEBACK_BINDING_MISSING",
				message: `Imported segment ${semanticId} has no raw-node binding.`,
				semanticId,
			},
		};
	}
	if (
		!envelope.entries.some(({ relativePath }) => relativePath === binding.file)
	) {
		return {
			ok: false,
			issue: {
				code: "WRITEBACK_BINDING_NOT_CAPTURED",
				message: `Binding ${binding.foreignRef} points outside the captured envelope.`,
				semanticId,
			},
		};
	}
	return { ok: true, binding };
}

function pushPatchIfChanged({
	basePointer,
	domain,
	expectedValue,
	file,
	foreignRef,
	nextValue,
	ownerSemanticId,
	patches,
	suffix,
}: {
	basePointer: string;
	domain: SameProfileScalarPatch["domain"];
	expectedValue: number;
	file: string;
	foreignRef: string;
	nextValue: number;
	ownerSemanticId: string;
	patches: SameProfileScalarPatch[];
	suffix: string;
}): void {
	if (Object.is(expectedValue, nextValue)) return;
	patches.push({
		foreignRef: `${foreignRef}:${suffix}`,
		file,
		jsonPointer: `${basePointer}/${suffix}`,
		ownerSemanticId,
		domain,
		expectedValue,
		nextValue,
	});
}

function collectStructureIssues({
	currentTracks,
	importedTracks,
	internalIdBySemanticId,
}: {
	currentTracks: readonly TimelineTrack[];
	importedTracks: readonly ImportedTrackContext[];
	internalIdBySemanticId: Readonly<Record<string, string>>;
}): CapCut81TimingPatchIssue[] {
	const issues: CapCut81TimingPatchIssue[] = [];
	const importedTrackIds = new Set(
		importedTracks.map(({ internalTrackId }) => internalTrackId)
	);
	const importedElementIds = new Set(
		importedTracks.flatMap(({ segmentIds }) =>
			segmentIds.map((semanticId) => internalIdBySemanticId[semanticId])
		)
	);
	for (const track of currentTracks) {
		if (track.elements.length === 0) continue;
		if (!importedTrackIds.has(track.id)) {
			issues.push({
				code: "WRITEBACK_TRACK_ADDED",
				message: `QCut track ${track.id} has no imported CapCut owner.`,
				internalId: track.id,
			});
			continue;
		}
		for (const element of track.elements) {
			if (importedElementIds.has(element.id)) continue;
			issues.push({
				code: "WRITEBACK_SEGMENT_ADDED",
				message: `QCut element ${element.id} has no imported CapCut owner.`,
				internalId: element.id,
			});
		}
	}
	return issues;
}

function toMicroseconds({
	seconds,
	semanticId,
}: {
	seconds: number;
	semanticId: string;
}):
	| { ok: true; value: number }
	| { ok: false; issue: CapCut81TimingPatchIssue } {
	try {
		return { ok: true, value: secondsToMicroseconds({ seconds }) };
	} catch {
		return {
			ok: false,
			issue: {
				code: "WRITEBACK_TIME_INVALID",
				message: `QCut timing for ${semanticId} cannot be represented in integer microseconds.`,
				semanticId,
			},
		};
	}
}

export function planCapCut81TimingPatches({
	document,
	envelope,
	internalIdBySemanticId,
	snapshot,
}: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	snapshot: QCutDraftExportSnapshotV1;
}): PlanCapCut81TimingPatchesResult {
	if (
		document.source.profileId !== CAPCUT_8_1_PROFILE_ID ||
		envelope.profileId !== CAPCUT_8_1_PROFILE_ID
	) {
		return {
			ok: false,
			issues: [
				{
					code: "WRITEBACK_PROFILE_MISMATCH",
					message:
						"Timing patch planning requires the exact CapCut 8.1 profile.",
				},
			],
		};
	}
	const importedTrackResult = collectImportedTracks({
		document,
		internalIdBySemanticId,
	});
	if (!importedTrackResult.ok) return importedTrackResult;
	const importedTracks = importedTrackResult.tracks;
	const issues = collectStructureIssues({
		currentTracks: snapshot.tracks,
		importedTracks,
		internalIdBySemanticId,
	});
	const currentTracksById = new Map(
		snapshot.tracks.map((track) => [track.id, track])
	);
	const currentElementsById = buildElementLocations({
		tracks: snapshot.tracks,
	});
	const root = document.timelines.find(({ isRoot }) => isRoot);
	const semanticTracksById = new Map(
		(root?.tracks ?? []).map((track) => [track.id, track])
	);
	const patches: SameProfileScalarPatch[] = [];
	let importedSegmentCount = 0;

	for (const importedTrack of importedTracks) {
		const currentTrack = currentTracksById.get(importedTrack.internalTrackId);
		if (currentTrack === undefined) {
			issues.push({
				code: "WRITEBACK_TRACK_MISSING",
				message: `Imported track ${importedTrack.semanticTrackId} was deleted.`,
				semanticId: importedTrack.semanticTrackId,
				internalId: importedTrack.internalTrackId,
			});
			continue;
		}
		if (
			currentTrack.type !== importedTrack.expectedType ||
			(currentTrack.order ?? importedTrack.order) !== importedTrack.order
		) {
			issues.push({
				code: "WRITEBACK_TRACK_CHANGED",
				message: `Imported track ${importedTrack.semanticTrackId} changed type or order.`,
				semanticId: importedTrack.semanticTrackId,
				internalId: importedTrack.internalTrackId,
			});
		}
		const semanticTrack = semanticTracksById.get(importedTrack.semanticTrackId);
		for (const semanticId of importedTrack.segmentIds) {
			importedSegmentCount += 1;
			const internalId = internalIdBySemanticId[semanticId];
			const semanticSegment = semanticTrack?.segments.find(
				({ id }) => id === semanticId
			);
			const location =
				internalId === undefined
					? undefined
					: currentElementsById.get(internalId);
			if (location === undefined || semanticSegment === undefined) {
				issues.push({
					code: "WRITEBACK_SEGMENT_MISSING",
					message: `Imported segment ${semanticId} was deleted.`,
					semanticId,
					...(internalId === undefined ? {} : { internalId }),
				});
				continue;
			}
			if (location.track.id !== currentTrack.id) {
				issues.push({
					code: "WRITEBACK_SEGMENT_MOVED",
					message: `Imported segment ${semanticId} moved to another track.`,
					semanticId,
					internalId,
				});
				continue;
			}
			if (location.element.type !== "media") {
				issues.push({
					code: "WRITEBACK_SEGMENT_TYPE_CHANGED",
					message: `Imported segment ${semanticId} is no longer a media element.`,
					semanticId,
					internalId,
				});
				continue;
			}
			const element = location.element as MediaElement;
			const expectedMediaId =
				semanticSegment.resourceId === undefined
					? undefined
					: internalIdBySemanticId[semanticSegment.resourceId];
			if (
				expectedMediaId === undefined ||
				element.mediaId !== expectedMediaId
			) {
				issues.push({
					code: "WRITEBACK_RESOURCE_CHANGED",
					message: `Imported segment ${semanticId} changed its media resource.`,
					semanticId,
					internalId,
				});
				continue;
			}
			const currentSpeed = element.playbackRate ?? 1;
			const importedSpeed = semanticSegment.speed ?? 1;
			if (!Object.is(currentSpeed, importedSpeed)) {
				issues.push({
					code: "WRITEBACK_SPEED_CHANGED",
					message: `Imported segment ${semanticId} changed speed; linked speed material patching is not verified.`,
					semanticId,
					internalId,
				});
				continue;
			}

			const durationSeconds = snapshot.timelineDurationByElementId[internalId];
			const times = {
				targetStart: toMicroseconds({
					seconds: element.startTime,
					semanticId,
				}),
				targetDuration: toMicroseconds({
					seconds: durationSeconds ?? Number.NaN,
					semanticId,
				}),
				sourceStart: toMicroseconds({
					seconds: element.trimStart,
					semanticId,
				}),
				sourceDuration: toMicroseconds({
					seconds: (durationSeconds ?? Number.NaN) * importedSpeed,
					semanticId,
				}),
			};
			if (!times.targetStart.ok) {
				issues.push(times.targetStart.issue);
				continue;
			}
			if (!times.targetDuration.ok) {
				issues.push(times.targetDuration.issue);
				continue;
			}
			if (!times.sourceStart.ok) {
				issues.push(times.sourceStart.issue);
				continue;
			}
			if (!times.sourceDuration.ok) {
				issues.push(times.sourceDuration.issue);
				continue;
			}
			const bindingResult = findCapturedBinding({ envelope, semanticId });
			if (!bindingResult.ok) {
				issues.push(bindingResult.issue);
				continue;
			}
			const binding = bindingResult.binding;
			pushPatchIfChanged({
				basePointer: `${binding.jsonPointer}/target_timerange`,
				domain: "timing",
				expectedValue: semanticSegment.targetRange.startUs,
				file: binding.file,
				foreignRef: binding.foreignRef,
				nextValue: times.targetStart.value,
				ownerSemanticId: semanticId,
				patches,
				suffix: "start",
			});
			pushPatchIfChanged({
				basePointer: `${binding.jsonPointer}/target_timerange`,
				domain: "timing",
				expectedValue: semanticSegment.targetRange.durationUs,
				file: binding.file,
				foreignRef: binding.foreignRef,
				nextValue: times.targetDuration.value,
				ownerSemanticId: semanticId,
				patches,
				suffix: "duration",
			});
			if (semanticSegment.sourceRange !== undefined) {
				pushPatchIfChanged({
					basePointer: `${binding.jsonPointer}/source_timerange`,
					domain: "timing",
					expectedValue: semanticSegment.sourceRange.startUs,
					file: binding.file,
					foreignRef: binding.foreignRef,
					nextValue: times.sourceStart.value,
					ownerSemanticId: semanticId,
					patches,
					suffix: "start",
				});
				pushPatchIfChanged({
					basePointer: `${binding.jsonPointer}/source_timerange`,
					domain: "timing",
					expectedValue: semanticSegment.sourceRange.durationUs,
					file: binding.file,
					foreignRef: binding.foreignRef,
					nextValue: times.sourceDuration.value,
					ownerSemanticId: semanticId,
					patches,
					suffix: "duration",
				});
			}
		}
	}

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, patches, importedSegmentCount };
}
