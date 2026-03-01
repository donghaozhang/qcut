import type { RemotionStore } from "@/lib/remotion/types";

export type SetFn = (
	partial:
		| Partial<RemotionStore>
		| ((state: RemotionStore) => Partial<RemotionStore>)
) => void;
export type GetFn = () => RemotionStore;
