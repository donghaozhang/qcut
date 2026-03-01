import type { SetFn, GetFn } from "./types";

/** Creates actions for Remotion instance playback: seek, play, pause, and rate control. */
export function createPlaybackActions(set: SetFn, get: GetFn) {
	return {
		seekInstance: (elementId: string, frame: number) => {
			const instance = get().instances.get(elementId);
			if (!instance) return;

			set((state) => {
				const newInstances = new Map(state.instances);
				const inst = newInstances.get(elementId);
				if (inst) {
					newInstances.set(elementId, {
						...inst,
						localFrame: frame,
					});
				}
				return { instances: newInstances };
			});

			if (instance.playerRef) {
				instance.playerRef.seekTo(frame);
			}
		},

		playInstance: (elementId: string) => {
			set((state) => {
				const instance = state.instances.get(elementId);
				if (!instance) return state;

				const newInstances = new Map(state.instances);
				newInstances.set(elementId, {
					...instance,
					isPlaying: true,
				});

				if (instance.playerRef) {
					instance.playerRef.play();
				}

				return { instances: newInstances };
			});
		},

		pauseInstance: (elementId: string) => {
			set((state) => {
				const instance = state.instances.get(elementId);
				if (!instance) return state;

				const newInstances = new Map(state.instances);
				newInstances.set(elementId, {
					...instance,
					isPlaying: false,
				});

				if (instance.playerRef) {
					instance.playerRef.pause();
				}

				return { instances: newInstances };
			});
		},

		setInstancePlaybackRate: (elementId: string, rate: number) => {
			set((state) => {
				const instance = state.instances.get(elementId);
				if (!instance) return state;

				const newInstances = new Map(state.instances);
				newInstances.set(elementId, {
					...instance,
					playbackRate: rate,
				});

				return { instances: newInstances };
			});
		},
	};
}
