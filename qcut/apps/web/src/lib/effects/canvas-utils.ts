import html2canvas from "html2canvas";

export interface CaptureOptions {
	width: number;
	height: number;
	backgroundColor?: string;
}

export function hasDrawableCaptureArea({
	width,
	height,
}: Pick<CaptureOptions, "width" | "height">): boolean {
	return (
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width >= 1 &&
		height >= 1
	);
}

/**
 * Capture a DOM element to canvas and return as ImageData
 * This is used for frame caching in the timeline
 */
export async function captureFrameToCanvas(
	element: HTMLElement,
	options: CaptureOptions
): Promise<ImageData | null> {
	if (!hasDrawableCaptureArea(options)) {
		return null;
	}

	try {
		// Skip OffscreenCanvas with html2canvas due to compatibility issues
		// html2canvas doesn't properly support canvas option with OffscreenCanvas

		const canvas = await html2canvas(element, {
			width: options.width,
			height: options.height,
			backgroundColor:
				options.backgroundColor === "transparent"
					? null
					: options.backgroundColor || "#000000",
			scale: 1,
			logging: false,
			useCORS: true,
			// Preserve video frames and dynamic content
			allowTaint: false,
			foreignObjectRendering: false, // Disable to avoid oklab color issues
			// Important: preserve existing transforms and styles
			onclone: (clonedDoc) => {
				// Remove problematic CSS that uses oklab colors
				const style = clonedDoc.createElement("style");
				style.textContent = `
          * { 
            /* Override any oklab colors with fallbacks */
            color: inherit !important;
            background-color: transparent !important;
            border-color: currentColor !important;
          }
        `;
				clonedDoc.head.appendChild(style);

				// Preserve any dynamic styles
				const clonedElement = element.id
					? clonedDoc.getElementById(element.id)
					: null;
				if (clonedElement && element.style) {
					clonedElement.style.cssText = element.style.cssText;
				}
			},
		});

		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		return ctx.getImageData(0, 0, options.width, options.height);
	} catch (error) {
		console.error("Failed to capture frame:", error);

		// Fallback: Create a simple canvas capture without html2canvas
		try {
			const fallbackCanvas = document.createElement("canvas");
			fallbackCanvas.width = options.width;
			fallbackCanvas.height = options.height;
			const fallbackCtx = fallbackCanvas.getContext("2d");

			if (fallbackCtx) {
				// Fill with background color
				fallbackCtx.fillStyle = options.backgroundColor || "#000000";
				fallbackCtx.fillRect(0, 0, options.width, options.height);

				// Try to draw any video elements directly
				const videos = element.getElementsByTagName("video");
				if (videos.length > 0) {
					const video = videos[0];
					const rect = video.getBoundingClientRect();
					const elementRect = element.getBoundingClientRect();

					fallbackCtx.drawImage(
						video,
						rect.left - elementRect.left,
						rect.top - elementRect.top,
						rect.width,
						rect.height
					);
				}

				return fallbackCtx.getImageData(0, 0, options.width, options.height);
			}
		} catch (fallbackError) {
			console.error("Fallback capture also failed:", fallbackError);
		}

		return null;
	}
}

/**
 * Create an offscreen canvas for better performance
 */
const offscreenCanvas: OffscreenCanvas | null = null;
const offscreenContext: OffscreenCanvasRenderingContext2D | null = null;

export async function captureFrameToOffscreenCanvas(
	element: HTMLElement,
	options: CaptureOptions
): Promise<ImageData | null> {
	// Due to html2canvas compatibility issues with OffscreenCanvas
	// and oklab color functions, just use regular capture
	return captureFrameToCanvas(element, options);
}

/**
 * Helper to capture with fallback
 */
export async function captureWithFallback(
	element: HTMLElement,
	options: CaptureOptions
): Promise<ImageData | null> {
	if (!hasDrawableCaptureArea(options)) {
		return null;
	}

	// Try offscreen first for better performance
	const result = await captureFrameToOffscreenCanvas(element, options);
	if (result) return result;

	// Fallback to regular capture
	return captureFrameToCanvas(element, options);
}
