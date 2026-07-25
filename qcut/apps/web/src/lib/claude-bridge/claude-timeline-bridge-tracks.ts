import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMediaStore } from "@/stores/media/media-store";
import type { ClipTransition, TrackType } from "@/types/timeline";
import type {
	ClaudeTrackOperationRequest,
	ClaudeTrackOperationResponse,
} from "../../../../../electron/types/claude-api";
import { debugError } from "@/lib/debug/debug-config";
import type { ClaudeTimelineBridgeAPI } from "./claude-timeline-bridge";

const TRACK_TYPES = new Set<TrackType>([
	"media",
	"effect",
	"text",
	"audio",
	"sticker",
	"captions",
	"adjustment",
	"remotion",
	"hyperframes",
	"markdown",
]);

function summarizeTracks(): ClaudeTrackOperationResponse["tracks"] {
	return useTimelineStore.getState().tracks.map((track, index) => ({
		id: track.id,
		index,
		type: track.type,
		name: track.name,
		elementCount: track.elements.length,
		isMain: track.isMain,
	}));
}

function applyTrackOperation(
	request: ClaudeTrackOperationRequest
): ClaudeTrackOperationResponse {
	const store = useTimelineStore.getState();

	if (request.action === "create") {
		if (!request.type || !TRACK_TYPES.has(request.type)) {
			throw new Error(`Unsupported track type: ${request.type || "missing"}`);
		}
		if (
			request.index !== undefined &&
			(!Number.isInteger(request.index) || request.index < 0)
		) {
			throw new Error("Track index must be a non-negative integer");
		}

		const trackId =
			request.index === undefined
				? store.addTrack(request.type)
				: store.insertTrackAt(request.type, request.index);
		if (request.name?.trim()) store.renameTrack(trackId, request.name);
		const tracks = summarizeTracks();
		return {
			success: true,
			trackId,
			index: tracks.findIndex((track) => track.id === trackId),
			tracks,
		};
	}

	if (!request.trackId) {
		throw new Error("trackId is required");
	}

	const currentIndex = store.tracks.findIndex(
		(track) => track.id === request.trackId
	);
	if (currentIndex < 0) {
		throw new Error(`Track not found: ${request.trackId}`);
	}

	if (request.action === "move" || request.action === "update") {
		if (
			request.action === "update" &&
			request.index === undefined &&
			!request.name?.trim()
		) {
			throw new Error("Track update needs index or name");
		}
		if (
			request.index !== undefined &&
			(!Number.isInteger(request.index) ||
				request.index < 0 ||
				request.index >= store.tracks.length)
		) {
			throw new Error(
				`Track index must be between 0 and ${Math.max(0, store.tracks.length - 1)}`
			);
		}
		if (request.index !== undefined)
			store.moveTrack(request.trackId, request.index);
		if (request.name?.trim()) store.renameTrack(request.trackId, request.name);
		const tracks = summarizeTracks();
		const index = tracks.findIndex((track) => track.id === request.trackId);
		if (request.index !== undefined && index !== request.index) {
			throw new Error(
				`Track move verification failed: expected ${request.index}, got ${index}`
			);
		}
		if (request.name?.trim() && tracks[index]?.name !== request.name.trim()) {
			throw new Error("Track rename verification failed");
		}
		return { success: true, trackId: request.trackId, index, tracks };
	}

	if (request.action === "add-transition") {
		const transition = request.transition;
		if (!transition) throw new Error("transition is required");
		const videoMediaIds = new Set(
			useMediaStore
				.getState()
				.mediaItems.filter((item) => item.type === "video")
				.map((item) => item.id)
		);
		const transitionId = store.addTransition({
			trackId: request.trackId,
			fromElementId: transition.fromElementId,
			toElementId: transition.toElementId,
			videoMediaIds,
			presetId: transition.presetId,
			type: transition.type as ClipTransition["type"],
			duration: transition.duration,
			direction: transition.direction,
			easing: transition.easing,
			tuning: transition.tuning as ClipTransition["tuning"],
			maskShape: transition.maskShape as ClipTransition["maskShape"],
		});
		if (!transitionId) {
			throw new Error(
				"Transition could not be added; clips must be adjacent video elements on the same media track"
			);
		}
		return {
			success: true,
			trackId: request.trackId,
			transitionId,
			tracks: summarizeTracks(),
		};
	}

	const track = store.tracks[currentIndex];
	if (track.elements.length > 0 && !request.force) {
		throw new Error(
			`Track ${request.trackId} contains ${track.elements.length} element(s); use --force to delete it`
		);
	}
	if (request.ripple) {
		store.removeTrackWithRipple(request.trackId);
	} else {
		store.removeTrack(request.trackId);
	}
	const tracks = summarizeTracks();
	if (tracks.some((candidate) => candidate.id === request.trackId)) {
		throw new Error(`Track delete verification failed: ${request.trackId}`);
	}
	return { success: true, trackId: request.trackId, tracks };
}

export function setupTrackHandlers({
	claudeAPI,
}: {
	claudeAPI: ClaudeTimelineBridgeAPI;
}): void {
	if (
		typeof claudeAPI.onTrackOperation !== "function" ||
		typeof claudeAPI.sendTrackOperationResponse !== "function"
	) {
		return;
	}

	claudeAPI.onTrackOperation((data) => {
		try {
			const request = data.request as ClaudeTrackOperationRequest;
			claudeAPI.sendTrackOperationResponse(
				data.requestId,
				applyTrackOperation(request)
			);
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Track operation failed:", error);
			claudeAPI.sendTrackOperationResponse(data.requestId, {
				success: false,
				tracks: summarizeTracks(),
				error:
					error instanceof Error ? error.message : "Track operation failed",
			});
		}
	});
}
