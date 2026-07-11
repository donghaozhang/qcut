import { describe, expect, it } from "vitest";
import type { ClipTransition } from "@/types/timeline";
import {
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
			presentations({
				type: "slide",
				direction: "left",
				role: "from",
			}).map((item) => item.offsetX)
		).toEqual([0, 25, 50, 75, 100]);
		expect(
			presentations({
				type: "slide",
				direction: "left",
				role: "to",
			}).map((item) => item.offsetX)
		).toEqual([-100, -75, -50, -25, 0]);
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

	it("moves slide layers in opposite directions", () => {
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

	it("clamps and eases progress", () => {
		expect(
			easeClipTransitionProgress({ progress: -1, easing: "easeInOut" })
		).toBe(0);
		expect(
			easeClipTransitionProgress({ progress: 2, easing: "easeInOut" })
		).toBe(1);
	});
});
