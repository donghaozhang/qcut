import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import type { JianyingTransitionPreviewResult } from "@/types/electron";
import {
	resolveJianyingTimelinePreviewCandidate,
	type JianyingTimelinePreviewCandidate,
} from "@/lib/transitions/jianying-timeline-preview";

export type JianyingTimelineTransitionPreviewState =
	| { status: "idle"; candidate: null }
	| { status: "loading"; candidate: JianyingTimelinePreviewCandidate }
	| {
			status: "ready";
			candidate: JianyingTimelinePreviewCandidate;
			result: JianyingTransitionPreviewResult;
	  }
	| { status: "error"; candidate: JianyingTimelinePreviewCandidate };

const resolvedPreviews = new Map<string, JianyingTransitionPreviewResult>();
const pendingPreviews = new Map<
	string,
	Promise<JianyingTransitionPreviewResult>
>();

function resolveMediaPath({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): string | null {
	try {
		const nativePath = window.electronAPI?.getPathForFile?.(mediaItem.file);
		if (nativePath) return nativePath;
	} catch {
		return mediaItem.localPath ?? null;
	}
	return mediaItem.localPath ?? null;
}

function requestTimelinePreview({
	candidate,
}: {
	candidate: JianyingTimelinePreviewCandidate;
}): Promise<JianyingTransitionPreviewResult> {
	const resolved = resolvedPreviews.get(candidate.cacheKey);
	if (resolved) return Promise.resolve(resolved);
	const pending = pendingPreviews.get(candidate.cacheKey);
	if (pending) return pending;
	const api = window.electronAPI?.jianyingTransitions;
	if (!api) return Promise.reject(new Error("Desktop runtime unavailable"));
	const request = api.timelinePreview(candidate.request).then((result) => {
		if (result.packageHash !== candidate.request.packageHash) {
			throw new Error("Local transition package changed");
		}
		resolvedPreviews.set(candidate.cacheKey, result);
		return result;
	});
	pendingPreviews.set(candidate.cacheKey, request);
	void request.then(
		() => pendingPreviews.delete(candidate.cacheKey),
		() => pendingPreviews.delete(candidate.cacheKey)
	);
	return request;
}

export function useJianyingTimelineTransitionPreview({
	tracks,
	mediaItems,
	currentTime,
	fps,
	canvasSize,
	enabled,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	currentTime: number;
	fps: number;
	canvasSize: { width: number; height: number };
	enabled: boolean;
}): JianyingTimelineTransitionPreviewState {
	const candidate = useMemo(
		() =>
			enabled
				? resolveJianyingTimelinePreviewCandidate({
						tracks,
						mediaItems,
						currentTime,
						fps,
						canvasSize,
						resolveMediaPath,
					})
				: null,
		[canvasSize, currentTime, enabled, fps, mediaItems, tracks]
	);
	const [state, setState] = useState<JianyingTimelineTransitionPreviewState>({
		status: "idle",
		candidate: null,
	});
	const candidateRef = useRef(candidate);
	candidateRef.current = candidate;
	const candidateCacheKey = candidate?.cacheKey ?? null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: request identity stays stable while playback time advances
	useEffect(() => {
		const requestedCandidate = candidateRef.current;
		if (!requestedCandidate) {
			setState({ status: "idle", candidate: null });
			return;
		}
		const resolved = resolvedPreviews.get(requestedCandidate.cacheKey);
		if (resolved) {
			setState({
				status: "ready",
				candidate: requestedCandidate,
				result: resolved,
			});
			return;
		}
		let active = true;
		setState({ status: "loading", candidate: requestedCandidate });
		void requestTimelinePreview({ candidate: requestedCandidate }).then(
			(result) => {
				if (active) {
					setState({ status: "ready", candidate: requestedCandidate, result });
				}
			},
			() => {
				if (active) {
					setState({ status: "error", candidate: requestedCandidate });
				}
			}
		);
		return () => {
			active = false;
		};
	}, [candidateCacheKey]);

	return state;
}

export function clearJianyingTimelinePreviewMemoryCacheForTest(): void {
	resolvedPreviews.clear();
	pendingPreviews.clear();
}
