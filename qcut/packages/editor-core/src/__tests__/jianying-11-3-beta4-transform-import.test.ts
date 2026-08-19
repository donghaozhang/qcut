import { describe, expect, it } from "vitest";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

function firstSegmentRaw({
	content,
}: {
	content: Record<string, unknown>;
}): Record<string, unknown> {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const tracks = inner.tracks as Array<{
		segments: Array<Record<string, unknown>>;
	}>;
	const segment = tracks[0]?.segments[0];
	if (segment === undefined) throw new Error("fixture has no first segment");
	return segment;
}

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

describe("Jianying 11.3 beta4 static clip transform import (L2)", () => {
	it("maps a rotated clip as exact, sign unchanged (both clockwise)", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const segment = firstSegmentRaw({ content });
		(segment.clip as Record<string, unknown>).rotation = 30;

		const result = normalizeFixture({ content });
		const mapped = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(mapped?.capability).toBe("exact");
		expect(mapped?.visual).toEqual({ xPx: 0, yPx: 0, rotationDegrees: 30 });

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		const planElement = plan.tracks[0]?.elements[0];
		expect(planElement).toMatchObject({ type: "media", rotation: 30 });
	});

	it("maps uniform scale and opacity through to the plan element", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const segment = firstSegmentRaw({ content });
		(segment.clip as Record<string, unknown>).scale = { x: 0.5, y: 0.5 };
		segment.uniform_scale = { on: true, value: 0.5 };
		(segment.clip as Record<string, unknown>).alpha = 0.25;

		const result = normalizeFixture({ content });
		const mapped = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(mapped?.capability).toBe("exact");
		expect(mapped?.visual).toEqual({
			xPx: 0,
			yPx: 0,
			scaleX: 0.5,
			scaleY: 0.5,
			opacity: 0.25,
		});

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0]?.elements[0]).toMatchObject({
			scaleX: 0.5,
			scaleY: 0.5,
			opacity: 0.25,
		});
	});

	it("maps a static position in half-canvas units", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const segment = firstSegmentRaw({ content });
		// 640×360 canvas: X 0.25 → 80 px; Y -0.5 up-positive → +90 px screen-down.
		(segment.clip as Record<string, unknown>).transform = { x: 0.25, y: -0.5 };

		const result = normalizeFixture({ content });
		const mapped = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(mapped?.capability).toBe("exact");
		expect(mapped?.visual).toEqual({ xPx: 80, yPx: 90 });
	});

	it("keeps non-uniform scale and flips out of the exact subset", () => {
		for (const mutate of [
			(segment: Record<string, unknown>) => {
				(segment.clip as Record<string, unknown>).scale = { x: 0.5, y: 0.8 };
				segment.uniform_scale = { on: true, value: 0.5 };
			},
			(segment: Record<string, unknown>) => {
				(segment.clip as Record<string, unknown>).flip = {
					horizontal: true,
					vertical: false,
				};
			},
			(segment: Record<string, unknown>) => {
				(segment.clip as Record<string, unknown>).alpha = 0;
			},
		]) {
			const content = createJianying113Beta4AdjacentVideoFixture();
			mutate(firstSegmentRaw({ content }));
			const result = normalizeFixture({ content });
			expect(
				result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
			).toBe("opaque");
		}
	});
});
