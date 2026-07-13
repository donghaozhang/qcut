import { useEffect, useState } from "react";
import type { TransitionPreviewSources } from "./transition-preview";
import {
	analyzeTransitionThumbnail,
	buildTransitionVisualSignals,
	type TransitionFrameMetrics,
	type TransitionVisualSignals,
} from "./transition-content-analysis";

const MAX_CACHED_THUMBNAILS = 64;
const thumbnailMetricsCache = new Map<
	string,
	Promise<TransitionFrameMetrics>
>();

function cachedThumbnailMetrics({
	source,
}: {
	source: string;
}): Promise<TransitionFrameMetrics> {
	const cached = thumbnailMetricsCache.get(source);
	if (cached) return cached;
	if (thumbnailMetricsCache.size >= MAX_CACHED_THUMBNAILS) {
		const oldestSource = thumbnailMetricsCache.keys().next().value;
		if (oldestSource) thumbnailMetricsCache.delete(oldestSource);
	}
	const pending = analyzeTransitionThumbnail({ source }).catch((error) => {
		thumbnailMetricsCache.delete(source);
		throw error;
	});
	thumbnailMetricsCache.set(source, pending);
	return pending;
}

export function useTransitionContentAnalysis({
	sources,
}: {
	sources?: TransitionPreviewSources;
}): TransitionVisualSignals | undefined {
	const [signals, setSignals] = useState<TransitionVisualSignals>();
	const fromSource = sources?.from;
	const toSource = sources?.to;

	useEffect(() => {
		let active = true;
		if (!fromSource || !toSource) {
			setSignals(undefined);
			return () => {
				active = false;
			};
		}

		Promise.all([
			cachedThumbnailMetrics({ source: fromSource }),
			cachedThumbnailMetrics({ source: toSource }),
		])
			.then(([from, to]) => {
				if (active) setSignals(buildTransitionVisualSignals({ from, to }));
			})
			.catch(() => {
				if (active) setSignals(undefined);
			});
		return () => {
			active = false;
		};
	}, [fromSource, toSource]);

	return signals;
}
