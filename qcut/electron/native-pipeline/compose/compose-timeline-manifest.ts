import type {
	ComposePatch,
	ComposePatchOperation,
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
const OVERLAY_TRACK_ALIAS = "compose-overlay";
const AUDIO_TRACK_ALIAS = "compose-audio";

function mediaAliasFor({
	operation,
}: {
	operation: ComposePatchOperation;
}): string {
	return `media:${operation.id}`;
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
}: {
	patch: ComposePatch;
	projectId?: string;
}): ComposeTimelineManifestPlan {
	const textElements: JsonRecord[] = [];
	const overlayElements: JsonRecord[] = [];
	const audioElements: JsonRecord[] = [];
	const media: JsonRecord[] = [];
	const transitions: JsonRecord[] = [];
	const plannedOperationIds: string[] = [];
	const plannedTransitionOperationIds: string[] = [];
	const skipped: ComposeSkippedOperation[] = [];

	for (const operation of patch.operations) {
		switch (operation.kind) {
			case "add-caption":
				textElements.push({
					alias: operation.id,
					type: "text",
					content: operation.text,
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
				overlayElements.push({
					alias: operation.id,
					type: "media",
					media: mediaAliasFor({ operation }),
					startTime: operation.startTime,
					duration: operation.duration,
					...(operation.x !== undefined ? { x: operation.x } : {}),
					...(operation.y !== undefined ? { y: operation.y } : {}),
					...(operation.width !== undefined ? { width: operation.width } : {}),
					...(operation.height !== undefined
						? { height: operation.height }
						: {}),
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
			case "update-media-zoom":
				skipped.push({
					operationId: operation.id,
					kind: operation.kind,
					reason:
						"Media zoom updates existing elements, which the timeline manifest transport cannot express yet.",
				});
				break;
			case "upsert-transition":
				transitions.push({
					track: operation.trackId,
					from: operation.fromElementId,
					to: operation.toElementId,
					type: operation.presetId,
					presetId: operation.presetId,
					duration: operation.duration,
				});
				plannedTransitionOperationIds.push(operation.id);
				break;
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
	if (overlayElements.length > 0) {
		tracks.push({
			alias: OVERLAY_TRACK_ALIAS,
			type: "media",
			name: "Compose Stickers",
			elements: overlayElements,
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
			...(transitions.length > 0 ? { transitions } : {}),
		},
		plannedOperationIds,
		plannedTransitionOperationIds,
		skipped,
	};
}
