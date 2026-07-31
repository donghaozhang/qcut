import type {
	MediaElement,
	TimelineElement,
	TimelineTrack,
} from "../types/timeline.js";
import { buildJianyingDraft } from "./build.js";
import {
	composeCapCut81BuildResultContent,
	type CapCut81DraftContent,
	type CapCut81DraftTrack,
	validateCapCut81Content,
} from "./capcut-8-1-content.js";
import {
	type CapCut81GeneratedLutAsset,
	mapMediaElementLutToCapCut81,
} from "./capcut-8-1-lut.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import { mapMediaElementStaticMaskToCapCut81 } from "./mask-mapping.js";
import { validateCapCut81MediaMaskElement } from "./mask-validation.js";
import { secondsToMicroseconds } from "./time.js";
import { CAPCUT_NATIVE_DISSOLVE_METADATA } from "./transition-mapping.js";
import { validateJianyingTrackTransition } from "./transition-validation.js";
import type {
	JianyingDraftBuildResult,
	JianyingDraftIssue,
	JianyingDraftTargetPlatform,
	QCutDraftExportSnapshotV1,
} from "./types.js";

export interface BuildCapCut81DraftOptions {
	createdAtUnixSeconds?: number;
	draftOutputDirectory: string;
	placeholderId: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
	timelineId: string;
}

export interface CapCut81DraftBuildResult {
	assets: JianyingDraftBuildResult["assets"];
	baseBuildResult: JianyingDraftBuildResult;
	canWrite: boolean;
	content: CapCut81DraftContent | null;
	generatedAssets: CapCut81GeneratedLutAsset[];
	issues: JianyingDraftIssue[];
	projectedSnapshot: QCutDraftExportSnapshotV1;
}

interface CapCut81ElementMapping {
	element: MediaElement;
	hasLut: boolean;
	hasStaticMask: boolean;
	track: TimelineTrack;
}

interface PreparedCapCut81Snapshot {
	elementMappings: CapCut81ElementMapping[];
	issues: JianyingDraftIssue[];
	projectedSnapshot: QCutDraftExportSnapshotV1;
}

function getSourceMasks({ element }: { element: MediaElement }) {
	return element.masks && element.masks.length > 0
		? element.masks
		: element.mask
			? [element.mask]
			: [];
}

function hasEnabledLut({ element }: { element: MediaElement }): boolean {
	return Boolean(element.color?.enabled && element.color.lut.enabled);
}

function createColorMappingIssue({
	element,
	error,
	track,
}: {
	element: MediaElement;
	error: unknown;
	track: TimelineTrack;
}): JianyingDraftIssue {
	const detail = error instanceof Error ? error.message : String(error);
	return {
		code: "UNSUPPORTED_CAPCUT_8_1_COLOR",
		elementId: element.id,
		mediaId: element.mediaId,
		message: `CapCut 8.1 cannot losslessly map this color state: ${detail}`,
		severity: "error",
		trackId: track.id,
	};
}

function projectMediaElement({
	element,
	stripColor,
	stripMasks,
}: {
	element: MediaElement;
	stripColor: boolean;
	stripMasks: boolean;
}): MediaElement {
	const projected = structuredClone(element);
	return {
		...projected,
		...(stripColor ? { adjustments: undefined, color: undefined } : {}),
		...(stripMasks ? { mask: undefined, masks: undefined } : {}),
	};
}

function intervalsOverlap({
	leftDuration,
	leftStart,
	rightDuration,
	rightStart,
}: {
	leftDuration: number;
	leftStart: number;
	rightDuration: number;
	rightStart: number;
}): boolean {
	return (
		leftStart < rightStart + rightDuration &&
		rightStart < leftStart + leftDuration
	);
}

function isVisualElement({ element }: { element: TimelineElement }): boolean {
	return (
		element.type === "media" ||
		element.type === "sticker" ||
		element.type === "text" ||
		element.type === "captions"
	);
}

