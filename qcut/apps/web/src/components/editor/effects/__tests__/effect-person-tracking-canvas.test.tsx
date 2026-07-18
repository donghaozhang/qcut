import type { EffectRenderProgram } from "@qcut/editor-core";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EffectPersonTrackingCanvas } from "../effect-person-tracking-canvas";

const clientMocks = vi.hoisted(() => ({
	dispose: vi.fn(),
	segment: vi.fn(),
}));

vi.mock("@/lib/segmentation/person-cutout-client", () => ({
	PersonCutoutClient: class PersonCutoutClientMock {
		dispose = clientMocks.dispose;
		segment = clientMocks.segment;
	},
}));

function personProgram({
	treatment,
}: {
	treatment: "outline" | "spotlight";
}): EffectRenderProgram {
	return {
		version: 1,
		stages: [
			{
				kind: "person-tracking",
				target: "person",
				treatment,
				fallback: "full-frame",
			},
		],
	};
}

function createContext(): CanvasRenderingContext2D {
	return {
		clearRect: vi.fn(),
		drawImage: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

describe("EffectPersonTrackingCanvas", () => {
	beforeEach(() => {
		clientMocks.dispose.mockReset();
		clientMocks.segment.mockReset();
		clientMocks.segment.mockImplementation(
			() => new Promise<never>(() => undefined)
		);
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
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn(async () => ({}))
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
			createContext()
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("starts a new lifecycle while the previous inference is pending", async () => {
		const { rerender } = render(
			<div>
				<canvas data-testid="color-preview-canvas" height={90} width={160} />
				<EffectPersonTrackingCanvas
					fitMode="cover"
					program={personProgram({ treatment: "outline" })}
					sourceSelector="video"
				/>
			</div>
		);
		await waitFor(() => expect(clientMocks.segment).toHaveBeenCalledTimes(1));

		rerender(
			<div>
				<canvas data-testid="color-preview-canvas" height={90} width={160} />
				<EffectPersonTrackingCanvas
					fitMode="cover"
					program={personProgram({ treatment: "spotlight" })}
					sourceSelector="video"
				/>
			</div>
		);

		await waitFor(() => expect(clientMocks.segment).toHaveBeenCalledTimes(2));
	});
});
