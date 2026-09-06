import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_PERSPECTIVE,
	effectiveMediaKeyframes,
	getMediaPropertyValue,
	resolveMediaKeyframes,
	resolveMediaVisualProperties,
} from "../video-properties";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip-1",
		type: "media",
		name: "clip",
		mediaId: "media-1",
		startTime: 0,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		opacity: 0.4,
		blendMode: "multiply",
		perspective: { ...DEFAULT_MEDIA_PERSPECTIVE, topLeftX: 0.3, topLeftY: 0.2 },
		...overrides,
	} as MediaElement;
}

/**
 * The 混合 / 变形 section checkboxes are resolved once, here, so every consumer
 * (preview CSS, canvas export, CLI payload) inherits the same effective values.
 */
describe("media section toggles", () => {
	it("keeps values live while a section is enabled or unset", () => {
		for (const enabled of [undefined, true]) {
			const visual = resolveMediaVisualProperties(
				element({ blendEnabled: enabled, perspectiveEnabled: enabled })
			);
			expect(visual.opacity).toBe(0.4);
			expect(visual.blendMode).toBe("multiply");
			expect(visual.perspective.topLeftX).toBe(0.3);
		}
	});

	it("neutralizes blend and warp when their sections are switched off", () => {
		const visual = resolveMediaVisualProperties(
			element({ blendEnabled: false, perspectiveEnabled: false })
		);
		expect(visual.opacity).toBe(1);
		expect(visual.blendMode).toBe("normal");
		expect(visual.perspective).toEqual(DEFAULT_MEDIA_PERSPECTIVE);
	});

	it("lets a disabled section override its own keyframes", () => {
		const keyframed = element({
			blendEnabled: false,
			perspectiveEnabled: false,
			keyframes: {
				opacity: [
					{ id: "o0", frame: 0, value: 0.1, easing: "linear" },
					{ id: "o1", frame: 60, value: 0.9, easing: "linear" },
				],
				topLeftX: [
					{ id: "p0", frame: 0, value: 0, easing: "linear" },
					{ id: "p1", frame: 60, value: 0.5, easing: "linear" },
				],
			},
		});
		const off = resolveMediaKeyframes({
			element: keyframed,
			currentTime: 1,
			fps: 30,
		});
		expect(off.opacity).toBe(1);
		expect(off.perspective.topLeftX).toBe(0);

		const on = resolveMediaKeyframes({
			element: { ...keyframed, blendEnabled: true, perspectiveEnabled: true },
			currentTime: 1,
			fps: 30,
		});
		expect(on.opacity).toBeCloseTo(0.5);
		expect(on.perspective.topLeftX).toBeCloseTo(0.25);
	});

	it("keeps stored values visible to editors while a section is off", () => {
		const off = element({ blendEnabled: false, perspectiveEnabled: false });
		const editor = resolveMediaVisualProperties(off, {
			applySectionToggles: false,
		});
		expect(editor.opacity).toBe(0.4);
		expect(editor.blendMode).toBe("multiply");
		expect(editor.perspective.topLeftX).toBe(0.3);
		expect(getMediaPropertyValue(off, "opacity")).toBe(0.4);
		expect(getMediaPropertyValue(off, "topLeftX")).toBe(0.3);
	});

	it("drops the keyframes of a switched-off section from export payloads", () => {
		const keyframes = {
			opacity: [{ id: "o", frame: 0, value: 0.2, easing: "linear" as const }],
			topLeftX: [{ id: "p", frame: 0, value: 0.5, easing: "linear" as const }],
			x: [{ id: "x", frame: 0, value: 10, easing: "linear" as const }],
		};
		expect(effectiveMediaKeyframes(element({ keyframes }))).toBe(keyframes);
		expect(
			effectiveMediaKeyframes(element({ keyframes, blendEnabled: false }))
		).toEqual({ topLeftX: keyframes.topLeftX, x: keyframes.x });
		expect(
			effectiveMediaKeyframes(element({ keyframes, perspectiveEnabled: false }))
		).toEqual({ opacity: keyframes.opacity, x: keyframes.x });
		expect(effectiveMediaKeyframes(element({ keyframes: undefined }))).toBe(
			undefined
		);
	});
});
