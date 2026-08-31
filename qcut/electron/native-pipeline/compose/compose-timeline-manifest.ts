import type {
	ComposePatch,
	ComposePatchOperation,
	ComposeSnapshot,
} from "./compose-protocol.js";
import type { ComposeEditorAssetBindings } from "./compose-editor-asset-preparer.js";

type JsonRecord = Record<string, unknown>;

export interface ComposeSkippedOperation {
	operationId: string;
	kind: ComposePatchOperation["kind"];
	reason: string;
}

export interface ComposeTimelineManifestPlan {
	manifest: JsonRecord;
	/** Operation ids that became manifest elements, keyed for read-back. */
	plannedOperationIds: string[];
	/** Operation ids that became manifest transitions. */
	plannedTransitionOperationIds: string[];
	skipped: ComposeSkippedOperation[];
}

const TEXT_TRACK_ALIAS = "compose-text";
const CAPTION_TRACK_ALIAS = "compose-captions";
const STICKER_TRACK_ALIAS = "compose-stickers";
const AUDIO_TRACK_ALIAS = "compose-audio";

/** A manifest element together with the timeline span it will occupy. */
interface LanedElement {
	element: JsonRecord;
	start: number;
	end: number;
}

/**
 * Partitions elements into non-overlapping lanes and emits one track per
 * lane. QCut tracks refuse overlapping elements, but overlapping compose
 * operations (layered sound effects, simultaneous stickers) are legitimate —
 * they belong on parallel tracks, the way an editor would lay them out.
 */
function lanedComposeTracks({
	alias,
	type,
	name,
	entries,
}: {
	alias: string;
	type: string;
	name: string;
	entries: LanedElement[];
}): JsonRecord[] {
	const sorted = [...entries].sort(
		(left, right) => left.start - right.start || left.end - right.end
	);
	const lanes: Array<{ end: number; elements: JsonRecord[] }> = [];
	for (const entry of sorted) {
		const lane = lanes.find((candidate) => candidate.end <= entry.start);
		if (lane) {
			lane.end = entry.end;
			lane.elements.push(entry.element);
		} else {
			lanes.push({ end: entry.end, elements: [entry.element] });
		}
	}
	return lanes.map((lane, index) => ({
		alias: index === 0 ? alias : `${alias}-${index + 1}`,
		type,
		name: index === 0 ? name : `${name} ${index + 1}`,
		elements: lane.elements,
	}));
}

function editorTransitionPreset({ presetId }: { presetId: string }): string {
	return presetId === "crossfade" ? "dissolve" : presetId;
}

function zoomFrameRange({
	operation,
	snapshot,
}: {
	operation: Extract<ComposePatchOperation, { kind: "update-media-zoom" }>;
	snapshot?: ComposeSnapshot;
}): { startFrame: number; endFrame: number } {
	const fps = snapshot?.project.fps ?? 30;
	const targetStart =
		snapshot?.media.find(
			(media) =>
				media.trackId === operation.trackId &&
				media.elementId === operation.elementId
		)?.startTime ?? operation.startTime;
	const startFrame = Math.max(
		0,
		Math.round((operation.startTime - targetStart) * fps)
	);
	return {
		startFrame,
		endFrame: Math.max(
			startFrame + 1,
			Math.round((operation.startTime + operation.duration - targetStart) * fps)
		),
	};
}

function mediaAliasFor({
	operation,
}: {
	operation: ComposePatchOperation;
}): string {
	return `media:${operation.id}`;
}

function stickerGeometryForEditor({
	operation,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sticker" }>;
}): JsonRecord {
	const geometry = {
		...(operation.x !== undefined ? { x: operation.x * 100 } : {}),
		...(operation.y !== undefined ? { y: operation.y * 100 } : {}),
		...(operation.width !== undefined ? { width: operation.width * 100 } : {}),
		...(operation.height !== undefined
			? { height: operation.height * 100 }
			: {}),
	};
	return Object.keys(geometry).length > 0
		? { ...geometry, stickerGeometrySpace: "canvas-percent" }
		: {};
}

