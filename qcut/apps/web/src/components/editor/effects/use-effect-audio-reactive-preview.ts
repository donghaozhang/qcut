"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EffectRenderProgram } from "@qcut/editor-core";
import { readAudioReactiveLevel } from "@/lib/audio/audio-mix-engine";
import {
	getEffectAudioReactiveStages,
	getEffectAudioReactiveState,
	IDENTITY_EFFECT_AUDIO_REACTIVE_STATE,
	type EffectAudioReactiveState,
} from "@/lib/effects/effect-audio-reactive-state";

function statesAreClose({
	left,
	right,
}: {
	left: EffectAudioReactiveState;
	right: EffectAudioReactiveState;
}): boolean {
	return (
		Math.abs(left.brightness - right.brightness) < 0.002 &&
		Math.abs(left.scale - right.scale) < 0.002 &&
		Math.abs(left.opacity - right.opacity) < 0.002
	);
}

export function useEffectAudioReactivePreview({
	program,
	trackId,
}: {
	program?: EffectRenderProgram;
	trackId: string;
}): EffectAudioReactiveState {
	const stages = useMemo(
		() => getEffectAudioReactiveStages({ program }),
		[program]
	);
	const [state, setState] = useState<EffectAudioReactiveState>(
		IDENTITY_EFFECT_AUDIO_REACTIVE_STATE
	);
	const levelsRef = useRef(new Map<number, number>());
	const lastFrameRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		levelsRef.current = new Map();
		lastFrameRef.current = undefined;
		if (stages.length === 0) {
			setState(IDENTITY_EFFECT_AUDIO_REACTIVE_STATE);
			return;
		}

		let animationFrame = 0;
		const update = (timestamp: number) => {
			const elapsedSeconds = Math.min(
				0.1,
				Math.max(
					1 / 120,
					(timestamp - (lastFrameRef.current ?? timestamp)) / 1_000
				)
			);
			lastFrameRef.current = timestamp;
			for (const { stageIndex, stage } of stages) {
				const previous = levelsRef.current.get(stageIndex) ?? 0;
				const measured = readAudioReactiveLevel({
					driver: stage.driver,
					band: stage.band,
					trackId,
				});
				const milliseconds =
					measured > previous ? stage.attackMs : stage.releaseMs;
				const alpha =
					milliseconds <= 0
						? 1
						: 1 - Math.exp(-elapsedSeconds / (milliseconds / 1_000));
				levelsRef.current.set(
					stageIndex,
					previous + (measured - previous) * alpha
				);
			}
			const next = getEffectAudioReactiveState({
				program,
				levelByStageIndex: levelsRef.current,
			});
			setState((current) =>
				statesAreClose({ left: current, right: next }) ? current : next
			);
			animationFrame = window.requestAnimationFrame(update);
		};
		animationFrame = window.requestAnimationFrame(update);
		return () => window.cancelAnimationFrame(animationFrame);
	}, [program, stages, trackId]);

	return state;
}
