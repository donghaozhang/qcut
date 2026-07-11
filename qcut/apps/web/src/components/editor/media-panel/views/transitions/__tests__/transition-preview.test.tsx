import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransitionPreview } from "../transition-preview";
import { getTransitionPresetById } from "../transition-presets";

function requirePreset(presetId: string) {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) {
		throw new Error(`Missing preset fixture: ${presetId}`);
	}
	return preset;
}

const dissolve = requirePreset("dissolve");
const slideLeft = requirePreset("slide-left");
const zoomBlur = requirePreset("zoom-blur");

let nextRafId: number;
let rafCallbacks: Map<number, FrameRequestCallback>;
let cancelledIds: number[];

function runFrame(timestamp: number) {
	const entry = rafCallbacks.entries().next().value;
	if (!entry) {
		throw new Error("No animation frame scheduled");
	}
	const [id, callback] = entry;
	rafCallbacks.delete(id);
	act(() => callback(timestamp));
}

function getLayers(container: HTMLElement) {
	const layers = container.querySelectorAll<HTMLDivElement>(
		"div.absolute.inset-0"
	);
	return { from: layers[0], to: layers[1] };
}

function getProgressFill(container: HTMLElement) {
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
		expect(sources).toEqual([
			"/images/filter-previews/coastal.webp",
			"/images/filter-previews/golden-hour.webp",
		]);
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
		const fill = getProgressFill(container);

		expect(rafCallbacks.size).toBe(1);

		runFrame(1000);
		expect(fill.style.width).toBe("0%");

		// dissolve duration is max(400, 0.5s) = 500ms; 250ms in => 50%
		runFrame(1250);
		expect(fill.style.width).toBe("50%");

		const { from, to } = getLayers(container);
		expect(from.style.opacity).toBe("0.5");
		expect(to.style.opacity).toBe("0.5");
	});

	it("wraps the loop progress after the duration elapses", () => {
		const { container } = render(
			<TransitionPreview preset={dissolve} isPlaying={true} />
		);

		runFrame(1000);
		// 625ms elapsed of a 500ms loop => 125ms into the second pass => 25%
		runFrame(1625);

		expect(getProgressFill(container).style.width).toBe("25%");
	});

	it("cancels the animation and resets progress when playback stops", () => {
		const { container, rerender } = render(
			<TransitionPreview preset={dissolve} isPlaying={true} />
		);
		runFrame(1000);
		runFrame(1250);
		expect(getProgressFill(container).style.width).toBe("50%");

		rerender(<TransitionPreview preset={dissolve} isPlaying={false} />);

		expect(cancelledIds.length).toBeGreaterThan(0);
		expect(rafCallbacks.size).toBe(0);
		expect(getProgressFill(container).style.width).toBe("0%");
	});

	it("offsets slide layers with a transform", () => {
		const { container } = render(
			<TransitionPreview preset={slideLeft} isPlaying={false} />
		);

		const { from, to } = getLayers(container);
		expect(from.style.transform).toBe("translate3d(0px, 0px, 0)");
		expect(to.style.transform).toBe("translate3d(-240px, 0px, 0)");
	});

	it("falls back to a dissolve preview for presets without a clip config", () => {
		const { container } = render(
			<TransitionPreview preset={zoomBlur} isPlaying={false} />
		);

		const { from, to } = getLayers(container);
		expect(from.style.opacity).toBe("1");
		expect(to.style.opacity).toBe("0");
	});
});
