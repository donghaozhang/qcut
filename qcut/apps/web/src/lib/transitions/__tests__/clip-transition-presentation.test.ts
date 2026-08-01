import { describe, expect, it } from "vitest";
import type { ClipTransition } from "@/types/timeline";
import {
	buildClipTransitionAnchoredTransform,
	buildClipTransitionContentStyle,
	buildClipTransitionCssFilter,
	buildClipTransitionMaskStyle,
	buildClipTransitionOverlayStyle,
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
		).toEqual([1, 1, 1, 1, 1]);
		expect(
			presentations({ type: "dissolve", role: "to" }).map(
				(item) => item.opacity
			)
		).toEqual([0, 0.25, 0.5, 0.75, 1]);
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

	it("crossfades stacked dissolve layers without dimming", () => {
		const dissolve = transition({ type: "dissolve" });
		const outgoing = getClipTransitionLayerPresentation({
			transition: dissolve,
			role: "from",
			progress: 0.25,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const incoming = getClipTransitionLayerPresentation({
			transition: dissolve,
			role: "to",
			progress: 0.25,
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(outgoing.opacity).toBe(1);
		expect(incoming.opacity).toBe(0.25);
		expect(incoming.opacity + outgoing.opacity * (1 - incoming.opacity)).toBe(
			1
		);
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
			opacity: 1,
			scale: 1.18,
			blur: 12,
		});
		expect(midpoint({ type: "zoom-in-blur" })).toMatchObject({
			opacity: 1,
			scale: 1.06,
			blur: 8,
		});
		expect(midpoint({ type: "zoom-in-blur", role: "to" })).toMatchObject({
			opacity: 0.5,
			scale: 0.94,
			blur: 8,
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

	it("describes every advanced transition with a dedicated visual primitive", () => {
		const midpoint = ({
			type,
			direction = "left",
		}: {
			type: ClipTransition["type"];
			direction?: ClipTransition["direction"];
		}) =>
			getClipTransitionLayerPresentation({
				transition: transition({ type, direction }),
				role: "to",
				progress: 0.5,
				canvasWidth: 320,
				canvasHeight: 180,
			});

		expect(midpoint({ type: "motion-blur" })).toMatchObject({
			opacity: 0.5,
			blur: 18,
		});
		expect(midpoint({ type: "pixelate" }).pixelScale).toBeGreaterThan(10);
		expect(midpoint({ type: "water-ripple" }).overlayBackground).toContain(
			"repeating-radial-gradient"
		);
		expect(midpoint({ type: "particle-dissolve" }).maskImage).toContain(
			"radial-gradient"
		);
		expect(midpoint({ type: "glass-refraction" })).toMatchObject({
			maskImage: expect.stringContaining("repeating-linear-gradient"),
			overlayBlendMode: "screen",
		});
		expect(midpoint({ type: "page-flip" })).toMatchObject({
			perspective: 900,
			transformOrigin: "left center",
		});
		expect(midpoint({ type: "texture-mask" }).maskImage).toContain(
			"repeating-conic-gradient"
		);
		expect(midpoint({ type: "lens-flare" })).toMatchObject({
			overlayBackground: expect.stringContaining("radial-gradient"),
			overlayBlendMode: "screen",
		});
	});

	it("converts advanced primitives into browser content, mask, and overlay styles", () => {
		const pixel = getClipTransitionLayerPresentation({
			transition: transition({ type: "pixelate" }),
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		expect(
			buildClipTransitionContentStyle({ presentation: pixel })
		).toMatchObject({
			imageRendering: "pixelated",
			transformOrigin: "top left",
		});

		const page = getClipTransitionLayerPresentation({
			transition: transition({ type: "page-flip", direction: "right" }),
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		expect(
			buildClipTransitionAnchoredTransform({ presentation: page })
		).toContain("perspective(900px)");

		const texture = getClipTransitionLayerPresentation({
			transition: transition({ type: "texture-mask" }),
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		expect(
			buildClipTransitionMaskStyle({ presentation: texture })
		).toMatchObject({
			maskRepeat: "repeat",
			maskImage: expect.stringContaining("conic-gradient"),
		});

		const flare = getClipTransitionLayerPresentation({
			transition: transition({ type: "lens-flare" }),
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		expect(
			buildClipTransitionOverlayStyle({ presentation: flare })
		).toMatchObject({
			position: "absolute",
			mixBlendMode: "screen",
		});
	});

	it("feathers the selected circle and heart reveals", () => {
		const circle = getClipTransitionLayerPresentation({
			transition: {
				...transition({ type: "texture-mask" }),
				maskShape: "circle",
			},
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		const heart = getClipTransitionLayerPresentation({
			transition: {
				...transition({ type: "texture-mask" }),
				maskShape: "heart",
			},
			role: "to",
			progress: 0.5,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		const nearlyCompleteCircle = getClipTransitionLayerPresentation({
			transition: {
				...transition({ type: "texture-mask" }),
				maskShape: "circle",
			},
			role: "to",
			progress: 0.998,
			canvasWidth: 320,
			canvasHeight: 180,
		});

		expect(circle.maskImage).toContain(
			"#000 0 91.79px, rgba(0,0,0,0.5) 97.30px, transparent 102.80px"
		);
		expect(circle.maskImage).not.toContain("clip-path");
		expect(nearlyCompleteCircle.maskImage).toContain("#000 0 188.69px");
		expect(decodeURIComponent(heart.maskImage ?? "")).toContain(
			'feGaussianBlur stdDeviation=".65"'
		);
		expect(heart.maskSize).toBe("auto 101.2%");

		const nearlyCompleteHeart = getClipTransitionLayerPresentation({
			transition: {
				...transition({ type: "texture-mask" }),
				maskShape: "heart",
			},
			role: "to",
			progress: 0.998,
			canvasWidth: 320,
			canvasHeight: 180,
		});
		expect(nearlyCompleteHeart.maskSize).toBe("auto 494.8%");
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
		expect(
			CLIP_TRANSITION_PROGRESS_STOPS.map((progress) =>
				easeClipTransitionProgress({
					progress,
					easing: "easeInOutQuint",
				})
			)
		).toEqual([0, 0.015625, 0.5, 0.984375, 1]);
	});

	it("matches Jianying's dual-input linear dissolve at five stops", () => {
		const dissolve = transition({ type: "dissolve" });
		const outgoingRgb = [240, 32, 80];
		const incomingRgb = [16, 224, 176];
		const qcutFrames = CLIP_TRANSITION_PROGRESS_STOPS.map((progress) => {
			const incoming = getClipTransitionLayerPresentation({
				transition: dissolve,
				role: "to",
				progress,
				canvasWidth: 1,
				canvasHeight: 1,
			});
			return outgoingRgb.map(
				(channel, index) =>
					channel * (1 - incoming.opacity) +
					(incomingRgb[index] ?? 0) * incoming.opacity
			);
		});
		const jianyingFrames = CLIP_TRANSITION_PROGRESS_STOPS.map((progress) =>
			outgoingRgb.map(
				(channel, index) =>
					channel * (1 - progress) + (incomingRgb[index] ?? 0) * progress
			)
		);

		expect(qcutFrames).toEqual(jianyingFrames);
		expect(qcutFrames.at(0)).toEqual(outgoingRgb);
		expect(qcutFrames.at(-1)).toEqual(incomingRgb);
	});

	it.each([
		{
			name: "move-left",
			direction: "right" as const,
			expected: [
				[0, 1_920],
				[-30, 1_890],
				[-960, 960],
				[-1_890, 30],
				[-1_920, 0],
			],
		},
		{
			name: "move-right",
			direction: "left" as const,
			expected: [
				[0, -1_920],
				[30, -1_890],
				[960, -960],
				[1_890, -30],
				[1_920, 0],
			],
		},
	])("uses Jianying's quint displacement for $name", ({
		name,
		direction,
		expected,
	}) => {
		const move: ClipTransition = {
			...transition({ type: "push", direction }),
			presetId: name,
			duration: 1,
			easing: "easeInOutQuint",
		};
		const offsets = CLIP_TRANSITION_PROGRESS_STOPS.map((progress) => {
			const outgoing = getClipTransitionLayerPresentation({
				transition: move,
				role: "from",
				progress,
				canvasWidth: 1_920,
				canvasHeight: 1_080,
			});
			const incoming = getClipTransitionLayerPresentation({
				transition: move,
				role: "to",
				progress,
				canvasWidth: 1_920,
				canvasHeight: 1_080,
			});
			return [outgoing.offsetX, incoming.offsetX];
		});

		expect(offsets).toEqual(expected);
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
