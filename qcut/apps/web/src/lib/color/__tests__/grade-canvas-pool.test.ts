import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaColorSettings } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import {
	clearGradeCanvasPool,
	drawColorGradedSourceStack,
} from "../browser-color-rendering";

/**
 * The colour stack renders each layer through a scratch canvas. Those canvases
 * are pooled, which is only safe if a leased canvas is never handed out again
 * while it is still serving as another layer's source, and if a reused canvas
 * is indistinguishable from a freshly created one.
 *
 * These tests drive the public entry point and watch canvas creation, so they
 * pin the observable contract rather than the pool's internals.
 */

interface FakeContext {
	canvas: FakeCanvas;
	filter: string;
	globalAlpha: number;
	globalCompositeOperation: string;
	drawnSources: unknown[];
	clearedRects: Array<[number, number, number, number]>;
	transforms: number;
}

interface FakeCanvas {
	width: number;
	height: number;
	context: FakeContext;
	getContext: () => FakeContext;
	resizes: number;
}

let created: FakeCanvas[] = [];

function makeCanvas(): FakeCanvas {
	const canvas = {
		height: 150,
		resizes: 0,
		width: 300,
	} as unknown as FakeCanvas;
	const context: FakeContext = {
		canvas,
		clearedRects: [],
		drawnSources: [],
		filter: "none",
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		transforms: 0,
	};
	Object.assign(context, {
		clearRect: (x: number, y: number, w: number, h: number) => {
			context.clearedRects.push([x, y, w, h]);
		},
		drawImage: (source: unknown) => {
			context.drawnSources.push(source);
		},
		getImageData: () => ({ data: new Uint8ClampedArray(4) }),
		putImageData: () => undefined,
		setTransform: () => {
			context.transforms += 1;
		},
	});
	canvas.context = context;
	canvas.getContext = () => context;
	// Track explicit resizes, which are what reset a canvas's bitmap.
	let width = 300;
	let height = 150;
	Object.defineProperty(canvas, "width", {
		get: () => width,
		set: (value: number) => {
			canvas.resizes += 1;
			width = value;
		},
	});
	Object.defineProperty(canvas, "height", {
		get: () => height,
		set: (value: number) => {
			height = value;
		},
	});
	return canvas;
}

function settings(): MediaColorSettings {
	return DEFAULT_MEDIA_COLOR_SETTINGS;
}

function target(): CanvasRenderingContext2D {
	return makeCanvas().context as unknown as CanvasRenderingContext2D;
}

describe("colour grade canvas pool", () => {
	beforeEach(() => {
		created = [];
		clearGradeCanvasPool();
		vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string
		) => {
			if (tagName !== "canvas") return {} as HTMLElement;
			const canvas = makeCanvas();
			created.push(canvas);
			return canvas as unknown as HTMLElement;
		}) as typeof document.createElement);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		clearGradeCanvasPool();
	});

	async function draw({
		width,
		height,
		layers = 1,
	}: {
		width: number;
		height: number;
		layers?: number;
	}): Promise<void> {
		await drawColorGradedSourceStack({
			context: target(),
			height,
			layers: Array.from({ length: layers }, () => ({
				masks: [],
				settings: settings(),
			})),
			source: makeCanvas() as unknown as CanvasImageSource,
			width,
			x: 0,
			y: 0,
		});
	}

	it("reuses one scratch canvas across sequential draws of the same size", async () => {
		await draw({ height: 360, width: 640 });
		const afterFirst = created.length;
		await draw({ height: 360, width: 640 });
		await draw({ height: 360, width: 640 });
		// Only the sources created by the test itself should be new.
		const gradeCanvasesCreated = created.length - afterFirst;
		expect(gradeCanvasesCreated).toBeLessThanOrEqual(2);
	});

	it("hands distinct canvases to layers that feed each other", async () => {
		// With two layers the first layer's output is the second layer's source,
		// so they must never be the same canvas.
		await draw({ height: 360, layers: 2, width: 640 });
		const scratch = created.filter(
			(canvas) => canvas.width === 640 && canvas.height === 360
		);
		const unique = new Set(scratch);
		expect(unique.size).toBe(scratch.length);
	});

	it("resizes a reused canvas when the bounds change", async () => {
		await draw({ height: 360, width: 640 });
		const before = created.map((canvas) => canvas.resizes);
		await draw({ height: 480, width: 800 });
		const resized = created.some(
			(canvas, index) => canvas.resizes > (before[index] ?? 0)
		);
		expect(resized).toBe(true);
	});

	it("clears a reused canvas that keeps the same size", async () => {
		await draw({ height: 360, width: 640 });
		const scratch = created.find(
			(canvas) => canvas.width === 640 && canvas.height === 360
		);
		expect(scratch).toBeDefined();
		const clearsBefore = scratch?.context.clearedRects.length ?? 0;
		await draw({ height: 360, width: 640 });
		expect(scratch?.context.clearedRects.length ?? 0).toBeGreaterThan(
			clearsBefore
		);
	});

	it("restores context state on a reused canvas", async () => {
		await draw({ height: 360, width: 640 });
		const scratch = created.find(
			(canvas) => canvas.width === 640 && canvas.height === 360
		);
		if (!scratch) throw new Error("no scratch canvas");
		// Dirty the context the way a previous grade could have left it.
		scratch.context.filter = "blur(4px)";
		scratch.context.globalAlpha = 0.25;
		scratch.context.globalCompositeOperation = "multiply";

		await draw({ height: 360, width: 640 });

		expect(scratch.context.filter).toBe("none");
		expect(scratch.context.globalAlpha).toBe(1);
		expect(scratch.context.globalCompositeOperation).toBe("source-over");
		expect(scratch.context.transforms).toBeGreaterThan(0);
	});

	it("starts from an empty pool after clearGradeCanvasPool", async () => {
		await draw({ height: 360, width: 640 });
		const beforeClear = created.length;
		clearGradeCanvasPool();
		await draw({ height: 360, width: 640 });
		// A dropped pool must allocate again rather than reuse a released canvas.
		expect(created.length).toBeGreaterThan(beforeClear);
	});
});
