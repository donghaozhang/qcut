import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransitionPreview } from "../transition-preview";
import { getTransitionPresetById } from "../transition-presets";

function requirePreset({ presetId }: { presetId: string }) {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) {
		throw new Error(`Missing preset fixture: ${presetId}`);
	}
	return preset;
}

const dissolve = requirePreset({ presetId: "dissolve" });
const slideLeft = requirePreset({ presetId: "slide-left" });
const zoomBlur = requirePreset({ presetId: "zoom-blur" });
const pixelCollapse = requirePreset({ presetId: "pixel-collapse" });
const pageFlipLeft = requirePreset({ presetId: "page-flip-left" });
const inkBleed = requirePreset({ presetId: "ink-bleed" });

let nextRafId: number;
let rafCallbacks: Map<number, FrameRequestCallback>;
let cancelledIds: number[];

function runFrame({ timestamp }: { timestamp: number }) {
	const entry = rafCallbacks.entries().next().value;
	if (!entry) {
		throw new Error("No animation frame scheduled");
	}
	const [id, callback] = entry;
	rafCallbacks.delete(id);
	act(() => callback(timestamp));
}

function getLayers({ container }: { container: HTMLElement }) {
	const layers = [
		...container.querySelectorAll<HTMLDivElement>("div.absolute.inset-0"),
	];
	const from = layers.at(0);
	const to = layers.at(1);
	if (!from || !to) {
		throw new Error("Preview layers not rendered");
	}
	return { from, to };
}

function getProgressFill({ container }: { container: HTMLElement }) {
	const fill = container.querySelector<HTMLDivElement>(
		'[class*="bg-white/25"] > div'
	);
	if (!fill) {
		throw new Error("Progress fill not rendered");
	}
	return fill;
}

describe("TransitionPreview", () => {
	beforeEach(() => {
		nextRafId = 1;
		rafCallbacks = new Map();
		cancelledIds = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = nextRafId++;
			rafCallbacks.set(id, callback);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => {
			cancelledIds.push(id);
			rafCallbacks.delete(id);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("renders fallback preview art when no sources are provided", () => {
		const { container } = render(
			<TransitionPreview preset={dissolve} isPlaying={false} />
		);

		const sources = Array.from(container.querySelectorAll("img")).map((img) =>
			img.getAttribute("src")
		);
		expect(sources).toEqual([dissolve.preview.from, dissolve.preview.to]);
		expect(rafCallbacks.size).toBe(0);
	});

	it("prefers provided clip thumbnails over the fallback art", () => {
		const { container } = render(
			<TransitionPreview
				preset={dissolve}
				isPlaying={false}
				sources={{ from: "blob:thumb-a", to: "blob:thumb-b" }}
			/>
		);

		const sources = Array.from(container.querySelectorAll("img")).map((img) =>
			img.getAttribute("src")
		);
		expect(sources).toEqual(["blob:thumb-a", "blob:thumb-b"]);
	});

	it("advances the dissolve animation while playing", () => {
		const { container } = render(
			<TransitionPreview preset={dissolve} isPlaying={true} />
		);
		const fill = getProgressFill({ container });

		expect(rafCallbacks.size).toBe(1);

		runFrame({ timestamp: 1000 });
		expect(fill.style.width).toBe("0%");

		// dissolve duration is max(400, 0.5s) = 500ms; 250ms in => 50%
		runFrame({ timestamp: 1250 });
		expect(fill.style.width).toBe("50%");

		const { from, to } = getLayers({ container });
		expect(from.style.opacity).toBe("0.5");
		expect(to.style.opacity).toBe("0.5");
	});

	it("wraps the loop progress after the duration elapses", () => {
		const { container } = render(
			<TransitionPreview preset={dissolve} isPlaying={true} />
		);

		runFrame({ timestamp: 1000 });
		// 625ms elapsed of a 500ms loop => 125ms into the second pass => 25%
		runFrame({ timestamp: 1625 });

		expect(getProgressFill({ container }).style.width).toBe("25%");
	});

	it("cancels the animation and resets progress when playback stops", () => {
		const { container, rerender } = render(
			<TransitionPreview preset={dissolve} isPlaying={true} />
		);
		runFrame({ timestamp: 1000 });
		runFrame({ timestamp: 1250 });
		expect(getProgressFill({ container }).style.width).toBe("50%");

		rerender(<TransitionPreview preset={dissolve} isPlaying={false} />);

		expect(cancelledIds.length).toBeGreaterThan(0);
		expect(rafCallbacks.size).toBe(0);
		expect(getProgressFill({ container }).style.width).toBe("0%");
	});

	it("offsets slide layers with a transform", () => {
		const { container } = render(
			<TransitionPreview preset={slideLeft} isPlaying={false} />
		);

		const { from, to } = getLayers({ container });
		expect(from.style.transform).toContain("translate3d(0px, 0px, 0)");
		expect(to.style.transform).toContain("translate3d(-240px, 0px, 0)");
		expect(to.style.transform).toContain("rotateY(0deg)");
	});

	it("renders zoom blur through the shared presentation", () => {
		const { container } = render(
			<TransitionPreview preset={zoomBlur} isPlaying={true} />
		);

		runFrame({ timestamp: 1000 });
		runFrame({ timestamp: 1275 });

		const { from, to } = getLayers({ container });
		expect(from.style.filter).toContain("blur(10.2px)");
		expect(from.style.transform).toContain("scale(1.153)");
		expect(to.style.opacity).toBe("0.5");
	});

	it("renders pixel scaling and 3D page transforms through shared helpers", () => {
		const pixelRender = render(
			<TransitionPreview preset={pixelCollapse} isPlaying={true} />
		);
		runFrame({ timestamp: 1000 });
		runFrame({ timestamp: 1250 });
		const pixelImage = pixelRender.container.querySelector("img");
		expect(pixelImage?.style.imageRendering).toBe("pixelated");
		pixelRender.unmount();

		const pageRender = render(
			<TransitionPreview preset={pageFlipLeft} isPlaying={true} />
		);
		runFrame({ timestamp: 2000 });
		runFrame({ timestamp: 2250 });
		const { to } = getLayers({ container: pageRender.container });
		expect(to.style.transform).toContain("perspective(900px)");
		expect(to.style.transform).toContain("rotateY(");
	});

	it("preserves shaped masks in the animated card preview", () => {
		const { container } = render(
			<TransitionPreview preset={inkBleed} isPlaying={true} />
		);

		runFrame({ timestamp: 1000 });
		runFrame({ timestamp: 1400 });

		const { to } = getLayers({ container });
		expect(to.style.maskImage).toContain("radial-gradient");
		expect(to.style.maskImage).not.toContain("repeating-conic-gradient");
	});
});
