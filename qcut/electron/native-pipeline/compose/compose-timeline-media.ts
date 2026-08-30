/**
 * Plans `insert-media-clip` compose operations into the timeline-apply
 * manifest vocabulary: one `media[]` import entry per clip plus media track
 * elements. Main-video clips share a single track (adjacency is what QCut
 * transitions bridge); overlay clips lane-partition like other overlays.
 *
 * A clip only becomes an element when its file path is known — either the
 * asset preparer bound one (`bindings[id].mediaClip`) or the asset reference
 * carries `localPath`. Anything else is reported in `skipped`, never dropped.
 */

import type { ComposeEditorAssetBindings } from "./compose-editor-asset-preparer.js";
import type {
	ComposeInsertMediaClipOperation,
	ComposePatchOperation,
} from "./compose-protocol.js";
import {
	lanedComposeTracks,
	type LanedElement,
} from "./compose-timeline-lanes.js";
import type { ComposeSkippedOperation } from "./compose-timeline-manifest.js";

type JsonRecord = Record<string, unknown>;

export const MAIN_VIDEO_TRACK_ALIAS = "main-video";
const OVERLAY_VIDEO_TRACK_ALIAS = "compose-overlay-video";

export interface ComposeMediaClipPlan {
	media: JsonRecord[];
	tracks: JsonRecord[];
	plannedOperationIds: string[];
	skipped: ComposeSkippedOperation[];
}

function mediaClipPath({
	operation,
	bindings,
}: {
	operation: ComposeInsertMediaClipOperation;
	bindings: ComposeEditorAssetBindings;
}): { path: string; filename?: string } | undefined {
	const bound = bindings[operation.id]?.mediaClip;
	if (bound) return bound;
	if (operation.asset.localPath) {
		return { path: operation.asset.localPath };
	}
	return;
}

function mediaClipElement({
	operation,
	mediaAlias,
}: {
	operation: ComposeInsertMediaClipOperation;
	mediaAlias: string;
}): JsonRecord {
	return {
		alias: operation.id,
		id: operation.id,
		type: "media",
		media: mediaAlias,
		startTime: operation.startTime,
		// QCut media elements carry the SOURCE duration; the visible timeline
		// length is duration − trims (÷ playbackRate), matching the audio lane.
		duration: operation.sourceDuration,
		trimStart: operation.trimStart,
		trimEnd: operation.trimEnd,
		...(operation.volume !== undefined ? { volume: operation.volume } : {}),
		...(operation.playbackRate !== undefined
			? { playbackRate: operation.playbackRate }
			: {}),
	};
}

export function planComposeMediaClips({
	operations,
	bindings,
	mainVideoTrackId,
}: {
	operations: readonly ComposePatchOperation[];
	bindings: ComposeEditorAssetBindings;
	/** Existing main track to reuse; omitted creates a fresh media track. */
	mainVideoTrackId?: string;
}): ComposeMediaClipPlan {
	const media: JsonRecord[] = [];
	const mainElements: JsonRecord[] = [];
	const overlayElements: LanedElement[] = [];
	const plannedOperationIds: string[] = [];
	const skipped: ComposeSkippedOperation[] = [];

	for (const operation of operations) {
		if (operation.kind !== "insert-media-clip") continue;
		const source = mediaClipPath({ operation, bindings });
		if (!source) {
			skipped.push({
				operationId: operation.id,
				kind: operation.kind,
				reason: "No local media path was bound for this clip.",
			});
			continue;
		}
		const mediaAlias = `media:${operation.id}`;
		media.push({
			alias: mediaAlias,
			path: source.path,
			...(source.filename ? { filename: source.filename } : {}),
		});
		const element = mediaClipElement({ operation, mediaAlias });
		if (operation.trackRole === "main-video") {
			mainElements.push(element);
		} else {
			overlayElements.push({
				element,
				start: operation.startTime,
				end: operation.startTime + operation.duration,
			});
		}
		plannedOperationIds.push(operation.id);
	}

	const tracks: JsonRecord[] = [];
	if (mainElements.length > 0) {
		mainElements.sort(
			(left, right) => (left.startTime as number) - (right.startTime as number)
		);
		tracks.push({
			alias: MAIN_VIDEO_TRACK_ALIAS,
			type: "media",
			name: "Compose Main Video",
			...(mainVideoTrackId ? { trackId: mainVideoTrackId } : {}),
			elements: mainElements,
		});
	}
	tracks.push(
		...lanedComposeTracks({
			alias: OVERLAY_VIDEO_TRACK_ALIAS,
			type: "media",
			name: "Compose Overlay Video",
			entries: overlayElements,
		})
	);

	return { media, tracks, plannedOperationIds, skipped };
}
