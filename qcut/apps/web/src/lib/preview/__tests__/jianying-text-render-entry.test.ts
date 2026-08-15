import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import {
	createJianyingTextRenderEntry,
	resolveJianyingTextPlaybackLayerStyle,
	resolveJianyingTextRenderContentBounds,
} from "../jianying-text-render-entry";

function element(): TextElement {
	return {
		id: "text",
		type: "text",
		name: "Text",
		content: "花字",
		startTime: 1,
		duration: 3,
		trimStart: 0.2,
		trimEnd: 0.3,
		fontSize: 72,
		fontFamily: "sans-serif",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		width: 512,
		height: 512,
		rotation: 0,
		opacity: 1,
		jianyingTextStyle: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "TextStyle",
			resourceId: "123",
			packageHash: "a".repeat(32),
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 2,
		},
	};
}

function frameEntry({ timelineTime }: { timelineTime: number }) {
	return createJianyingTextRenderEntry({
		element: element(),
		requestId: "frame",
		trackOrder: 0,
		elementOrder: 0,
		canvasWidth: 1920,
		canvasHeight: 1080,
		fps: 30,
		mode: "frame",
		timelineTime,
	});
}

describe("Jianying text render entry", () => {
	it("uses a half-open visible range at the trimmed endpoint", () => {
		expect(frameEntry({ timelineTime: 1.2 })).not.toBeNull();
		expect(frameEntry({ timelineTime: 3.699_999 })).not.toBeNull();
		expect(frameEntry({ timelineTime: 3.7 })).toBeNull();
	});

	it("maps a paused timeline frame to the element source", () => {
		const request = frameEntry({ timelineTime: 1.6 })?.renderRequest;
		expect(request).toMatchObject({
			elementDuration: 3,
			frameCount: 1,
			fps: 30,
		});
		expect(request?.sourceStart).toBeCloseTo(0.6, 10);
	});

	it("maps native alpha bounds into a stable local selection rect", () => {
		const entry = createJianyingTextRenderEntry({
			element: element(),
			requestId: "sequence",
			trackOrder: 0,
			elementOrder: 0,
			canvasWidth: 1920,
			canvasHeight: 1080,
			fps: 30,
			mode: "sequence",
		});
		if (!entry) throw new Error("Expected Jianying text render entry");

		expect(
			resolveJianyingTextRenderContentBounds({
				entry,
				result: {
					requestId: entry.requestId,
					resourceId: "123",
					packageHash: "a".repeat(32),
					templateDuration: 2,
					frameCount: entry.renderRequest.frameCount,
					strategy: "host-text",
					cacheHit: false,
					x: 704,
					y: 284,
					width: 512,
					height: 512,
					contentBounds: { x: 76, y: 146, width: 360, height: 220 },
					source: {
						kind: "image-sequence",
						path: "/tmp/frame-%06d.png",
						frameRate: 30,
					},
				},
			})
		).toEqual({ offsetX: 0, offsetY: 0, width: 392, height: 252 });
	});

	it("transforms the ready native layer without requesting another render", () => {
		const entry = createJianyingTextRenderEntry({
			element: element(),
			requestId: "sequence",
			trackOrder: 0,
			elementOrder: 0,
			canvasWidth: 1920,
			canvasHeight: 1080,
			fps: 30,
			mode: "sequence",
		});
		if (!entry) throw new Error("Expected Jianying text render entry");

		const style = resolveJianyingTextPlaybackLayerStyle({
			entry,
			result: {
				requestId: entry.requestId,
				resourceId: "123",
				packageHash: "a".repeat(32),
				templateDuration: 2,
				frameCount: entry.renderRequest.frameCount,
				strategy: "host-text",
				cacheHit: false,
				x: 704,
				y: 284,
				width: 512,
				height: 512,
				source: { kind: "image", path: "/tmp/frame.png" },
			},
			targetTransform: {
				x: 100,
				y: -50,
				width: 768,
				height: 256,
				rotation: 30,
			},
		});

		expect(Number.parseFloat(style.left)).toBeCloseTo(41.875, 6);
		expect(Number.parseFloat(style.top)).toBeCloseTo(21.666_667, 6);
		expect(style.transform).toBe("rotate(30deg) scale(1.5, 0.5)");
		expect(style.transformOrigin).toBe("center");
	});
});
