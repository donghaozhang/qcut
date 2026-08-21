"use client";

import { useMemo } from "react";
import type { EffectAudioCompanion, MediaElement } from "@qcut/editor-core";
import { AudioPlayer } from "@/components/ui/audio-player";
import { resolveEffectSoundAsset } from "@/lib/effects/effect-sound-resources";
import type { ElementEffectAudioCompanion } from "@/components/editor/preview-panel/use-effects-rendering";
import type { TimelineElement } from "@/types/timeline";

function resolvePlaybackDuration({
	companion,
	element,
}: {
	companion: EffectAudioCompanion;
	element: TimelineElement;
}): number {
	const availableDuration = element.duration - companion.offsetSeconds;
	return Math.max(0, Math.min(companion.durationSeconds, availableDuration));
}

function EffectCompanionAudioPlayer({
	companion,
	effectId,
	effectName,
	element,
	trackId,
	trackMuted,
	timelineTime,
}: ElementEffectAudioCompanion & {
	element: TimelineElement;
	trackId: string;
	trackMuted: boolean;
	timelineTime?: number;
}) {
	const duration = resolvePlaybackDuration({ companion, element });
	const startTime = element.startTime + companion.offsetSeconds;
	const resolved = useMemo(() => {
		try {
			return resolveEffectSoundAsset({ resourceId: companion.resourceId });
		} catch {
			return undefined;
		}
	}, [companion.resourceId]);
	const audioElement = useMemo<MediaElement>(
		() => ({
			id: `effect-audio-${effectId}`,
			name: `${effectName} audio`,
			type: "media",
			mediaId: `effect-audio-resource-${companion.resourceId}`,
			duration,
			startTime,
			trimStart: 0,
			trimEnd: 0,
			volume: companion.gain,
		}),
		[
			companion.gain,
			companion.resourceId,
			duration,
			effectId,
			effectName,
			startTime,
		]
	);

	if (!resolved || duration <= 0) {
		return (
			<span
				hidden
				data-effect-companion-audio-state={resolved ? "out-of-range" : "error"}
				data-effect-id={effectId}
				data-resource-id={companion.resourceId}
			/>
		);
	}

	return (
		<>
			<AudioPlayer
				src={resolved.source.url}
				clipStartTime={startTime}
				trimStart={0}
				trimEnd={0}
				clipDuration={duration}
				trackMuted={trackMuted}
				trackId={trackId}
				playbackWindow={{ startTime, endTime: startTime + duration }}
				element={audioElement}
				timelineTime={timelineTime}
			/>
			<span
				hidden
				data-effect-companion-audio-state="ready"
				data-effect-id={effectId}
				data-resource-id={companion.resourceId}
			/>
		</>
	);
}

export function EffectCompanionAudioPlayers({
	companions,
	element,
	trackId,
	trackMuted = false,
	timelineTime,
}: {
	companions: readonly ElementEffectAudioCompanion[];
	element: TimelineElement;
	trackId: string;
	trackMuted?: boolean;
	timelineTime?: number;
}) {
	return (
		<>
			{companions.map((companion) => (
				<EffectCompanionAudioPlayer
					key={companion.effectId}
					{...companion}
					element={element}
					trackId={trackId}
					trackMuted={trackMuted}
					timelineTime={timelineTime}
				/>
			))}
		</>
	);
}
