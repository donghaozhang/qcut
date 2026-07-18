import type { EffectRenderProgram } from "@qcut/editor-core";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EffectCompositeCanvas } from "../effect-composite-canvas";

function createContext(): CanvasRenderingContext2D {
	return {
		beginPath: vi.fn(),
		clearRect: vi.fn(),
		clip: vi.fn(),
		drawImage: vi.fn(),
		fillRect: vi.fn(),
		rect: vi.fn(),
		restore: vi.fn(),
		save: vi.fn(),
		scale: vi.fn(),
		translate: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

describe("EffectCompositeCanvas", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders every composite stage in declared order", () => {
		class ResizeObserverMock {
			disconnect() {}
			observe() {}
			unobserve() {}
		}
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1)
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			function (this: HTMLCanvasElement) {
				const existingContext = contexts.get(this);
				if (existingContext) return existingContext;
				const context = createContext();
				contexts.set(this, context);
				return context;
			} as unknown as HTMLCanvasElement["getContext"]
		);
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{
					kind: "composite",
					layout: "split-vertical",
					copies: 2,
					gap: 0,
				},
				{ kind: "composite", layout: "grid", copies: 4, gap: 0 },
			],
		};
		const { container } = render(
			<div>
				<canvas data-testid="color-preview-canvas" height={90} width={160} />
				<EffectCompositeCanvas
					fitMode="cover"
					program={program}
					sourceSelector="video"
				/>
			</div>
		);
		const source = container.querySelector<HTMLCanvasElement>(
			'[data-testid="color-preview-canvas"]'
		);
		const output = container.querySelector<HTMLCanvasElement>(
			"canvas[data-effect-composite-layout]"
		);
		if (!(source && output)) throw new Error("Expected composite canvases");
		const drawImage = contexts.get(output)?.drawImage;
		if (!drawImage) throw new Error("Expected output canvas context");

		expect(output).toHaveAttribute(
			"data-effect-composite-layout",
			"split-vertical,grid"
		);
		expect(drawImage).toHaveBeenCalledTimes(6);
		expect(vi.mocked(drawImage).mock.calls.slice(0, 2)).toEqual([
			expect.arrayContaining([source]),
			expect.arrayContaining([source]),
		]);
		for (const call of vi.mocked(drawImage).mock.calls.slice(2)) {
			expect(call[0]).toBeInstanceOf(HTMLCanvasElement);
			expect(call[0]).not.toBe(source);
			expect(call[0]).not.toBe(output);
		}
	});
});
