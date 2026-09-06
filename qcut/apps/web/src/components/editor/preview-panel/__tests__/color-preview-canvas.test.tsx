import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawColorGradedSourceStack } from "@/lib/color/browser-color-rendering";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import type { MediaColorSettings } from "@/types/timeline";
import { ColorPreviewCanvas } from "../color-preview-canvas";

vi.mock("@/lib/color/browser-color-rendering", () => ({
	drawColorGradedSourceStack: vi.fn(),
}));
vi.mock("@/stores/editor/color-picker-store", () => ({
	useColorPickerStore: (
		select: (state: { active: boolean; complete: () => void }) => unknown
	) => select({ active: false, complete: vi.fn() }),
}));
vi.mock("@/stores/editor/color-preview-store", () => ({
	useColorPreviewStore: (select: (state: { bypassed: boolean }) => unknown) =>
		select({ bypassed: false }),
}));
vi.mock("@/lib/color/color-degradation", () => ({
	subscribeColorDegradation: () => () => {},
}));

const resourceId = "7447126702137904420";
const masks: [] = [];
const settings = ({
	intensity,
}: {
	intensity: number;
}): MediaColorSettings => ({
	...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
	multiPass: {
		enabled: true,
		name: "电影柔光 · QCut CPU",
		intensity,
		presetId: "soft-glow-ui-snapshot",
		fidelity: "native-local",
		passes: [],
		nativeEffect: {
			provider: "qcut-cpu-soft-glow-ui-snapshot-v1",
			resourceId,
			version: "9673f80b8e2f5a07f02f9ce1130b784a",
		},
	},
});
function view({ intensity }: { intensity: number }) {
	return (
		<div>
			<img src="test.png" alt="source" />
			<ColorPreviewCanvas
				sourceSelector="img"
				settings={settings({ intensity })}
				masks={masks}
				fitMode="fill"
				frameSeed={0}
			/>
		</div>
	);
}
let pending: Array<() => void>;
let active: number;
let peak: number;
let rejected: number;
let started: number[];
beforeEach(() => {
	vi.clearAllMocks();
	pending = [];
	active = 0;
	peak = 0;
	rejected = 0;
	started = [];
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		}
	);
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn(() => 1)
	);
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get: () => 480,
	});
	Object.defineProperty(HTMLElement.prototype, "clientHeight", {
		configurable: true,
		get: () => 270,
	});
	for (const name of ["complete", "naturalWidth", "naturalHeight"]) {
		Object.defineProperty(HTMLImageElement.prototype, name, {
			configurable: true,
			get: () => (name === "complete" ? true : 1),
		});
	}
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: function (this: HTMLCanvasElement) {
			const canvas = this;
			return {
				canvas,
				clearRect: vi.fn(),
				drawImage: vi.fn((source: CanvasImageSource) => {
					if (source instanceof HTMLCanvasElement)
						canvas.dataset.paintedIntensity = source.dataset.paintedIntensity;
				}),
			};
		},
	});
	vi.mocked(drawColorGradedSourceStack).mockImplementation(
		({ context, layers }) => {
			const intensity = layers[0].settings.multiPass!.intensity;
			if (active >= 4) {
				rejected += 1;
				return Promise.reject(
					new Error("Independent cinematic soft glow provider is busy.")
				);
			}
			active += 1;
			peak = Math.max(peak, active);
			started.push(intensity);
			return new Promise<void>((resolve) => {
				pending.push(() => {
					active -= 1;
					context.canvas.dataset.paintedIntensity = String(intensity);
					resolve();
				});
			});
		}
	);
});

async function completePending({
	rounds = 5,
}: {
	rounds?: number;
} = {}): Promise<void> {
	await act(async () => {
		for (const complete of pending.splice(0)) complete();
	});
	if (rounds > 1) await completePending({ rounds: rounds - 1 });
}

describe("color preview async commits", () => {
	it("serializes across effects and paints the latest intensity after a rapid paused update", async () => {
		const { rerender } = render(view({ intensity: 0 }));
		await completePending();
		const canvas = screen.getByTestId("color-preview-canvas");
		expect(canvas.dataset.renderedColorResources).toBe(`${resourceId}:0`);
		await act(async () => rerender(view({ intensity: 10 })));
		await act(async () => rerender(view({ intensity: 20 })));
		await act(async () => rerender(view({ intensity: 30 })));
		await act(async () => rerender(view({ intensity: 37 })));
		await act(async () => rerender(view({ intensity: 37 })));
		await completePending();
		expect(canvas.dataset.renderedColorResources).toBe(`${resourceId}:37`);
		expect(canvas.dataset.paintedIntensity).toBe("37");
		expect(peak).toBe(1);
		expect(rejected).toBe(0);
		expect(started).toEqual([0, 10, 37]);
	});
	it("does not submit queued work or paint after unmount", async () => {
		const { rerender, unmount } = render(view({ intensity: 10 }));
		await act(async () => {});
		await act(async () => rerender(view({ intensity: 37 })));
		const canvas = screen.getByTestId("color-preview-canvas");
		unmount();
		await completePending();
		expect(started).toEqual([10]);
		expect(canvas.dataset.renderedColorResources).toBeUndefined();
	});
});
