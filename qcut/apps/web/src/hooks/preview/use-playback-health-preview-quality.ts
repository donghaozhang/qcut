import { useEffect, useRef } from "react";
import { resolveRuntimePreviewQuality } from "@/lib/preview/preview-quality";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { PreviewQualityPreset } from "@/types/playback";

const SAMPLE_SIZE = 24;
const STUTTER_INTERVAL_MS = 50;
const STABLE_INTERVAL_MS = 34;

function average({ values }: { values: number[] }): number {
	if (values.length === 0) return 0;
	let total = 0;
	for (const value of values) {
		total += value;
	}
	return total / values.length;
}

export function usePlaybackHealthPreviewQuality() {
	const isPlaying = usePlaybackStore((state) => state.isPlaying);
	const previewQuality = usePlaybackStore((state) => state.previewQuality);
	const runtimePreviewQuality = usePlaybackStore(
		(state) => state.runtimePreviewQuality
	);
	const setRuntimePreviewQuality = usePlaybackStore(
		(state) => state.setRuntimePreviewQuality
	);
	const runtimeQualityRef = useRef<PreviewQualityPreset | null>(null);

	useEffect(() => {
		runtimeQualityRef.current = runtimePreviewQuality;
	}, [runtimePreviewQuality]);

	useEffect(() => {
		if (!isPlaying || previewQuality !== "auto") {
			if (runtimeQualityRef.current) {
				setRuntimePreviewQuality(null);
			}
			return;
		}

		const intervals: number[] = [];
		let stableFrameCount = 0;
		let lastFrameTime = performance.now();

		const handlePlaybackUpdate = () => {
			const now = performance.now();
			const interval = now - lastFrameTime;
			lastFrameTime = now;
			if (!Number.isFinite(interval) || interval <= 0) return;

			intervals.push(interval);
			if (intervals.length > SAMPLE_SIZE) {
				intervals.shift();
			}

			if (interval <= STABLE_INTERVAL_MS) {
				stableFrameCount++;
			} else {
				stableFrameCount = 0;
			}

			const stutterFrameCount = intervals.filter(
				(value) => value >= STUTTER_INTERVAL_MS
			).length;
			const nextRuntimeQuality = resolveRuntimePreviewQuality({
				selectedQuality: previewQuality,
				currentRuntimeQuality: runtimeQualityRef.current,
				averageFrameIntervalMs: average({ values: intervals }),
				stutterFrameCount,
				stableFrameCount,
			});

			if (nextRuntimeQuality === runtimeQualityRef.current) return;
			runtimeQualityRef.current = nextRuntimeQuality;
			setRuntimePreviewQuality(nextRuntimeQuality);
		};

		window.addEventListener("playback-update", handlePlaybackUpdate);
		return () => {
			window.removeEventListener("playback-update", handlePlaybackUpdate);
		};
	}, [isPlaying, previewQuality, setRuntimePreviewQuality]);
}
