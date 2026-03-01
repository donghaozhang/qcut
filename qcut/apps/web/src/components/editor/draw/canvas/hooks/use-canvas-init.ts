import { useEffect, type RefObject } from "react";
import { DEFAULT_CANVAS_SIZE } from "@/stores/project-store";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";

/**
 * Hook for canvas initialization: sets dimensions, white background,
 * and loads the optional background image.
 */
export function useCanvasInit({
	canvasRef,
	backgroundCanvasRef,
	containerRef,
	backgroundImage,
}: {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	backgroundCanvasRef: RefObject<HTMLCanvasElement | null>;
	containerRef: RefObject<HTMLDivElement | null>;
	backgroundImage?: string;
}) {
	const canvasDimensions = DEFAULT_CANVAS_SIZE;

	// Initialize canvases with error handling
	useEffect(() => {
		try {
			const canvas = canvasRef.current;
			const bgCanvas = backgroundCanvasRef.current;
			const container = containerRef.current;

			if (!canvas || !bgCanvas || !container) return;

			// Set canvas dimensions
			const { width, height } = canvasDimensions;
			canvas.width = width;
			canvas.height = height;
			bgCanvas.width = width;
			bgCanvas.height = height;

			// Clear both canvases
			const ctx = canvas.getContext("2d");
			const bgCtx = bgCanvas.getContext("2d");

			if (ctx) {
				if (import.meta.env.DEV) {
					console.log(
						"🎨 CANVAS LAYER DEBUG - Drawing canvas initialization:",
						{
							canvasElement: "Drawing Canvas (z-index: 2)",
							settingWhiteBackground: true,
							willCoverBackgroundCanvas: true,
						}
					);
				}
				// Set white background
				ctx.fillStyle = "white";
				ctx.fillRect(0, 0, width, height);
				// Set default canvas properties
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
			}

			if (bgCtx) {
				if (import.meta.env.DEV) {
					console.log(
						"🎨 CANVAS LAYER DEBUG - Background canvas initialization:",
						{
							canvasElement: "Background Canvas (z-index: 1)",
							settingWhiteBackground: true,
							thisIsWhereImagesRender: true,
						}
					);
				}
				// Set white background for background canvas too
				bgCtx.fillStyle = "white";
				bgCtx.fillRect(0, 0, width, height);

				// Draw background image if provided
				if (backgroundImage) {
					const img = new Image();
					img.crossOrigin = "anonymous"; // Handle CORS
					img.onload = () => {
						try {
							// Scale image to fit canvas while maintaining aspect ratio
							const imgRatio = img.width / img.height;
							const canvasRatio = width / height;

							let drawWidth, drawHeight, drawX, drawY;

							if (imgRatio > canvasRatio) {
								drawWidth = width;
								drawHeight = width / imgRatio;
								drawX = 0;
								drawY = (height - drawHeight) / 2;
							} else {
								drawWidth = height * imgRatio;
								drawHeight = height;
								drawX = (width - drawWidth) / 2;
								drawY = 0;
							}

							bgCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
						} catch (error) {
							handleError(error, {
								operation: "background image loading",
								category: ErrorCategory.MEDIA_PROCESSING,
								severity: ErrorSeverity.MEDIUM,
							});
						}
					};
					img.onerror = () => {
						handleError(new Error("Failed to load background image"), {
							operation: "background image error",
							category: ErrorCategory.MEDIA_PROCESSING,
							severity: ErrorSeverity.MEDIUM,
						});
					};
					img.src = backgroundImage;
				}
			}
		} catch (error) {
			handleError(error, {
				operation: "canvas initialization",
				category: ErrorCategory.UI,
				severity: ErrorSeverity.HIGH,
			});
		}
	}, [backgroundImage, canvasRef, backgroundCanvasRef, containerRef]);

	return { canvasDimensions };
}
