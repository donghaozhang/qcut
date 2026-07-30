import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	type TextAnimationEffect,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createLayout,
} from "./text-animation-test-helpers.js";

function burstEffect(
	overrides: Partial<Extract<TextAnimationEffect, { kind: "burst" }>> = {}
): TextAnimationEffect {
	return {
		kind: "burst",
		shape: "ribbon",
		count: 24,
		speed: { value: 4, unit: "em" },
		directionDeg: 0,
		spreadDeg: 90,
		gravity: { value: 2, unit: "em" },
		lifeRandom: 0.4,
		sizeEm: 0.25,
		sizeRandom: 0.4,
		palette: ["#f43f5e", "#facc15", "#3b82f6"],
		flutter: 0.6,
		seed: 11,
		...overrides,
	};
}

function evaluateBurstFrame({
	frame,
	fps = 10,
}: {
	frame: number;
	fps?: number;
}) {
	const element = createElement({
		overrides: {
			content: "AB",
			textAnimations: createAnimation({
				entrance: {
					timing: { duration: 1, delay: 0, easing: "linear" },
					sequence: { unit: "all", order: "forward", staggerRatio: 0, seed: 1 },
					target: "textAndBackground",
					effect: burstEffect(),
				},
			}),
		},
	});
	const compiled = compileTextAnimation({ element, fps });
	return evaluateTextAnimationFrame({
		compiled,
		frame,
		layout: createLayout({ content: element.content }),
	});
}

describe("burst sprite particles", () => {
	it("emits one particles decoration with deterministic items", () => {
		const first = evaluateBurstFrame({ frame: 5 });
		const second = evaluateBurstFrame({ frame: 5 });
		const decoration = first.decorations.find(
			(item) => item.kind === "particles"
		);
		expect(decoration?.kind).toBe("particles");
		if (decoration?.kind !== "particles") return;
		expect(decoration.shape).toBe("ribbon");
		expect(decoration.items.length).toBeGreaterThan(4);
		expect(second.decorations).toEqual(first.decorations);
	});

	it("gives every particle its own trajectory and clamps color indices", () => {
		const state = evaluateBurstFrame({ frame: 5 });
		const decoration = state.decorations.find(
			(item) => item.kind === "particles"
		);
		if (decoration?.kind !== "particles") throw new Error("missing particles");
		const positions = new Set(
			decoration.items.map(
				(item) => `${item.x.toFixed(3)},${item.y.toFixed(3)}`
			)
		);
		expect(positions.size).toBe(decoration.items.length);
		for (const item of decoration.items) {
			expect(item.colorIndex).toBeGreaterThanOrEqual(0);
			expect(item.colorIndex).toBeLessThan(decoration.palette.length);
			expect(item.opacity).toBeGreaterThan(0);
			expect(item.opacity).toBeLessThanOrEqual(1);
		}
	});

	it("keeps the container visual untouched while particles fly", () => {
		const state = evaluateBurstFrame({ frame: 5 });
		expect(state.container.opacity).toBe(1);
		expect(state.container.translateX).toBe(0);
		expect(state.container.translateY).toBe(0);
	});

	it("fades every particle out before the phase ends", () => {
		// Lives used to run past progress 1, so particles were still near full
		// opacity when the phase stopped emitting and vanished in one frame.
		const lastFrame = evaluateBurstFrame({ frame: 29, fps: 30 });
		const decoration = lastFrame.decorations.find(
			(item) => item.kind === "particles"
		);
		if (decoration?.kind !== "particles") throw new Error("missing particles");
		// Worst-case residual is one frame of the fade ramp for the latest-born
		// particle: (1/fps) / (0.3 * (1 - maxBirth)) ≈ 0.17 at 30fps.
		for (const item of decoration.items) {
			expect(item.opacity).toBeLessThan(0.2);
		}
		// Mid-phase the same emitter is bright, so the tail is a real fade and
		// not just an empty frame.
		const midFrame = evaluateBurstFrame({ frame: 12, fps: 30 });
		const mid = midFrame.decorations.find((item) => item.kind === "particles");
		if (mid?.kind !== "particles") throw new Error("missing particles");
		expect(Math.max(...mid.items.map((item) => item.opacity))).toBeGreaterThan(
			0.8
		);
	});

	it("has no live particles at the very start of the phase", () => {
		const state = evaluateBurstFrame({ frame: 0 });
		expect(
			state.decorations.filter((item) => item.kind === "particles")
		).toEqual([]);
	});
});