function stickerAnimationFields({
	operation,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sticker" }>;
}): JsonRecord {
	const animationInTypes = {
		none: "none",
		fade: "fade",
		slide: "slide-up",
		scale: "zoom-in",
		bounce: "zoom-in",
	} as const;
	const animationOutTypes = {
		none: "none",
		fade: "fade",
		slide: "slide-down",
		scale: "zoom-out",
	} as const;
	const animationLoopTypes = {
		none: "none",
		pulse: "pulse",
		float: "drift",
		spin: "spin",
		bounce: "bounce",
	} as const;
	return {
		...(operation.animationInType
			? { animationInType: animationInTypes[operation.animationInType] }
			: {}),
		...(operation.animationInDuration !== undefined
			? { animationInDuration: operation.animationInDuration }
			: {}),
		...(operation.animationOutType
			? { animationOutType: animationOutTypes[operation.animationOutType] }
			: {}),
		...(operation.animationOutDuration !== undefined
			? { animationOutDuration: operation.animationOutDuration }
			: {}),
		...(operation.animationLoopType
			? { animationLoopType: animationLoopTypes[operation.animationLoopType] }
			: {}),
		...(operation.animationLoopIntensity !== undefined
			? { animationLoopIntensity: operation.animationLoopIntensity }
			: {}),
	};
}

function soundSourceDuration({
	operation,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sound-effect" }>;
}): number {
	return (
		(operation.trimStart ?? 0) +
		(operation.trimEnd ?? 0) +
		operation.duration * (operation.playbackRate ?? 1)
	);
}

/**
 * Converts an already-validated ComposePatch into the declarative manifest
 * accepted by `editor timeline apply`. Additive operations land on dedicated
 * compose tracks; transitions target the snapshot's existing elements.
 * Each additive element carries its operation id as the requested element id,
 * so a replayed patch can recognize already-applied operations on the live
 * timeline instead of duplicating them. Operations the manifest transport
 * cannot express yet are reported in `skipped` instead of being dropped
 * silently.
 */
