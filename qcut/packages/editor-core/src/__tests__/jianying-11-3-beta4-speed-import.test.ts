import { describe, expect, it } from "vitest";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	BETA4_VIDEO_DURATION_US,
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

function innerDraft({ content }: { content: Record<string, unknown> }) {
	return readInnerBeta4AdjacentDraft({ content });
}

function firstSegmentRaw({
	content,
}: {
	content: Record<string, unknown>;
}): Record<string, unknown> {
	const tracks = innerDraft({ content }).tracks as Array<{
		segments: Array<Record<string, unknown>>;
	}>;
	const segment = tracks[0]?.segments[0];
	if (segment === undefined) throw new Error("fixture has no first segment");
	return segment;
}

function speedCompanion({
	content,
}: {
	content: Record<string, unknown>;
}): Record<string, unknown> {
	const materials = innerDraft({ content }).materials as {
		speeds: Array<Record<string, unknown>>;
	};
	const speed = materials.speeds[0];
	if (speed === undefined) throw new Error("fixture has no speed companion");
	return speed;
}

/** Applies the app-consistent constant-rate mutation to the first segment. */
function applyConstantRate({
	content,
	rate,
}: {
	content: Record<string, unknown>;
	rate: number;
}): void {
	const segment = firstSegmentRaw({ content });
	segment.speed = rate;
	speedCompanion({ content }).speed = rate;
	(segment.source_timerange as Record<string, unknown>).duration =
		BETA4_VIDEO_DURATION_US;
	(segment.target_timerange as Record<string, unknown>).duration =
		BETA4_VIDEO_DURATION_US / rate;
}

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

describe("Jianying 11.3 beta4 constant-rate speed import (L3)", () => {
	it("maps a consistent constant-rate segment as exact with plan speed", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		applyConstantRate({ content, rate: 2 });

		const result = normalizeFixture({ content });
		const mapped = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(mapped?.capability).toBe("exact");
		expect(mapped?.speed).toBe(2);
		expect(mapped?.targetRange.durationUs).toBe(BETA4_VIDEO_DURATION_US / 2);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.tracks[0]?.elements[0]).toMatchObject({
			type: "media",
			speed: 2,
		});
	});

	it("keeps a segment-vs-companion speed mismatch opaque", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		applyConstantRate({ content, rate: 2 });
		speedCompanion({ content }).speed = 3;

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
		).toBe("opaque");
	});

	it("keeps an inconsistent timing relation opaque", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		applyConstantRate({ content, rate: 2 });
		// Target says 2× but keeps the full source duration on the timeline.
		(
			firstSegmentRaw({ content }).target_timerange as Record<string, unknown>
		).duration = BETA4_VIDEO_DURATION_US;

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
		).toBe("opaque");
	});

	it("keeps curve speeds opaque", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		applyConstantRate({ content, rate: 2 });
		speedCompanion({ content }).curve_speed = { points: [] };

		const result = normalizeFixture({ content });
		expect(
			result.document.timelines[0]?.tracks[0]?.segments[0]?.capability
		).toBe("opaque");
	});
});
