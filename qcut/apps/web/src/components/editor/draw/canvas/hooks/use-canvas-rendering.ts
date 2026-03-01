import { useEffect, type RefObject } from "react";
import type {
	AnyCanvasObject,
	ImageObject,
} from "../../hooks/use-canvas-objects";
import { debug } from "../canvas-utils";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";

/**
 * Hook for canvas rendering effects: drawing objects on the main canvas
 * and images on the background canvas.
 */
export function useCanvasRendering({
	canvasRef,
	backgroundCanvasRef,
	objects,
	renderObjects,
	backgroundImage,
}: {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	backgroundCanvasRef: RefObject<HTMLCanvasElement | null>;
	objects: AnyCanvasObject[];
	renderObjects: (
		ctx: CanvasRenderingContext2D,
		objectsToRender?: AnyCanvasObject[]
	) => void;
	backgroundImage?: string;
}) {
	// Re-render canvas when objects change
	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!ctx || !canvas) {
			debug("❌ Canvas or context not available");
			return;
		}

		// Partition objects once
		const nonImageObjects = objects.filter((obj) => obj.type !== "image");
		const hasImages = nonImageObjects.length < objects.length;

		debug("🎨 CANVAS LAYER - Drawing canvas render:", {
			canvasElement: "Drawing Canvas (z-index: 2)",
			clearingWithTransparent: true,
			willShowBackgroundCanvas: true,
			backgroundCanvasHasImages: hasImages,
		});

		// Clear and set white background for drawing canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Set white background ONLY if there are no images
		if (!hasImages) {
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		// Render non-image objects to DRAWING canvas (strokes, shapes, text)
		if (nonImageObjects.length > 0) {
			debug("🎨 DRAWING CANVAS - Rendering non-image objects:", {
				canvasElement: "Drawing Canvas (z-index: 2)",
				totalObjects: objects.length,
				renderingToDrawingCanvas: nonImageObjects.length,
				imagesSkipped: objects.length - nonImageObjects.length,
				renderingTypes: [...new Set(nonImageObjects.map((obj) => obj.type))],
				imagesHandledSeparately: "Background Canvas (z-index: 1)",
			});

			renderObjects(ctx, nonImageObjects);

			debug("✅ DRAWING CANVAS - Render completed:", {
				objectsRendered: nonImageObjects.length,
			});
		} else {
			debug("🎨 DRAWING CANVAS - No non-image objects to render");
		}
	}, [objects, renderObjects, canvasRef.current]);

	// Render images to BACKGROUND canvas (z-index: 1)
	useEffect(() => {
		const bgCanvas = backgroundCanvasRef.current;
		const bgCtx = bgCanvas?.getContext("2d");
		if (!bgCtx || !bgCanvas) {
			return;
		}

		// Clear background canvas
		bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

		// Set white background for background canvas
		bgCtx.fillStyle = "white";
		bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

		// Re-draw background image if provided (loaded during initialization)
		const drawImageObjects = () => {
			// Get only image objects
			const imageObjects = objects.filter((obj) => obj.type === "image");

			if (imageObjects.length > 0) {
				debug("🖼️ BACKGROUND CANVAS - Rendering images:", {
					canvasElement: "Background Canvas (z-index: 1)",
					imageCount: imageObjects.length,
					images: imageObjects.map((img) => ({
						id: img.id,
						bounds: {
							x: img.x,
							y: img.y,
							width: img.width,
							height: img.height,
						},
					})),
				});

				// Render each image to background canvas
				for (const obj of imageObjects) {
					bgCtx.save();
					bgCtx.globalAlpha = obj.opacity || 1;

					const image = obj as ImageObject;

					// Check if image is loaded
					if (!image.element.complete) {
						debug(
							"🖼️ BACKGROUND CANVAS - Image not fully loaded, skipping:",
							image.id
						);
						bgCtx.restore();
						continue;
					}

					const centerX = obj.x + obj.width / 2;
					const centerY = obj.y + obj.height / 2;

					bgCtx.translate(centerX, centerY);
					bgCtx.rotate((image.rotation * Math.PI) / 180);
					bgCtx.translate(-centerX, -centerY);

					try {
						bgCtx.drawImage(image.element, obj.x, obj.y, obj.width, obj.height);
						debug(
							"✅ BACKGROUND CANVAS - Image rendered successfully:",
							image.id
						);
					} catch (error) {
						handleError(error, {
							operation: "render background image",
							category: ErrorCategory.UI,
							severity: ErrorSeverity.LOW,
						});
					}

					bgCtx.restore();
				}
			}
		};

		if (backgroundImage) {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				// Scale image to fit canvas while maintaining aspect ratio
				const imgRatio = img.width / img.height;
				const canvasRatio = bgCanvas.width / bgCanvas.height;

				let drawWidth: number;
				let drawHeight: number;
				let drawX: number;
				let drawY: number;

				if (imgRatio > canvasRatio) {
					drawWidth = bgCanvas.width;
					drawHeight = bgCanvas.width / imgRatio;
					drawX = 0;
					drawY = (bgCanvas.height - drawHeight) / 2;
				} else {
					drawWidth = bgCanvas.height * imgRatio;
					drawHeight = bgCanvas.height;
					drawX = (bgCanvas.width - drawWidth) / 2;
					drawY = 0;
				}

				bgCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
				debug("🖼️ BACKGROUND CANVAS - Background image re-drawn");

				// Draw image objects on top of background image
				drawImageObjects();
			};
			img.onerror = () => {
				debug("❌ BACKGROUND CANVAS - Failed to reload background image");
				drawImageObjects();
			};
			img.src = backgroundImage;
		} else {
			drawImageObjects();
		}
	}, [objects, backgroundImage, backgroundCanvasRef.current]);
}
