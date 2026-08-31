import type { PlanarTrackingResultStore } from "@qcut/editor-core";
import { BrowserPlanarTrackingResultStore } from "./browser-planar-result-store";

let browserStore: PlanarTrackingResultStore | undefined;

export function getPlanarTrackingResultStore(): PlanarTrackingResultStore {
	const electronStore = globalThis.window?.electronAPI?.planarTrackingStorage;
	if (electronStore) return electronStore;
	browserStore ??= new BrowserPlanarTrackingResultStore();
	return browserStore;
}