function hasOverlappingVisualElement({
	element,
	snapshot,
	timelineDuration,
}: {
	element: MediaElement;
	snapshot: QCutDraftExportSnapshotV1;
	timelineDuration: number;
}): boolean {
	for (const track of snapshot.tracks) {
		if (track.hidden) continue;
		for (const candidate of track.elements) {
			if (
				candidate.id === element.id ||
				candidate.hidden ||
				!isVisualElement({ element: candidate })
			) {
				continue;
			}
			const candidateDuration =
				snapshot.timelineDurationByElementId[candidate.id] ??
				candidate.duration;
			if (
				intervalsOverlap({
					leftDuration: timelineDuration,
					leftStart: element.startTime,
					rightDuration: candidateDuration,
					rightStart: candidate.startTime,
				})
			) {
				return true;
			}
		}
	}
	return false;
}

function createLutOverlapIssue({
	element,
	track,
}: {
	element: MediaElement;
	track: TimelineTrack;
}): JianyingDraftIssue {
	return {
		code: "UNSUPPORTED_CAPCUT_8_1_LUT_OVERLAP",
		elementId: element.id,
		mediaId: element.mediaId,
		message:
			"CapCut adjustment tracks affect every visual layer beneath them, so a clip-scoped QCut LUT cannot be preserved while another visual element overlaps.",
		severity: "error",
		trackId: track.id,
	};
}

function createMaskNameDowngradeIssue({
	element,
	track,
}: {
	element: MediaElement;
	track: TimelineTrack;
}): JianyingDraftIssue {
	return {
		code: "UNEXPORTED_MASK_NAME",
		elementId: element.id,
		mediaId: element.mediaId,
		message:
			"CapCut 8.1 uses the built-in Rectangle or Circle material name, so the custom QCut mask name is not preserved.",
		severity: "warning",
		trackId: track.id,
	};
}

