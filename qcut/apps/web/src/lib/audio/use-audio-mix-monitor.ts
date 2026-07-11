import { useEffect } from "react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useAudioMeterStore } from "@/stores/editor/audio-meter-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { readAudioMixMeters, syncAudioMixEngine } from "./audio-mix-engine";

const METER_INTERVAL_MS = 50;

export function useAudioMixMonitor() {
	const tracks = useTimelineStore((state) => state.tracks);
	const audioMix = useProjectStore((state) => state.activeProject?.audioMix);
	const isPlaying = usePlaybackStore((state) => state.isPlaying);
	const setSnapshot = useAudioMeterStore((state) => state.setSnapshot);
	const clear = useAudioMeterStore((state) => state.clear);

	useEffect(() => {
		syncAudioMixEngine({ tracks, audioMix });
	}, [audioMix, tracks]);

	useEffect(() => {
		let animationFrame = 0;
		let lastUpdate = 0;
		const update = (timestamp: number) => {
			if (timestamp - lastUpdate >= METER_INTERVAL_MS) {
				const snapshot = readAudioMixMeters();
				if (snapshot) setSnapshot(snapshot);
				lastUpdate = timestamp;
			}
			animationFrame = requestAnimationFrame(update);
		};
		if (isPlaying) animationFrame = requestAnimationFrame(update);
		else clear();
		return () => cancelAnimationFrame(animationFrame);
	}, [clear, isPlaying, setSnapshot]);
}
