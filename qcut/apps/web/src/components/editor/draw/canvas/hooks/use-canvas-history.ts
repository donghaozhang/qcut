import { useEffect, type RefObject } from "react";
import { debug } from "../canvas-utils";

/**
 * Hook for history restoration (undo/redo) with debounce protection.
 */
export function useCanvasHistory({
	historyIndex,
	getCurrentHistoryState,
	getCanvasDataUrl,
	loadDrawingFromDataUrl,
	isSavingToHistory,
	recentObjectCreation,
}: {
	historyIndex: number;
	getCurrentHistoryState: () => string | undefined;
	getCanvasDataUrl: () => string | null;
	loadDrawingFromDataUrl: (dataUrl: string) => Promise<void>;
	isSavingToHistory: RefObject<boolean>;
	recentObjectCreation: RefObject<boolean>;
}) {
	// Handle undo/redo by restoring canvas state from history
	useEffect(() => {
		// Skip restoration if we're currently saving to history or recently created object
		if (isSavingToHistory.current || recentObjectCreation.current) {
			debug("🚫 DRAW - Skipping restoration:", {
				saving: isSavingToHistory.current,
				recentCreation: recentObjectCreation.current,
			});
			return;
		}

		const historyState = getCurrentHistoryState();
		if (!historyState) return;

		// Add debounce protection for rapid restoration calls
		const currentCanvasData = getCanvasDataUrl();

		debug("🔄 DRAW - History restoration triggered:", {
			historyIndex,
		});
		if (
			historyState &&
			currentCanvasData &&
			historyState !== currentCanvasData
		) {
			debug(
				"⚠️ DRAW - Restoring canvas from history (objects will be cleared)",
				{
					historyStateLength: historyState.length,
					currentStateLength: currentCanvasData.length,
				}
			);
			loadDrawingFromDataUrl(historyState).catch((error) => {
				debug("❌ DRAW - History restoration failed:", error);
			});
		}
	}, [
		historyIndex,
		getCurrentHistoryState,
		getCanvasDataUrl,
		loadDrawingFromDataUrl,
		recentObjectCreation,
		isSavingToHistory.current,
	]);
}
