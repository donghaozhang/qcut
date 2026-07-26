import { useEffect, useRef } from "react";
import { resolveRuntimePreviewQualityDecision } from "@/lib/preview/preview-quality";
import {
	isQcutVideoFrameEvent,
	QCUT_VIDEO_FRAME_EVENT,
} from "@/lib/preview/preview-health-events";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { PreviewQualityPreset } from "@/types/playback";

const SAMPLE_SIZE = 24;
const STUTTER_INTERVAL_MS = 50;
const PRESENTED_FRAME_STALL_INTERVAL_MS = 80;
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
	const runtimePreviewQualityDiagnostic = usePlaybackStore(
		(state) => state.runtimePreviewQualityDiagnostic
	);
	const setRuntimePreviewQuality = usePlaybackStore(
		(state) => state.setRuntimePreviewQuality
	);
	const runtimeQualityRef = useRef<PreviewQualityPreset | null>(null);
	const runtimeDiagnosticReasonRef = useRef(
		runtimePreviewQualityDiagnostic?.reason ?? null
	);

	useEffect(() => {
		runtimeQualityRef.current = runtimePreviewQuality;
	}, [runtimePreviewQuality]);

	useEffect(() => {
		runtimeDiagnosticReasonRef.current =
			runtimePreviewQualityDiagnostic?.reason ?? null;
	}, [runtimePreviewQualityDiagnostic]);

	useEffect(() => {
		if (!isPlaying || previewQuality !== "auto") {
			if (
				runtimeQualityRef.current ||
				runtimeDiagnosticReasonRef.current !== null
			) {
				setRuntimePreviewQuality({ quality: null });
			}
			return;
		}

		const intervals: number[] = [];
		const presentedFrameIntervals: number[] = [];
		let stableFrameCount = 0;
		let lastFrameTime = performance.now();

		const applyRuntimeQuality = () => {
			const stutterFrameCount = intervals.filter(
				(value) => value >= STUTTER_INTERVAL_MS
			).length;
			const presentedFrameStallCount = presentedFrameIntervals.filter(
				(value) => value >= PRESENTED_FRAME_STALL_INTERVAL_MS
			).length;
			const decision = resolveRuntimePreviewQualityDecision({
				selectedQuality: previewQuality,
				currentRuntimeQuality: runtimeQualityRef.current,
				averageFrameIntervalMs: average({ values: intervals }),
				stutterFrameCount,
				stableFrameCount,
				averagePresentedFrameIntervalMs: average({
					values: presentedFrameIntervals,
				}),
				presentedFrameStallCount,
			});

			const nextDiagnosticReason = decision.diagnostic?.reason ?? null;
			const qualityChanged = decision.quality !== runtimeQualityRef.current;
			const reasonChanged =
				decision.diagnostic !== null &&
				nextDiagnosticReason !== runtimeDiagnosticReasonRef.current;
			if (!qualityChanged && !reasonChanged) return;

			runtimeQualityRef.current = decision.quality;
			runtimeDiagnosticReasonRef.current = nextDiagnosticReason;
			setRuntimePreviewQuality({
				quality: decision.quality,
				diagnostic: decision.diagnostic,
			});
		};

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

			applyRuntimeQuality();
		};

		const handleVideoFrame = (event: Event) => {
			if (!isQcutVideoFrameEvent(event)) return;
			if (!event.detail.isActivePlaybackFrame) return;
			const interval = event.detail.intervalMs;
			if (typeof interval !== "number" || interval <= 0) return;
			presentedFrameIntervals.push(interval);
			if (presentedFrameIntervals.length > SAMPLE_SIZE) {
				presentedFrameIntervals.shift();
			}
			applyRuntimeQuality();
		};

		window.addEventListener("playback-update", handlePlaybackUpdate);
		window.addEventListener(QCUT_VIDEO_FRAME_EVENT, handleVideoFrame);
		return () => {
			window.removeEventListener("playback-update", handlePlaybackUpdate);
			window.removeEventListener(QCUT_VIDEO_FRAME_EVENT, handleVideoFrame);
		};
	}, [isPlaying, previewQuality, setRuntimePreviewQuality]);
}
