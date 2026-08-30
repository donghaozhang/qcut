import type {
	ComposePatch,
	ComposePatchOperation,
	ComposeSnapshot,
} from "./compose-protocol.js";

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

/**
 * Converts an already-validated ComposePatch into the declarative manifest
 * accepted by `editor timeline apply`. Additive operations land on dedicated
 * compose tracks; transitions target the snapshot's existing elements.
 * Operations the manifest transport cannot express yet are reported in
 * `skipped` instead of being dropped silently.
 */
export function timelineManifestFromComposePatch({
	patch,
	projectId,
	snapshot,
}: {
	patch: ComposePatch;
	projectId?: string;
	snapshot?: ComposeSnapshot;
}): ComposeTimelineManifestPlan {
	const textElements: JsonRecord[] = [];
	const captionElements: JsonRecord[] = [];
	const stickerElements: JsonRecord[] = [];
	const audioElements: JsonRecord[] = [];
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
					alias: operation.id,
					type: "captions",
					content: operation.text,
					language: operation.language,
					startTime: operation.startTime,
					duration: operation.duration,
				});
				plannedOperationIds.push(operation.id);
				break;
			case "add-text-overlay":
				textElements.push({
					alias: operation.id,
					type: "text",
					content: operation.text,
					startTime: operation.startTime,
					duration: operation.duration,
				});
				plannedOperationIds.push(operation.id);
				break;
			case "add-sticker": {
				const localPath = operation.asset.localPath;
				if (!localPath) {
					skipped.push({
						operationId: operation.id,
						kind: operation.kind,
						reason:
							"Sticker assets need a resolved localPath until the stage-3 resource resolver lands.",
					});
					break;
				}
				media.push({ alias: mediaAliasFor({ operation }), path: localPath });
				stickerElements.push({
					alias: operation.id,
					type: "sticker",
					mediaId: mediaAliasFor({ operation }),
					stickerId: operation.id,
					startTime: operation.startTime,
					duration: operation.duration,
					...stickerGeometryForEditor({ operation }),
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
					alias: operation.id,
					type: "audio",
					media: mediaAliasFor({ operation }),
					startTime: operation.startTime,
					duration: operation.duration,
					volume: operation.volume,
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
				const presetId = editorTransitionPreset({
					presetId: operation.presetId,
				});
				transitions.push({
					track: operation.trackId,
					from: operation.fromElementId,
					to: operation.toElementId,
					type: presetId,
					presetId,
					duration: operation.duration,
				});
				plannedTransitionOperationIds.push(operation.id);
				break;
			}
		}
	}

	const tracks: JsonRecord[] = [];
	if (textElements.length > 0) {
		tracks.push({
			alias: TEXT_TRACK_ALIAS,
			type: "text",
			name: "Compose Text",
			elements: textElements,
		});
	}
	if (captionElements.length > 0) {
		tracks.push({
			alias: CAPTION_TRACK_ALIAS,
			type: "captions",
			name: "Compose Captions",
			elements: captionElements,
		});
	}
	if (stickerElements.length > 0) {
		tracks.push({
			alias: STICKER_TRACK_ALIAS,
			type: "sticker",
			name: "Compose Stickers",
			elements: stickerElements,
		});
	}
	if (audioElements.length > 0) {
		tracks.push({
			alias: AUDIO_TRACK_ALIAS,
			type: "audio",
			name: "Compose Sound Effects",
			elements: audioElements,
		});
	}

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
