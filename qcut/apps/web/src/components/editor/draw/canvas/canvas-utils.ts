import { useCallback, type RefObject } from "react";
import type { AnyCanvasObject } from "../hooks/use-canvas-objects";

// Debug logging function that only logs in development mode when enabled
export const debug = (...args: unknown[]) => {
	if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_DRAW === "1") {
		// eslint-disable-next-line no-console
		console.log(...args);
	}
};

/**
 * Hook providing canvas utility functions: object creation protection,
 * data URL export, and history saving.
 */
export function useCanvasUtils({
	canvasRef,
	backgroundCanvasRef,
	objects,
	renderObjects,
	saveToHistory,
	isSavingToHistory,
	recentObjectCreation,
}: {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	backgroundCanvasRef: RefObject<HTMLCanvasElement | null>;
	objects: AnyCanvasObject[];
	renderObjects: (
		ctx: CanvasRenderingContext2D,
		objectsToRender?: AnyCanvasObject[]
	) => void;
	saveToHistory: (dataUrl: string) => void;
	isSavingToHistory: RefObject<boolean>;
	recentObjectCreation: RefObject<boolean>;
}) {
	// Helper function to apply object creation protection
	const withObjectCreationProtection = useCallback(
		<T>(operation: () => T, operationType: string): T => {
			// Set flag to prevent history restoration during object creation
			recentObjectCreation.current = true;
			debug(`🛡️ Object creation protection enabled: ${operationType}`);

			try {
				const result = operation();
				return result;
			} finally {
				// Clear flag after a delay to allow rendering and history operations to complete
				setTimeout(() => {
					recentObjectCreation.current = false;
					debug(`✅ Object creation protection cleared: ${operationType}`);
				}, 200);
			}
		},
		[
			// Set flag to prevent history restoration during object creation
			recentObjectCreation,
		]
	);

	// Export canvas contents to data URL without mutating the visible canvas
	const getCanvasDataUrl = useCallback(() => {
		const canvas = canvasRef.current;
		const backgroundCanvas = backgroundCanvasRef.current;
		if (!canvas) {
			debug("❌ Canvas not available for download");
			return null;
		}

		debug("🖼️ Preparing offscreen canvas for download:", {
			objectCount: objects.length,
			canvasSize: { width: canvas.width, height: canvas.height },
		});

		// Create offscreen canvas for export
		const exportCanvas = document.createElement("canvas");
		exportCanvas.width = canvas.width;
		exportCanvas.height = canvas.height;
		const exportCtx = exportCanvas.getContext("2d");

		if (!exportCtx) {
			debug("❌ Failed to get export canvas context");
			return null;
		}

		// Set white background
		exportCtx.fillStyle = "white";
		exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

		// Composite background layer if available
		if (backgroundCanvas) {
			exportCtx.drawImage(backgroundCanvas, 0, 0);
			debug("🖼️ Background layer composited");
		}

		// Render all objects to the offscreen canvas
		if (objects.length > 0) {
			renderObjects(exportCtx);
			debug("✅ Objects rendered for download");
		} else {
			debug("⚠️ No objects to render");
		}

		// Get the data URL
		const dataUrl = exportCanvas.toDataURL("image/png");
		debug("📸 Canvas data URL generated:", {
			dataUrlLength: dataUrl.length,
			isValid: dataUrl.startsWith("data:image/png;base64,"),
		});

		return dataUrl;
	}, [objects, renderObjects, backgroundCanvasRef.current, canvasRef.current]);

	// Save current canvas state to history
	const saveCanvasToHistory = useCallback(() => {
		debug("💾 DRAW DEBUG - Saving canvas to history:", {
			objectCount: objects.length,
		});
		const saveSnapshot = () => {
			const dataUrl = getCanvasDataUrl();
			if (dataUrl) {
				debug("💾 DRAW DEBUG - Saving to history, length:", dataUrl.length);

				// Set flag to prevent history restoration during save
				isSavingToHistory.current = true;
				try {
					saveToHistory(dataUrl);
				} finally {
					// Clear flag after a longer delay to coordinate with object creation protection
					setTimeout(() => {
						isSavingToHistory.current = false;
						debug("💾 DRAW DEBUG - Save operation completed");
					}, 250); // Increased to 250ms to ensure it's after object creation protection clears (200ms)
				}
			} else {
				debug("❌ DRAW DEBUG - No dataUrl to save to history");
			}
		};

		if (typeof window !== "undefined") {
			if (typeof window.requestAnimationFrame === "function") {
				window.requestAnimationFrame(() =>
					window.requestAnimationFrame(saveSnapshot)
				);
			} else {
				setTimeout(saveSnapshot, 0);
			}
		} else {
			saveSnapshot();
		}
	}, [
		getCanvasDataUrl,
		saveToHistory, // Set flag to prevent history restoration during save
		isSavingToHistory,
		objects.length,
	]);

	return {
		withObjectCreationProtection,
		getCanvasDataUrl,
		saveCanvasToHistory,
	};
}
