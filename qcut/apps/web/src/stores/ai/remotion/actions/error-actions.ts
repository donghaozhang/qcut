import type { RemotionError } from "@/lib/remotion/types";
import type { SetFn } from "./types";

/** Creates actions for tracking and clearing Remotion errors. */
export function createErrorActions(set: SetFn) {
	return {
		addError: (error: RemotionError) => {
			set((state) => ({
				recentErrors: [...state.recentErrors.slice(-19), error],
			}));

			if (error.elementId) {
				set((state) => {
					const instance = state.instances.get(error.elementId!);
					if (!instance) return state;

					const newInstances = new Map(state.instances);
					newInstances.set(error.elementId!, {
						...instance,
						error,
					});

					return { instances: newInstances };
				});
			}
		},

		clearErrors: () => {
			set({ recentErrors: [] });

			set((state) => {
				const newInstances = new Map(state.instances);
				for (const [id, instance] of newInstances) {
					if (instance.error) {
						newInstances.set(id, {
							...instance,
							error: undefined,
						});
					}
				}
				return { instances: newInstances };
			});
		},
	};
}
