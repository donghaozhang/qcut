import { RotateCcw } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	buildLegacyAudioFields,
	normalizeMediaAudioSettings,
} from "@/lib/audio/audio-properties";
import { setAudioKeyframePropertyValue } from "@/lib/audio/audio-keyframe-properties";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
	MediaElement,
} from "@/types/timeline";
import { AudioNumberControl } from "./audio-property-controls";

export interface AudioBatchSelection {
	trackId: string;
	element: MediaElement;
}

function batchValue({ values }: { values: number[] }): {
	value: number;
	mixed: boolean;
} {
	const value =
		values.reduce((total, current) => total + current, 0) / values.length;
	return {
		value,
		mixed: values.some((current) => Math.abs(current - values[0]) > 0.0001),
	};
}

export function AudioMultiSelectionProperties({
	selections,
}: {
	selections: AudioBatchSelection[];
}) {
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const interactionActive = useRef(false);
	const settings = selections.map(({ element }) =>
		normalizeMediaAudioSettings({ element })
	);
	const volume = batchValue({
		values: settings.map((audio) => audio.volumeDb),
	});
	const fadeIn = batchValue({ values: settings.map((audio) => audio.fadeIn) });
	const fadeOut = batchValue({
		values: settings.map((audio) => audio.fadeOut),
	});
	const pan = batchValue({ values: settings.map((audio) => audio.pan * 100) });
	const maxFadeDuration = Math.max(
		0.1,
		Math.min(
			...selections.map(({ element }) => getMediaTimelineDuration(element) / 2)
		)
	);

	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const applyProperty = ({
		property,
		value,
	}: {
		property: AudioKeyframeProperty;
		value: number;
	}) => {
		for (const selection of selections) {
			const current = normalizeMediaAudioSettings({
				element: selection.element,
			});
			const next = setAudioKeyframePropertyValue({
				settings:
					property === "pan" ? { ...current, panEnabled: true } : current,
				property,
				value,
			});
			updateMediaElement(
				selection.trackId,
				selection.element.id,
				{ audio: next, ...buildLegacyAudioFields({ settings: next }) },
				false
			);
		}
	};
	const resetBasics = () => {
		pushHistory();
		for (const selection of selections) {
			const current = normalizeMediaAudioSettings({
				element: selection.element,
			});
			const next: MediaAudioSettings = {
				...current,
				volumeDb: 0,
				fadeIn: 0,
				fadeOut: 0,
				panEnabled: false,
				pan: 0,
			};
			updateMediaElement(
				selection.trackId,
				selection.element.id,
				{ audio: next, ...buildLegacyAudioFields({ settings: next }) },
				false
			);
		}
	};

	return (
		<div className="space-y-4" data-testid="audio-multi-selection-properties">
			<div className="flex h-9 items-center border-b border-border px-3">
				<span className="min-w-0 flex-1 truncate text-xs font-medium">
					{selections.length} audio clips
				</span>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7 rounded-sm"
					onClick={resetBasics}
					aria-label="Reset selected audio basics"
					title="Reset selected audio basics"
				>
					<RotateCcw className="size-3.5" />
				</Button>
			</div>
			<div className="space-y-4 px-3 pb-3">
				<AudioNumberControl
					label="Volume"
					value={volume.value}
					mixed={volume.mixed}
					min={-60}
					max={12}
					step={0.1}
					suffix="dB"
					onChange={(value) => applyProperty({ property: "volumeDb", value })}
					onInteractionStart={beginInteraction}
					onInteractionEnd={endInteraction}
				/>
				<AudioNumberControl
					label="Fade in"
					value={fadeIn.value}
					mixed={fadeIn.mixed}
					min={0}
					max={maxFadeDuration}
					step={0.1}
					suffix="s"
					onChange={(value) => applyProperty({ property: "fadeIn", value })}
					onInteractionStart={beginInteraction}
					onInteractionEnd={endInteraction}
				/>
				<AudioNumberControl
					label="Fade out"
					value={fadeOut.value}
					mixed={fadeOut.mixed}
					min={0}
					max={maxFadeDuration}
					step={0.1}
					suffix="s"
					onChange={(value) => applyProperty({ property: "fadeOut", value })}
					onInteractionStart={beginInteraction}
					onInteractionEnd={endInteraction}
				/>
				<AudioNumberControl
					label="Stereo balance"
					value={pan.value}
					mixed={pan.mixed}
					min={-100}
					max={100}
					step={1}
					suffix="%"
					onChange={(value) => applyProperty({ property: "pan", value })}
					onInteractionStart={beginInteraction}
					onInteractionEnd={endInteraction}
				/>
			</div>
		</div>
	);
}
