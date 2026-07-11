import { describe, expect, it } from "vitest";
import type { ClipTransition } from "@/types/timeline";
import {
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
