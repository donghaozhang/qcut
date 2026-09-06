import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyWaveEffect,
	releaseDistortionScratchCanvas,
} from "../effects-canvas-advanced";

interface CanvasCounter {
	created: number;
}

interface RecordedDraw {
	source: string;
	args: number[];
}

/**
 * Minimal 2D context stub that records draws, so the test can assert the wave
 * pass still samples from an untouched copy of the frame.
 */
function createStubContext({
	canvas,
	draws,
}: {
	canvas: HTMLCanvasElement;
	draws: RecordedDraw[];
}): CanvasRenderingContext2D {
	return {
		canvas,
		clearRect: vi.fn(),
		drawImage: vi.fn((source: { __name?: string }, ...args: number[]) => {
			draws.push({ args, source: source.__name ?? "unknown" });
		}),
		restore: vi.fn(),
		save: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

function stubCanvasFactory({ counter }: { counter: CanvasCounter }) {
	const original = document.createElement.bind(document);
	const factory = (tag: string) => {
		if (tag !== "canvas") return original(tag as "div");
		counter.created += 1;
		const draws: RecordedDraw[] = [];
		const element = {
			__name: `scratch-${counter.created}`,
			height: 0,
			width: 0,
		} as unknown as HTMLCanvasElement;
		Object.defineProperty(element, "getContext", {
			value: () => createStubContext({ canvas: element, draws }),
		});
		return element;
	};
	return vi
		.spyOn(document, "createElement")
		.mockImplementation(factory as unknown as typeof document.createElement);
}

function destinationContext({ draws }: { draws: RecordedDraw[] }) {
	const canvas = {
		__name: "destination",
		height: 180,
		width: 320,
	} as unknown as HTMLCanvasElement;
	return createStubContext({ canvas, draws });
}

describe("wave distortion scratch canvas", () => {
	const counter: CanvasCounter = { created: 0 };
	let spy: ReturnType<typeof stubCanvasFactory>;

	beforeEach(() => {
		counter.created = 0;
		releaseDistortionScratchCanvas();
		spy = stubCanvasFactory({ counter });
	});

	afterEach(() => {
		spy.mockRestore();
		releaseDistortionScratchCanvas();
	});

	it("allocates one scratch canvas for many frames", () => {
		const draws: RecordedDraw[] = [];
		for (let frame = 0; frame < 30; frame += 1) {
			applyWaveEffect(destinationContext({ draws }), 12, 3);
		}

		// One allocation for thirty frames. Before this reuse the pass built a
		// full-resolution canvas on every exported frame.
		expect(counter.created).toBe(1);
	});

	it("reallocates when the frame size changes", () => {
		const draws: RecordedDraw[] = [];
		applyWaveEffect(destinationContext({ draws }), 12, 3);

		const taller = createStubContext({
			canvas: {
				__name: "destination-tall",
				height: 360,
				width: 640,
			} as unknown as HTMLCanvasElement,
			draws,
		});
		applyWaveEffect(taller, 12, 3);

		// Proves the counter tracks real allocation rather than always reading 1.
		expect(counter.created).toBe(2);
	});

	it("draws every row from the untouched copy", () => {
		const draws: RecordedDraw[] = [];
		const ctx = destinationContext({ draws });

		applyWaveEffect(ctx, 12, 3);

		// One row per scanline, each sampled from the scratch copy, so the
		// distortion still reads pre-distortion pixels.
		const rowDraws = draws.filter((draw) => draw.source.startsWith("scratch"));
		expect(rowDraws).toHaveLength(180);
		expect(rowDraws[0].args).toHaveLength(8);
	});
});
