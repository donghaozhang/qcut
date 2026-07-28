import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	type TextAnimationOrder,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createPhase,
} from "./text-animation-test-helpers.js";

describe("text animation compilation", () => {
	it("uses trim-aware, frame-exact visible boundaries", () => {
		const compiled = compileTextAnimation({
			element: createElement({
				overrides: {
					startTime: 0.01,
					duration: 2,
					trimStart: 0.1,
					trimEnd: 0.2,
				},
			}),
			fps: 30,
		});

		expect(compiled.visibleStartFrame).toBe(4);
		expect(compiled.visibleEndFrame).toBe(55);
	});

	it("fits entrance and exit into a one-frame clip deterministically", () => {
		const fade = createPhase({ effect: { kind: "fade", minimumOpacity: 0 } });
		const compiled = compileTextAnimation({
			element: createElement({
				overrides: {
					duration: 0.1,
					textAnimations: createAnimation({ entrance: fade, exit: fade }),
				},
			}),
			fps: 10,
		});

		expect(compiled.entrance).toMatchObject({
			startFrame: 0,
			endFrame: 1,
			durationFrames: 1,
		});
		expect(compiled.exit).toMatchObject({
			startFrame: 0,
			endFrame: 1,
			durationFrames: 1,
		});
	});

	it("compiles every sequence order and keeps random order deterministic", () => {
		const compileOrder = ({ order }: { order: TextAnimationOrder }) =>
			compileTextAnimation({
				element: createElement({
					overrides: {
						content: "ABCD",
						textAnimations: createAnimation({
							entrance: createPhase({
								effect: { kind: "fade", minimumOpacity: 0 },
								unit: "grapheme",
								order,
								target: "text",
							}),
						}),
					},
				}),
				fps: 10,
			}).entrance?.units.map((unit) => unit.rank);

		expect(compileOrder({ order: "forward" })).toEqual([0, 1, 2, 3]);
		expect(compileOrder({ order: "reverse" })).toEqual([3, 2, 1, 0]);
		expect(compileOrder({ order: "centerOut" })).toEqual([2, 0, 1, 3]);
		expect(compileOrder({ order: "outsideIn" })).toEqual([0, 2, 3, 1]);
		expect(compileOrder({ order: "random" })).toEqual(
			compileOrder({ order: "random" })
		);
	});
});
