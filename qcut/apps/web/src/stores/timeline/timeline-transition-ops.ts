import { generateUUID } from "@/lib/utils";
import { getTimelineElementDuration } from "@/lib/timeline";
import { getAudioCrossfadeMaxDuration } from "@qcut/editor-core/timeline";
import {
	type MediaElement,
	getTransitionMaxDuration,
	type ClipTransition,
} from "@/types/timeline";
import type { TimelineStore } from "./types";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

function transitionDuration({
	track,
	fromElementId,
	toElementId,
	transitions,
	excludeTransitionId,
}: {
	track: TimelineStore["tracks"][number];
	fromElementId: string;
	toElementId: string;
	transitions: ClipTransition[];
	excludeTransitionId?: string;
}): number {
	return getTransitionMaxDuration({
		track,
		fromElementId,
		toElementId,
		transitions,
		excludeTransitionId,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element }),
	});
}

/** Creates clip-transition mutations and selection actions for the timeline store. */
export function createTransitionOps(
	get: StoreGet,
	set: StoreSet,
	deps: OperationDeps
) {
	return {
		addTransition: ({
			trackId,
			fromElementId,
			toElementId,
			presetId,
			type,
			duration,
			direction,
			easing = "easeInOut",
			tuning,
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			if (!track || track.type !== "media") return null;
			const transitions = track.transitions ?? [];
			const existing = transitions.find(
				(transition) =>
					transition.fromElementId === fromElementId &&
					transition.toElementId === toElementId
			);
			const maxDuration = transitionDuration({
				track,
				fromElementId,
				toElementId,
				transitions,
				excludeTransitionId: existing?.id,
			});
			if (maxDuration <= 0) return null;

			const id = existing?.id ?? generateUUID();
			const transition: ClipTransition = {
				id,
				fromElementId,
				toElementId,
				presetId,
				type,
				duration: Math.min(Math.max(0, duration), maxDuration),
				direction,
				easing,
				tuning,
			};
			if (transition.duration <= 0) return null;

			get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								transitions: [
									...(candidate.transitions ?? []).filter(
										(item) => item.id !== id
									),
									transition,
								],
								audioCrossfades: (candidate.audioCrossfades ?? []).map(
									(crossfade) =>
										crossfade.fromElementId === fromElementId &&
										crossfade.toElementId === toElementId
											? { ...crossfade, duration: transition.duration }
											: crossfade
								),
							}
						: candidate
				)
			);
			set({
				selectedElements: [],
				selectedTransition: { trackId, transitionId: id },
			});
			return id;
		},

		updateTransition: ({ trackId, transitionId, updates }) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			const existing = track?.transitions?.find(
				(transition) => transition.id === transitionId
			);
			if (!track || !existing) return;

			const maxDuration = transitionDuration({
				track,
				fromElementId: existing.fromElementId,
				toElementId: existing.toElementId,
				transitions: track.transitions ?? [],
				excludeTransitionId: transitionId,
			});
			if (maxDuration <= 0) return;
			const nextDuration = Math.min(
				Math.max(0, updates.duration ?? existing.duration),
				maxDuration
			);
			if (nextDuration <= 0) return;

			get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								transitions: (candidate.transitions ?? []).map((transition) =>
									transition.id === transitionId
										? {
												...transition,
												...updates,
												duration: nextDuration,
											}
										: transition
								),
								audioCrossfades: (candidate.audioCrossfades ?? []).map(
									(crossfade) =>
										crossfade.fromElementId === existing.fromElementId &&
										crossfade.toElementId === existing.toElementId
											? { ...crossfade, duration: nextDuration }
											: crossfade
								),
							}
						: candidate
				)
			);
		},

		setTransitionAudioCrossfade: ({
			trackId,
			fromElementId,
			toElementId,
			duration,
			enabled,
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			if (!track || (track.type !== "media" && track.type !== "audio")) return;
			const existing = track.audioCrossfades?.find(
				(crossfade) =>
					crossfade.fromElementId === fromElementId &&
					crossfade.toElementId === toElementId
			);
			if (!enabled) {
				if (!existing) return;
				get().pushHistory();
				deps.updateTracksAndSave(
					get()._tracks.map((candidate) =>
						candidate.id === trackId
							? {
									...candidate,
									audioCrossfades: (candidate.audioCrossfades ?? []).filter(
										(crossfade) => crossfade.id !== existing.id
									),
								}
							: candidate
					)
				);
				return;
			}

			const maxDuration = getAudioCrossfadeMaxDuration({
				track,
				fromElementId,
				toElementId,
				crossfades: track.audioCrossfades,
				excludeCrossfadeId: existing?.id,
				getElementDuration: ({ element }: { element: MediaElement }) =>
					getTimelineElementDuration({ element }),
			});
			const nextDuration = Math.min(Math.max(0, duration), maxDuration);
			if (nextDuration <= 0) return;
			get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								audioCrossfades: [
									...(candidate.audioCrossfades ?? []).filter(
										(crossfade) => crossfade.id !== existing?.id
									),
									{
										id: existing?.id ?? generateUUID(),
										fromElementId,
										toElementId,
										duration: nextDuration,
										curve: "equal-power",
									},
								],
							}
						: candidate
				)
			);
		},

		removeTransition: ({ trackId, transitionId }) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			const transition = track?.transitions?.find(
				(item) => item.id === transitionId
			);
			if (!track || !transition) {
				return;
			}
			get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								transitions: (candidate.transitions ?? []).filter(
									(transition) => transition.id !== transitionId
								),
								audioCrossfades: (candidate.audioCrossfades ?? []).filter(
									(crossfade) =>
										crossfade.fromElementId !== transition.fromElementId ||
										crossfade.toElementId !== transition.toElementId
								),
							}
						: candidate
				)
			);
			if (get().selectedTransition?.transitionId === transitionId) {
				set({ selectedTransition: null });
			}
		},

		selectTransition: ({ trackId, transitionId }) => {
			const exists = get()._tracks.some(
				(track) =>
					track.id === trackId &&
					track.transitions?.some(
						(transition) => transition.id === transitionId
					)
			);
			if (!exists) return;
			set({
				selectedElements: [],
				selectedTransition: { trackId, transitionId },
			});
		},

		clearSelectedTransition: () => set({ selectedTransition: null }),
	} satisfies Partial<TimelineStore>;
}
