import { describe, expect, it } from "vitest";
import type { ClipTransition } from "@/types/timeline";
import {
	buildClipTransitionCssFilter,
	CLIP_TRANSITION_PROGRESS_STOPS,
	easeClipTransitionProgress,
	getClipTransitionLayerPresentation,
} from "../clip-transition-presentation";

function transition({
	type,
	direction,
}: Pick<ClipTransition, "type" | "direction">): ClipTransition {
	return {
		id: "transition-1",
		fromElementId: "a",
		toElementId: "b",
		presetId: type,
		type,
		direction,
		duration: 0.5,
		easing: "linear",
	};
}

describe("clip transition presentation", () => {
	it("keeps fixed parity frames for every first-release transition", () => {
		const presentations = ({
			type,
			direction,
			role,
		}: {
			type: ClipTransition["type"];
			direction?: ClipTransition["direction"];
			role: "from" | "to";
		}) =>
			CLIP_TRANSITION_PROGRESS_STOPS.map((progress) =>
				getClipTransitionLayerPresentation({
					transition: transition({ type, direction }),
					role,
					progress,
					canvasWidth: 100,
					canvasHeight: 50,
				})
			);

		expect(
			presentations({ type: "dissolve", role: "from" }).map(
				(item) => item.opacity
			)
		).toEqual([1, 0.75, 0.5, 0.25, 0]);
		expect(
			presentations({ type: "fade-black", role: "from" }).map(
				(item) => item.contentOpacity
			)
		).toEqual([1, 0.5, 0, 0, 0]);
		expect(
			presentations({ type: "fade-black", role: "to" }).map(
				(item) => item.contentOpacity
			)
		).toEqual([0, 0, 0, 0.5, 1]);
		expect(
			presentations({ type: "fade-white", role: "from" }).map(
				(item) => item.backgroundColor
			)
		).toEqual(["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"]);
		expect(
			presentations({
				type: "slide",
				direction: "left",
				role: "from",
			}).map((item) => item.offsetX)
		).toEqual([0, 0, 0, 0, 0]);
		expect(
			presentations({
				type: "slide",
				direction: "left",
				role: "to",
			}).map((item) => item.offsetX)
		).toEqual([-100, -75, -50, -25, 0]);
		expect(
			presentations({
				type: "push",
				direction: "left",
				role: "from",
			}).map((item) => item.offsetX)
		).toEqual([0, 25, 50, 75, 100]);
		expect(
			presentations({
				type: "wipe",
				direction: "left",
				role: "to",
			}).map((item) => item.clipPath)
		).toEqual([
			"inset(0 100% 0 0)",
			"inset(0 75% 0 0)",
			"inset(0 50% 0 0)",
			"inset(0 25% 0 0)",
			"inset(0 0% 0 0)",
		]);
	});

	it("crossfades dissolve layers", () => {
		const dissolve = transition({ type: "dissolve" });

		expect(
			getClipTransitionLayerPresentation({
				transition: dissolve,
				role: "from",
				progress: 0.25,
				canvasWidth: 1920,
				canvasHeight: 1080,
			}).opacity
		).toBe(0.75);
		expect(
			getClipTransitionLayerPresentation({
				transition: dissolve,
				role: "to",
				progress: 0.25,
				canvasWidth: 1920,
				canvasHeight: 1080,
			}).opacity
		).toBe(0.25);
	});

	it("uses black between fade layers", () => {
		const fade = transition({ type: "fade-black" });
		const outgoing = getClipTransitionLayerPresentation({
			transition: fade,
			role: "from",
			progress: 0.5,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const incoming = getClipTransitionLayerPresentation({
			transition: fade,
			role: "to",
			progress: 0.5,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(outgoing).toMatchObject({
			contentOpacity: 0,
			backgroundColor: "#000000",
		});
		expect(incoming.contentOpacity).toBe(0);
	});

	it("slides the incoming layer over a stationary outgoing layer", () => {
		const slide = transition({ type: "slide", direction: "left" });
		const outgoing = getClipTransitionLayerPresentation({
			transition: slide,
			role: "from",
			progress: 0.25,
			canvasWidth: 100,
			canvasHeight: 50,
		});
		const incoming = getClipTransitionLayerPresentation({
			transition: slide,
			role: "to",
			progress: 0.25,
			canvasWidth: 100,
			canvasHeight: 50,
		});

		expect(outgoing.offsetX).toBe(0);
		expect(incoming.offsetX).toBe(-75);
	});

	it("pushes both layers through the cut", () => {
		const push = transition({ type: "push", direction: "left" });
		const outgoing = getClipTransitionLayerPresentation({
			transition: push,
			role: "from",
			progress: 0.25,
			canvasWidth: 100,
			canvasHeight: 50,
		});
		const incoming = getClipTransitionLayerPresentation({
			transition: push,
			role: "to",
			progress: 0.25,
			canvasWidth: 100,
			canvasHeight: 50,
		});

		expect(outgoing.offsetX).toBe(25);
		expect(incoming.offsetX).toBe(-75);
	});

	it("reveals only the incoming wipe layer", () => {
		const wipe = transition({ type: "wipe", direction: "left" });
		const incoming = getClipTransitionLayerPresentation({
			transition: wipe,
			role: "to",
			progress: 0.4,
			canvasWidth: 100,
			canvasHeight: 50,
		});

		expect(incoming.clipPath).toBe("inset(0 60% 0 0)");
	});

	it("describes the second-release motion and stylized transitions", () => {
		const midpoint = ({
			type,
			role = "from",
			direction,
		}: {
			type: ClipTransition["type"];
			role?: "from" | "to";
			direction?: ClipTransition["direction"];
		}) =>
			getClipTransitionLayerPresentation({
				transition: transition({ type, direction }),
				role,
				progress: 0.5,
				canvasWidth: 100,
				canvasHeight: 50,
			});

		expect(midpoint({ type: "zoom-blur" })).toMatchObject({
			opacity: 0.5,
			scale: 1.18,
			blur: 12,
		});
		expect(midpoint({ type: "whip-pan", direction: "left" })).toMatchObject({
			offsetX: 50,
			scale: 1.06,
			blur: 14,
		});
		const flash = midpoint({ type: "flash" });
		expect(flash).toMatchObject({
			backgroundColor: "#ffffff",
			brightness: 3.2,
		});
		expect(flash.contentOpacity).toBeCloseTo(0.45);
		expect(midpoint({ type: "light-leak" })).toMatchObject({
			backgroundColor: "#ff5a1f",
			brightness: 1.65,
			saturation: 2.1,
		});
		expect(midpoint({ type: "rgb-glitch", role: "to" })).toMatchObject({
			saturation: 2.8,
			hueRotate: 42,
		});
		expect(midpoint({ type: "shake" }).rotation).toBeCloseTo(-2.5);
	});

	it("builds a CSS filter only when presentation effects are active", () => {
		expect(
			buildClipTransitionCssFilter({
				presentation: {
					opacity: 1,
					contentOpacity: 1,
					offsetX: 0,
					offsetY: 0,
				},
			})
		).toBeUndefined();
		expect(
			buildClipTransitionCssFilter({
				presentation: midpointPresentation(),
			})
		).toBe("blur(12px) brightness(1) saturate(1) hue-rotate(0deg)");
	});

	it("clamps and eases progress", () => {
		expect(
			easeClipTransitionProgress({ progress: -1, easing: "easeInOut" })
		).toBe(0);
		expect(
			easeClipTransitionProgress({ progress: 2, easing: "easeInOut" })
		).toBe(1);
	});
});

function midpointPresentation() {
	return getClipTransitionLayerPresentation({
		transition: transition({ type: "zoom-blur" }),
		role: "from",
		progress: 0.5,
		canvasWidth: 100,
		canvasHeight: 50,
	});
}
