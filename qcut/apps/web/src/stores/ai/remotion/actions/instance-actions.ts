import type { RemotionInstance, RemotionError } from "@/lib/remotion/types";
import type { PlayerRef } from "@remotion/player";
import type { SetFn, GetFn } from "./types";

/** Creates actions for Remotion instance lifecycle: create, destroy, update props, and set player refs. */
export function createInstanceActions(set: SetFn, get: GetFn) {
	return {
		createInstance: (
			elementId: string,
			componentId: string,
			props?: Record<string, unknown>
		) => {
			const component = get().registeredComponents.get(componentId);
			if (!component) {
				const error: RemotionError = {
					type: "load",
					elementId,
					componentId,
					message: `Component "${componentId}" not found in registry`,
					recoverable: false,
					timestamp: Date.now(),
				};
				get().addError(error);
				return null;
			}

			const instance: RemotionInstance = {
				elementId,
				componentId,
				playerRef: null,
				localFrame: 0,
				props: props ?? component.defaultProps,
				cacheStatus: "none",
				isPlaying: false,
				playbackRate: 1,
			};

			set((state) => {
				const newInstances = new Map(state.instances);
				newInstances.set(elementId, instance);
				return { instances: newInstances };
			});

			return instance;
		},

		destroyInstance: (elementId: string) => {
			set((state) => {
				const newInstances = new Map(state.instances);
				newInstances.delete(elementId);

				const newActiveIds = state.syncState.activeElementIds.filter(
					(id) => id !== elementId
				);

				return {
					instances: newInstances,
					syncState: {
						...state.syncState,
						activeElementIds: newActiveIds,
					},
				};
			});
		},

		updateInstanceProps: (
			elementId: string,
			props: Record<string, unknown>
		) => {
			set((state) => {
				const instance = state.instances.get(elementId);
				if (!instance) return state;

				const newInstances = new Map(state.instances);
				newInstances.set(elementId, {
					...instance,
					props: { ...instance.props, ...props },
					cacheStatus: "none",
				});

				return { instances: newInstances };
			});
		},

		setInstancePlayerRef: (elementId: string, ref: PlayerRef | null) => {
			set((state) => {
				const instance = state.instances.get(elementId);
				if (!instance) return state;

				const newInstances = new Map(state.instances);
				newInstances.set(elementId, {
					...instance,
					playerRef: ref,
				});

				return { instances: newInstances };
			});
		},

		getInstance: (elementId: string) => {
			return get().instances.get(elementId);
		},
	};
}
