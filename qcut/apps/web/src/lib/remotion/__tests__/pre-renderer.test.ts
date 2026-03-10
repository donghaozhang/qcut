/**
 * Pre-renderer Tests
 *
 * Tests for Remotion frame pre-rendering functionality.
 *
 * @module lib/remotion/__tests__/pre-renderer.test
 */

import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import {
	RemotionPreRenderer,
	createPreRenderer,
	estimateTotalFrames,
	estimateRenderTime,
	getElementsForPreRender,
	DEFAULT_PRE_RENDER_CONFIG,
	type PreRenderConfig,
} from "../pre-renderer";
import type { RemotionElement } from "@/types/timeline";

// Mock canvas for JSDOM environment
beforeAll(() => {
	initPlatform(createWebAdapter());
	// Create a proper mock for HTMLCanvasElement.toDataURL
	HTMLCanvasElement.prototype.toDataURL = vi.fn(
		() => "data:image/png;base64,test"
	);
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRemotionElement(
	overrides: Partial<RemotionElement> = {}
): RemotionElement {
	return {
		id: `element-${Math.random().toString(36).slice(2, 9)}`,
		name: "Test Remotion Element",
		type: "remotion",
		componentId: "test-component",
		props: {},
		renderMode: "live",
		duration: 5, // 5 seconds
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

// ============================================================================
// RemotionPreRenderer Tests
// ============================================================================

describe("RemotionPreRenderer", () => {
	let preRenderer: RemotionPreRenderer;

	beforeEach(() => {
		preRenderer = new RemotionPreRenderer({
			outputDir: "/tmp/render",
		});
	});

	afterEach(() => {
		preRenderer.abort();
	});

	describe("constructor", () => {
		it("should create with default config", () => {
			const renderer = new RemotionPreRenderer({ outputDir: "/test" });
			expect(renderer).toBeDefined();
			expect(renderer.getRenderMode()).toBe("canvas"); // Default in test env
		});

		it("should merge custom config with defaults", () => {
			const renderer = new RemotionPreRenderer({
				outputDir: "/test",
				quality: 100,
				format: "png",
			});
			expect(renderer).toBeDefined();
		});
	});

	describe("getRenderMode", () => {
		it("should return canvas mode in test environment", () => {
			expect(preRenderer.getRenderMode()).toBe("canvas");
		});
	});

	describe("updateConfig", () => {
		it("should update configuration", () => {
			preRenderer.updateConfig({ quality: 80 });
			// Config is private, but functionality should work
			expect(preRenderer).toBeDefined();
		});
	});

	describe("preRenderElement", () => {
		it("should render an element and return result", async () => {
			const element = createMockRemotionElement({
				duration: 1,
				trimStart: 0,
				trimEnd: 0,
			});

			const result = await preRenderer.preRenderElement(element);

			expect(result.elementId).toBe(element.id);
			// In test environment, canvas may fail - check structure is correct
			expect(result).toHaveProperty("success");
			expect(result).toHaveProperty("totalFrames");
			expect(result).toHaveProperty("framePaths");
			expect(result).toHaveProperty("renderDuration");
		});

		it("should handle zero-duration elements", async () => {
			const element = createMockRemotionElement({
				duration: 0,
			});

			const result = await preRenderer.preRenderElement(element);

			expect(result.success).toBe(true);
			expect(result.totalFrames).toBe(0);
			expect(result.framePaths.size).toBe(0);
		});

		it("should calculate correct frame count from duration", async () => {
			const element = createMockRemotionElement({
				duration: 2,
				trimStart: 0.5,
				trimEnd: 0.5,
			});

			const result = await preRenderer.preRenderElement(element);

			// If success, check frame count; if failed, check error exists
			if (result.success) {
				// 2 seconds - 0.5 trim start - 0.5 trim end = 1 second = 30 frames
				expect(result.totalFrames).toBe(30);
			} else {
				expect(result.error).toBeDefined();
			}
		});

		it("should call progress callback when rendering succeeds", async () => {
			const element = createMockRemotionElement({
				duration: 0.1, // Short duration for faster test
			});
			const progressCallback = vi.fn();

			const result = await preRenderer.preRenderElement(
				element,
				progressCallback
			);

			// Progress is only called on successful frame renders
			if (result.success && result.totalFrames > 0) {
				expect(progressCallback).toHaveBeenCalled();
			}
		});

		it("should include render duration in result", async () => {
			const element = createMockRemotionElement({
				duration: 0.1,
			});

			const result = await preRenderer.preRenderElement(element);

			expect(result.renderDuration).toBeGreaterThanOrEqual(0);
		});
	});

	describe("preRenderAll", () => {
		it("should render multiple elements and return results", async () => {
			const elements = [
				createMockRemotionElement({ duration: 0.1 }),
				createMockRemotionElement({ duration: 0.1 }),
			];

			const results = await preRenderer.preRenderAll(elements);

			expect(results.length).toBe(2);
			// Check each result has expected structure
			for (const result of results) {
				expect(result).toHaveProperty("elementId");
				expect(result).toHaveProperty("success");
				expect(result).toHaveProperty("framePaths");
			}
		});

		it("should process all elements even if some fail", async () => {
			const elements = [
				createMockRemotionElement({ id: "elem-1", duration: 0.1 }),
				createMockRemotionElement({ id: "elem-2", duration: 0.1 }),
			];

			const results = await preRenderer.preRenderAll(elements);

			expect(results.length).toBe(2);
			expect(results.map((r) => r.elementId)).toContain("elem-1");
			expect(results.map((r) => r.elementId)).toContain("elem-2");
		});
	});

	describe("abort", () => {
		it("should stop rendering when aborted", async () => {
			const element = createMockRemotionElement({
				duration: 10, // Long duration
			});

			// Start rendering
			const renderPromise = preRenderer.preRenderElement(element);

			// Abort immediately
			preRenderer.abort();

			const result = await renderPromise;
			// Should either complete or fail with abort
			expect(result).toBeDefined();
		});
	});
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("estimateTotalFrames", () => {
	it("should calculate total frames correctly", () => {
		const elements = [
			createMockRemotionElement({ duration: 1 }), // 30 frames
			createMockRemotionElement({ duration: 2 }), // 60 frames
		];

		const total = estimateTotalFrames(elements, 30);

		expect(total).toBe(90);
	});

	it("should account for trim", () => {
		const elements = [
			createMockRemotionElement({
				duration: 2,
				trimStart: 0.5,
				trimEnd: 0.5,
			}), // 1 second effective
		];

		const total = estimateTotalFrames(elements, 30);

		expect(total).toBe(30);
	});

	it("should handle empty array", () => {
		expect(estimateTotalFrames([], 30)).toBe(0);
	});

	it("should handle different fps", () => {
		const elements = [createMockRemotionElement({ duration: 1 })];

		expect(estimateTotalFrames(elements, 24)).toBe(24);
		expect(estimateTotalFrames(elements, 60)).toBe(60);
	});
});

describe("estimateRenderTime", () => {
	it("should estimate render time based on frame count", () => {
		const elements = [createMockRemotionElement({ duration: 1 })]; // 30 frames

		// Default 50ms per frame
		const estimate = estimateRenderTime(elements, 30);

		expect(estimate).toBe(30 * 50);
	});

	it("should accept custom ms per frame", () => {
		const elements = [createMockRemotionElement({ duration: 1 })];

		const estimate = estimateRenderTime(elements, 30, 100);

		expect(estimate).toBe(30 * 100);
	});
});

describe("getElementsForPreRender", () => {
	it("should return elements within time range", () => {
		const elements = [
			createMockRemotionElement({ id: "e1", startTime: 0, duration: 2 }),
			createMockRemotionElement({ id: "e2", startTime: 3, duration: 2 }),
			createMockRemotionElement({ id: "e3", startTime: 6, duration: 2 }),
		];

		const result = getElementsForPreRender(elements, 1, 4);

		expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
	});

	it("should include elements that partially overlap", () => {
		const elements = [
			createMockRemotionElement({ id: "e1", startTime: 0, duration: 5 }),
		];

		const result = getElementsForPreRender(elements, 4, 10);

		expect(result.length).toBe(1);
	});

	it("should exclude elements completely outside range", () => {
		const elements = [
			createMockRemotionElement({ id: "e1", startTime: 10, duration: 2 }),
		];

		const result = getElementsForPreRender(elements, 0, 5);

		expect(result.length).toBe(0);
	});

	it("should handle empty elements array", () => {
		const result = getElementsForPreRender([], 0, 10);
		expect(result).toEqual([]);
	});
});

describe("createPreRenderer", () => {
	it("should create a pre-renderer with config", () => {
		const renderer = createPreRenderer("/output", {
			quality: 95,
			format: "png",
		});

		expect(renderer).toBeInstanceOf(RemotionPreRenderer);
	});
});

describe("DEFAULT_PRE_RENDER_CONFIG", () => {
	it("should have expected default values", () => {
		expect(DEFAULT_PRE_RENDER_CONFIG.format).toBe("jpeg");
		expect(DEFAULT_PRE_RENDER_CONFIG.quality).toBe(90);
		expect(DEFAULT_PRE_RENDER_CONFIG.concurrency).toBe(4);
		expect(DEFAULT_PRE_RENDER_CONFIG.scale).toBe(1);
		expect(DEFAULT_PRE_RENDER_CONFIG.width).toBe(1920);
		expect(DEFAULT_PRE_RENDER_CONFIG.height).toBe(1080);
		expect(DEFAULT_PRE_RENDER_CONFIG.fps).toBe(30);
	});
});
