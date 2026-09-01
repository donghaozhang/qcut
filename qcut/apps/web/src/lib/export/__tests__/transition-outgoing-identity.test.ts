import { getClipTransitionLayerPresentation } from "@qcut/editor-core/timeline";
import { describe, expect, it } from "vitest";

/**
 * Pins which transition families need a second composited layer for the
 * OUTGOING ("from") clip and which do not.
 *
 * The export renderer already draws an outgoing clip straight onto the export
 * canvas when its presentation is identity
 * (export-clip-transitions.ts beginClipTransitionLayer). These tests document
 * which families that actually applies to, so a future preset change cannot
 * silently start paying for a group canvas that contributes nothing — or
 * silently skip one that does contribute.
 */

const CANVAS = { canvasHeight: 1080, canvasWidth: 1920 };

function transition({
	type,
	easing = "linear",
}: {
	type: string;
	easing?: string;
}): Parameters<typeof getClipTransitionLayerPresentation>[0]["transition"] {
	return {
		duration: 1,
		easing,
		fromElementId: "a",
		id: "ab",
		presetId: type,
		toElementId: "b",
		type,
	} as unknown as Parameters<
		typeof getClipTransitionLayerPresentation
	>[0]["transition"];
}

/** Mirrors isIdentityPresentation in export-clip-transitions.ts. */
function isIdentity(presentation: {
	opacity: number;
	contentOpacity: number;
	offsetX: number;
	offsetY: number;
	scale?: number;
	rotation?: number;
	blur?: number;
	brightness?: number;
	saturation?: number;
	hueRotate?: number;
	backgroundColor?: string;
	clipPath?: string;
}): boolean {
	return (
		presentation.opacity === 1 &&
		presentation.contentOpacity === 1 &&
		presentation.offsetX === 0 &&
		presentation.offsetY === 0 &&
		(presentation.scale ?? 1) === 1 &&
		(presentation.rotation ?? 0) === 0 &&
		presentation.backgroundColor === undefined &&
		presentation.clipPath === undefined &&
		(presentation.blur ?? 0) === 0 &&
		(presentation.brightness ?? 1) === 1 &&
		(presentation.saturation ?? 1) === 1 &&
		(presentation.hueRotate ?? 0) === 0
	);
}

function outgoingAt({ type, progress }: { type: string; progress: number }) {
	return getClipTransitionLayerPresentation({
		...CANVAS,
		progress,
		role: "from",
		transition: transition({ type }),
	});
}

const MID_PROGRESS = [0.1, 0.25, 0.5, 0.75, 0.9];

describe("transition outgoing layer identity", () => {
	it("keeps the dissolve outgoing layer at identity for the whole window", () => {
		for (const progress of [0, ...MID_PROGRESS, 1]) {
			const presentation = outgoingAt({ progress, type: "dissolve" });
			expect(isIdentity(presentation), `dissolve outgoing at ${progress}`).toBe(
				true
			);
			// The incoming layer is what carries the crossfade.
			const incoming = getClipTransitionLayerPresentation({
				...CANVAS,
				progress,
				role: "to",
				transition: transition({ type: "dissolve" }),
			});
			expect(incoming.opacity).toBeCloseTo(progress, 5);
		}
	});

	it("keeps the slide outgoing layer at identity while the incoming moves", () => {
		for (const progress of [0, ...MID_PROGRESS, 1]) {
			expect(
				isIdentity(outgoingAt({ progress, type: "slide" })),
				`slide outgoing at ${progress}`
			).toBe(true);
		}
		const incoming = getClipTransitionLayerPresentation({
			...CANVAS,
			progress: 0.5,
			role: "to",
			transition: transition({ type: "slide" }),
		});
		expect(
			Math.abs(incoming.offsetX) + Math.abs(incoming.offsetY)
		).toBeGreaterThan(0);
	});

	it("requires a real second layer for zoom-blur mid-window", () => {
		// zoom-blur scales and blurs BOTH clips, so the outgoing layer genuinely
		// contributes and cannot be short-circuited.
		for (const progress of MID_PROGRESS) {
			const presentation = outgoingAt({ progress, type: "zoom-blur" });
			expect(
				isIdentity(presentation),
				`zoom-blur outgoing at ${progress} must not be identity`
			).toBe(false);
			expect(presentation.scale ?? 1).toBeGreaterThan(1);
			expect(presentation.blur ?? 0).toBeGreaterThan(0);
		}
	});

	it("returns zoom-blur to identity exactly at the window edges", () => {
		// peak = 4p(1-p) is zero at both ends, so the boundary frames are
		// untouched and must match the surrounding hard-cut frames.
		for (const progress of [0, 1]) {
			expect(
				isIdentity(outgoingAt({ progress, type: "zoom-blur" })),
				`zoom-blur outgoing at edge ${progress}`
			).toBe(true);
		}
	});

	it("never treats fade-black as identity, because it paints a plate", () => {
		for (const progress of [0, ...MID_PROGRESS, 1]) {
			const presentation = outgoingAt({ progress, type: "fade-black" });
			expect(presentation.backgroundColor).toBe("#000000");
			expect(isIdentity(presentation)).toBe(false);
		}
	});

	it("moves the outgoing clip for push, unlike slide", () => {
		// push and slide look similar but differ exactly here: push translates
		// the outgoing clip, so it needs its own layer.
		const pushed = outgoingAt({ progress: 0.5, type: "push" });
		expect(isIdentity(pushed)).toBe(false);
		expect(Math.abs(pushed.offsetX) + Math.abs(pushed.offsetY)).toBeGreaterThan(
			0
		);
	});
});
