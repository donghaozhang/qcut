import { useEffect, useState } from "react";
import type { JianyingTransitionPreviewResult } from "@/types/electron";

export type JianyingTransitionPreviewState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; result: JianyingTransitionPreviewResult }
	| { status: "error" };

const resolvedPreviews = new Map<string, JianyingTransitionPreviewResult>();
const pendingPreviews = new Map<
	string,
	Promise<JianyingTransitionPreviewResult>
>();

function requestPreview({
	presetId,
	packageHash,
}: {
	presetId: string;
	packageHash: string;
}): Promise<JianyingTransitionPreviewResult> {
	const cacheKey = `${presetId}:${packageHash}`;
	const resolved = resolvedPreviews.get(cacheKey);
	if (resolved) return Promise.resolve(resolved);
	const pending = pendingPreviews.get(cacheKey);
	if (pending) return pending;
	const api = window.electronAPI?.jianyingTransitions;
	if (!api) return Promise.reject(new Error("Desktop runtime unavailable"));
	const request = api.preview({ presetId }).then((result) => {
		if (result.packageHash !== packageHash) {
			throw new Error("Local transition package changed");
		}
		resolvedPreviews.set(cacheKey, result);
		return result;
	});
	pendingPreviews.set(cacheKey, request);
	void request.then(
		() => pendingPreviews.delete(cacheKey),
		() => pendingPreviews.delete(cacheKey)
	);
	return request;
}

export function useJianyingTransitionPreview({
	presetId,
	packageHash,
	enabled,
}: {
	presetId: string;
	packageHash: string;
	enabled: boolean;
}): JianyingTransitionPreviewState {
	const cacheKey = `${presetId}:${packageHash}`;
	const [state, setState] = useState<JianyingTransitionPreviewState>(() => {
		const resolved = resolvedPreviews.get(cacheKey);
		return resolved
			? { status: "ready", result: resolved }
			: { status: "idle" };
	});

	useEffect(() => {
		if (!enabled) return;
		const resolved = resolvedPreviews.get(cacheKey);
		if (resolved) {
			setState({ status: "ready", result: resolved });
			return;
		}
		let active = true;
		setState({ status: "loading" });
		void requestPreview({ presetId, packageHash }).then(
			(result) => {
				if (active) setState({ status: "ready", result });
			},
			() => {
				if (active) setState({ status: "error" });
			}
		);
		return () => {
			active = false;
		};
	}, [cacheKey, enabled, packageHash, presetId]);

	return state;
}

export function clearJianyingTransitionPreviewMemoryCacheForTest(): void {
	resolvedPreviews.clear();
	pendingPreviews.clear();
}