export function timelineManifestFromComposePatch({
	patch,
	projectId,
	snapshot,
	bindings = {},
}: {
	patch: ComposePatch;
	projectId?: string;
	snapshot?: ComposeSnapshot;
	bindings?: ComposeEditorAssetBindings;
}): ComposeTimelineManifestPlan {
	const textElements: LanedElement[] = [];
	const captionElements: LanedElement[] = [];
	const stickerElements: LanedElement[] = [];
	const audioElements: LanedElement[] = [];
	const media: JsonRecord[] = [];
	const updates: JsonRecord[] = [];
	const transitions: JsonRecord[] = [];
	const plannedOperationIds: string[] = [];
	const plannedTransitionOperationIds: string[] = [];
	const skipped: ComposeSkippedOperation[] = [];

	for (const operation of patch.operations) {
		switch (operation.kind) {
			case "add-caption":
				captionElements.push({
					start: operation.startTime,
					end: operation.startTime + operation.duration,
					element: {
						alias: operation.id,
						id: operation.id,
						type: "captions",
						content: operation.text,
						language: operation.language,
						startTime: operation.startTime,
						duration: operation.duration,
					},
				});
				plannedOperationIds.push(operation.id);
				break;
			case "add-text-overlay":
				textElements.push({
					start: operation.startTime,
					end: operation.startTime + operation.duration,
					element: {
						alias: operation.id,
						id: operation.id,
						type: "text",
						content: operation.text,
						startTime: operation.startTime,
						duration: operation.duration,
					},
				});
				plannedOperationIds.push(operation.id);
				break;
			case "add-sticker": {
				const binding = bindings[operation.id]?.sticker;
				const localPath = operation.asset.localPath;
				if (!(binding || localPath)) {
					skipped.push({
						operationId: operation.id,
						kind: operation.kind,
						reason:
							"Sticker assets need an imported Sticker Lab binding or a resolved localPath.",
					});
					break;
				}
				if (localPath && !binding) {
					media.push({ alias: mediaAliasFor({ operation }), path: localPath });
				}
				stickerElements.push({
					start: operation.startTime,
					end: operation.startTime + operation.duration,
					element: {
						alias: operation.id,
						id: operation.id,
						type: "sticker",
						mediaId: binding?.mediaId ?? mediaAliasFor({ operation }),
						stickerAssetId: binding?.stickerAssetId ?? operation.asset.assetId,
						stickerId: operation.id,
						startTime: operation.startTime,
						duration: operation.duration,
						...(binding?.stickerRuntime
							? { stickerRuntime: binding.stickerRuntime }
							: {}),
						...stickerGeometryForEditor({ operation }),
						...(operation.rotation !== undefined
							? { rotation: operation.rotation }
							: {}),
						...(operation.opacity !== undefined
							? { opacity: operation.opacity }
							: {}),
						...(operation.maintainAspectRatio !== undefined
							? { maintainAspectRatio: operation.maintainAspectRatio }
							: {}),
						...stickerAnimationFields({ operation }),
					},
				});
				plannedOperationIds.push(operation.id);
				break;
			}
			case "add-sound-effect": {
				const localPath = operation.asset.localPath;
				if (!localPath) {
					skipped.push({
						operationId: operation.id,
						kind: operation.kind,
						reason:
							"Sound-effect assets need a resolved localPath until the stage-3 resource resolver lands.",
					});
					break;
				}
				media.push({ alias: mediaAliasFor({ operation }), path: localPath });
				audioElements.push({
					start: operation.startTime,
					end: operation.startTime + operation.duration,
					element: {
						alias: operation.id,
						id: operation.id,
						type: "audio",
						media: mediaAliasFor({ operation }),
						startTime: operation.startTime,
						duration: soundSourceDuration({ operation }),
						volume: operation.volume,
						trimStart: operation.trimStart ?? 0,
						trimEnd: operation.trimEnd ?? 0,
						...(operation.fadeIn !== undefined
							? { audioFadeIn: operation.fadeIn }
							: {}),
						...(operation.fadeOut !== undefined
							? { audioFadeOut: operation.fadeOut }
							: {}),
						...(operation.playbackRate !== undefined
							? { playbackRate: operation.playbackRate }
							: {}),
					},
				});
				plannedOperationIds.push(operation.id);
				break;
			}
			case "update-media-zoom": {
				const { startFrame, endFrame } = zoomFrameRange({
					operation,
					snapshot,
				});
				updates.push({
					alias: operation.id,
					elementId: operation.elementId,
					trackId: operation.trackId,
					keyframes: {
						scaleX: [
							{
								id: `${operation.id}:scale-x:start`,
								frame: startFrame,
								value: operation.fromScale,
								easing: "easeInOut",
							},
							{
								id: `${operation.id}:scale-x:end`,
								frame: endFrame,
								value: operation.toScale,
								easing: "easeInOut",
							},
						],
						scaleY: [
							{
								id: `${operation.id}:scale-y:start`,
								frame: startFrame,
								value: operation.fromScale,
								easing: "easeInOut",
							},
							{
								id: `${operation.id}:scale-y:end`,
								frame: endFrame,
								value: operation.toScale,
								easing: "easeInOut",
							},
						],
					},
				});
				plannedOperationIds.push(operation.id);
				break;
			}
			case "upsert-transition": {
				const binding = bindings[operation.id]?.transition;
				const presetId = editorTransitionPreset({
					presetId: binding?.presetId ?? operation.presetId,
				});
				transitions.push({
					track: operation.trackId,
					from: operation.fromElementId,
					to: operation.toElementId,
					type: binding?.type ?? presetId,
					presetId,
					duration: operation.duration,
					...(binding
						? {
								engine: binding.engine,
								easing: binding.easing,
								...(binding.packageHash
									? { packageHash: binding.packageHash }
									: {}),
								...(binding.direction ? { direction: binding.direction } : {}),
								...(binding.tuning ? { tuning: binding.tuning } : {}),
								...(binding.maskShape ? { maskShape: binding.maskShape } : {}),
							}
						: {}),
				});
				plannedTransitionOperationIds.push(operation.id);
				break;
			}
		}
	}

	const tracks: JsonRecord[] = [
		...lanedComposeTracks({
			alias: TEXT_TRACK_ALIAS,
			type: "text",
			name: "Compose Text",
			entries: textElements,
		}),
		...lanedComposeTracks({
			alias: CAPTION_TRACK_ALIAS,
			type: "captions",
			name: "Compose Captions",
			entries: captionElements,
		}),
		...lanedComposeTracks({
			alias: STICKER_TRACK_ALIAS,
			type: "sticker",
			name: "Compose Stickers",
			entries: stickerElements,
		}),
		...lanedComposeTracks({
			alias: AUDIO_TRACK_ALIAS,
			type: "audio",
			name: "Compose Sound Effects",
			entries: audioElements,
		}),
	];

	return {
		manifest: {
			...(projectId ? { projectId } : {}),
			...(media.length > 0 ? { media } : {}),
			tracks,
			...(updates.length > 0 ? { updates } : {}),
			...(transitions.length > 0 ? { transitions } : {}),
		},
		plannedOperationIds,
		plannedTransitionOperationIds,
		skipped,
	};
}