function collectTransitionCanonicalizationIssues({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	for (const track of snapshot.tracks) {
		for (const transition of track.transitions ?? []) {
			if (
				validateJianyingTrackTransition({
					timelineDurationByElementId: snapshot.timelineDurationByElementId,
					track,
					transition,
				}).length > 0
			) {
				continue;
			}
			const sourceDuration = secondsToMicroseconds({
				seconds: transition.duration,
			});
			if (sourceDuration === CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration) {
				continue;
			}
			issues.push({
				code: "CAPCUT_8_1_TRANSITION_DURATION_CANONICALIZED",
				message: `CapCut 8.1 uses its verified ${CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration}µs native Dissolve duration instead of QCut's ${sourceDuration}µs duration.`,
				severity: "warning",
				trackId: track.id,
			});
		}
	}
	return issues;
}

function prepareCapCut81Snapshot({
	placeholderId,
	snapshot,
}: {
	placeholderId: string;
	snapshot: QCutDraftExportSnapshotV1;
}): PreparedCapCut81Snapshot {
	const issues: JianyingDraftIssue[] = [];
	const elementMappings: CapCut81ElementMapping[] = [];
	const projectedTracks = snapshot.tracks.map((track) => ({
		...structuredClone(track),
		elements: track.elements.map((timelineElement) => {
			if (timelineElement.type !== "media") {
				return structuredClone(timelineElement);
			}

			const element = timelineElement;
			const sourceMasks = getSourceMasks({ element });
			const maskIssues =
				sourceMasks.length === 0
					? []
					: validateCapCut81MediaMaskElement({ element, track });
			issues.push(...maskIssues);
			const hasStaticMask =
				sourceMasks.length > 0 &&
				maskIssues.length === 0 &&
				mapMediaElementStaticMaskToCapCut81({ element, track }) !== null;
			if (hasStaticMask && sourceMasks[0]?.name?.trim()) {
				issues.push(createMaskNameDowngradeIssue({ element, track }));
			}

			const hasLut = hasEnabledLut({ element });
			if (hasLut) {
				const timelineDuration =
					snapshot.timelineDurationByElementId[element.id];
				if (
					timelineDuration === undefined ||
					hasOverlappingVisualElement({
						element,
						snapshot,
						timelineDuration,
					})
				) {
					issues.push(createLutOverlapIssue({ element, track }));
				} else {
					try {
						mapMediaElementLutToCapCut81({
							adjustIndex: 1,
							element,
							placeholderId,
							timelineDuration,
							trackRenderIndex: 0,
						});
					} catch (error) {
						issues.push(createColorMappingIssue({ element, error, track }));
					}
				}
			}

			elementMappings.push({
				element,
				hasLut,
				hasStaticMask,
				track,
			});
			return projectMediaElement({
				element,
				stripColor: hasLut,
				stripMasks: sourceMasks.length > 0,
			});
		}),
	}));

	return {
		elementMappings,
		issues,
		projectedSnapshot: {
			...structuredClone(snapshot),
			tracks: projectedTracks,
		},
	};
}

function findSegmentForElement({
	content,
	elementId,
}: {
	content: CapCut81DraftContent;
	elementId: string;
}) {
	const segmentId = createDeterministicJianyingId({
		namespace: "segment",
		sourceId: elementId,
	});
	for (const track of content.tracks) {
		const segment = track.segments.find(({ id }) => id === segmentId);
		if (segment) return { segment, track };
	}
	throw new Error(`CapCut segment for element ${elementId} was not composed.`);
}

function applyStaticMasks({
	content,
	elementMappings,
}: {
	content: CapCut81DraftContent;
	elementMappings: CapCut81ElementMapping[];
}): void {
	for (const { element, hasStaticMask, track } of elementMappings) {
		if (!hasStaticMask) continue;
		const mapped = mapMediaElementStaticMaskToCapCut81({ element, track });
		if (!mapped) continue;
		const owner = findSegmentForElement({
			content,
			elementId: element.id,
		});
		if (owner.track.type !== "video") {
			throw new Error(`Mask owner ${element.id} is not on a video track.`);
		}
		content.materials.common_mask.push(mapped.material);
		owner.segment.extra_material_refs.push(mapped.extraMaterialRef);
	}
}

function applyCustomLuts({
	content,
	elementMappings,
	placeholderId,
	snapshot,
}: {
	content: CapCut81DraftContent;
	elementMappings: CapCut81ElementMapping[];
	placeholderId: string;
	snapshot: QCutDraftExportSnapshotV1;
}): CapCut81GeneratedLutAsset[] {
	const generatedAssets: CapCut81GeneratedLutAsset[] = [];
	let adjustIndex = 1;
	for (const { element, hasLut } of elementMappings) {
		if (!hasLut) continue;
		const timelineDuration = snapshot.timelineDurationByElementId[element.id];
		if (timelineDuration === undefined) {
			throw new Error(`Missing playback-aware duration for LUT ${element.id}.`);
		}
		const mapping = mapMediaElementLutToCapCut81({
			adjustIndex,
			element,
			placeholderId,
			timelineDuration,
			trackRenderIndex: content.tracks.length,
		});
		content.materials.effects.push(mapping.effect);
		content.materials.placeholders.push(mapping.placeholder);
		content.tracks.push(mapping.track as unknown as CapCut81DraftTrack);
		content.config.adjust_max_index = mapping.configPatch.adjust_max_index;
		generatedAssets.push(mapping.asset);
		adjustIndex += 1;
	}
	return generatedAssets;
}

export function buildCapCut81Draft({
	createdAtUnixSeconds = 0,
	draftOutputDirectory,
	placeholderId,
	snapshot,
	targetPlatform,
	timelineId,
}: BuildCapCut81DraftOptions): CapCut81DraftBuildResult {
	const prepared = prepareCapCut81Snapshot({ placeholderId, snapshot });
	const baseBuildResult = buildJianyingDraft({
		createdAtUnixSeconds,
		draftOutputDirectory,
		snapshot: prepared.projectedSnapshot,
		targetPlatform,
	});
	const issues = [
		...baseBuildResult.issues,
		...prepared.issues,
		...collectTransitionCanonicalizationIssues({ snapshot }),
	];
	if (issues.some(({ severity }) => severity === "error")) {
		return {
			assets: baseBuildResult.assets,
			baseBuildResult,
			canWrite: false,
			content: null,
			generatedAssets: [],
			issues,
			projectedSnapshot: prepared.projectedSnapshot,
		};
	}

	const content = composeCapCut81BuildResultContent({
		buildResult: baseBuildResult,
		placeholderId,
		targetPlatform,
		timelineId,
	});
	applyStaticMasks({
		content,
		elementMappings: prepared.elementMappings,
	});
	const generatedAssets = applyCustomLuts({
		content,
		elementMappings: prepared.elementMappings,
		placeholderId,
		snapshot,
	});
	validateCapCut81Content({ content });
	return {
		assets: baseBuildResult.assets,
		baseBuildResult,
		canWrite: true,
		content,
		generatedAssets,
		issues,
		projectedSnapshot: prepared.projectedSnapshot,
	};
}
