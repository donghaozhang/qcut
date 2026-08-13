import { describe, expect, it } from "vitest";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	BETA4_ADJACENT_DURATION_US,
	BETA4_VIDEO_DURATION_US,
	createJianying113Beta4AdjacentVideoFixture,
	createJianying113Beta4AdjacentVideoSource,
	readInnerBeta4AdjacentDraft,
} from "./support/jianying-11-3-beta4-video-fixture.js";

function normalizeFixture({ content }: { content: Record<string, unknown> }) {
	return normalizeRawDraft({
		content,
		contentFileName: "draft_content.json",
		source: createJianying113Beta4AdjacentVideoSource({ content }),
	});
}

function readInnerSegments({
	content,
}: {
	content: Record<string, unknown>;
}): Array<Record<string, unknown>> {
	const inner = readInnerBeta4AdjacentDraft({ content });
	const tracks = inner.tracks as Array<{
		segments: Array<Record<string, unknown>>;
	}>;
	return tracks[0]?.segments ?? [];
}

function readInnerMaterials({
	content,
}: {
	content: Record<string, unknown>;
}): Record<string, Array<Record<string, unknown>>> {
	const inner = readInnerBeta4AdjacentDraft({ content });
	return inner.materials as Record<string, Array<Record<string, unknown>>>;
}

describe("Jianying 11.3 beta4 adjacent video import", () => {
	it("maps both real-shape default clips in timeline order", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const before = JSON.stringify(content);
		const result = normalizeFixture({ content });

		expect(JSON.stringify(content)).toBe(before);
		expect(result.document.project).toEqual({
			durationUs: BETA4_ADJACENT_DURATION_US,
			fps: 30,
			height: 360,
			id: "inner-adjacent-draft",
			name: "Adjacent video compound",
			width: 640,
		});
		expect(result.document.timelines[0]?.tracks).toMatchObject([
			{
				capability: "exact",
				id: "inner-video-track",
				isMain: true,
				kind: "video",
				segments: [
					{
						capability: "exact",
						id: "first-segment",
						kind: "video",
						resourceId: "first-video",
						sourceRange: {
							durationUs: BETA4_VIDEO_DURATION_US,
							startUs: 0,
						},
						targetRange: {
							durationUs: BETA4_VIDEO_DURATION_US,
							startUs: 0,
						},
					},
					{
						capability: "exact",
						id: "second-segment",
						kind: "video",
						resourceId: "second-video",
						targetRange: {
							durationUs: BETA4_VIDEO_DURATION_US,
							startUs: BETA4_VIDEO_DURATION_US,
						},
					},
				],
			},
		]);
		expect(result.document.resources).toMatchObject([
			{
				capability: "exact",
				durationUs: BETA4_VIDEO_DURATION_US,
				id: "first-video",
				kind: "video",
				name: "blue.mp4",
			},
			{
				capability: "exact",
				durationUs: BETA4_VIDEO_DURATION_US,
				id: "second-video",
				kind: "video",
				name: "red.mp4",
			},
		]);
		expect(result.document.issues).toEqual([]);
		expect(result.restrictedSourcePathsByResourceId).toEqual({
			"first-video": "/private/blue.mp4",
			"second-video": "/private/red.mp4",
		});

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.resourceIds).toEqual(["first-video", "second-video"]);
		expect(plan.skipped).toEqual([]);
		expect(plan.tracks).toMatchObject([
			{
				elements: [
					{
						duration: 3,
						name: "blue.mp4",
						resourceId: "first-video",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
					},
					{
						duration: 3,
						name: "red.mp4",
						resourceId: "second-video",
						startTime: 3,
						trimEnd: 0,
						trimStart: 0,
					},
				],
				isMain: true,
				type: "media",
			},
		]);
	});

	it("accepts the same verified defaults when the media has embedded audio", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const videos = readInnerMaterials({ content }).videos;
		if (videos?.[0] === undefined)
			throw new Error("fixture has no first video");
		videos[0].has_audio = true;

		const result = normalizeFixture({ content });
		expect(result.document.timelines[0]?.tracks[0]?.segments[0]).toMatchObject({
			capability: "exact",
			resourceId: "first-video",
		});
	});

	it("preserves exact video on a later render-indexed track", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const inner = readInnerBeta4AdjacentDraft({ content });
		const tracks = inner.tracks as Array<{
			id: string;
			segments: Array<Record<string, unknown>>;
			type: string;
		}>;
		tracks.unshift({ id: "empty-main-track", segments: [], type: "mixed" });
		for (const segment of tracks[1]?.segments ?? []) {
			segment.render_index = 1;
			segment.track_render_index = 1;
		}

		const result = normalizeFixture({ content });
		expect(result.document.timelines[0]?.tracks).toMatchObject([
			{ isMain: true, segments: [] },
			{
				segments: [
					{ capability: "exact", id: "first-segment" },
					{ capability: "exact", id: "second-segment" },
				],
			},
		]);
	});

	it("keeps a transformed clip opaque instead of silently flattening it", () => {
		const content = createJianying113Beta4AdjacentVideoFixture();
		const second = readInnerSegments({ content })[1];
		if (second === undefined) throw new Error("fixture has no second segment");
		const clip = second.clip as { scale: { x: number; y: number } };
		clip.scale.x = 1.25;

		const result = normalizeFixture({ content });
		expect(result.document.timelines[0]?.tracks[0]?.segments).toMatchObject([
			{ id: "first-segment", capability: "exact" },
			{ id: "second-segment", capability: "opaque" },
		]);
		expect(
			result.document.issues.some(
				({ code, message, subjectId }) =>
					code === "FEATURE_OPAQUE" &&
					subjectId === "second-segment" &&
					message.includes("transform")
			)
		).toBe(true);
		expect(
			mapInteropDocumentToQCutPlan({ document: result.document }).resourceIds
		).toEqual(["first-video"]);
	});

	it("keeps cropped media and active companion processing opaque", () => {
		const croppedContent = createJianying113Beta4AdjacentVideoFixture();
		const firstVideo = readInnerMaterials({ content: croppedContent })
			.videos?.[0];
		if (firstVideo === undefined) throw new Error("fixture has no first video");
		const crop = firstVideo.crop as { upper_right_x: number };
		crop.upper_right_x = 0.8;

		const cropped = normalizeFixture({ content: croppedContent });
		expect(cropped.document.timelines[0]?.tracks[0]?.segments[0]).toMatchObject(
			{
				capability: "opaque",
			}
		);
		expect(
			cropped.document.issues.some(({ message }) => message.includes("crop"))
		).toBe(true);

		const companionContent = createJianying113Beta4AdjacentVideoFixture();
		const firstSpeed = readInnerMaterials({ content: companionContent })
			.speeds?.[0];
		if (firstSpeed === undefined) throw new Error("fixture has no first speed");
		firstSpeed.speed = 2;
		const companion = normalizeFixture({ content: companionContent });
		expect(
			companion.document.timelines[0]?.tracks[0]?.segments[0]
		).toMatchObject({
			capability: "opaque",
		});
		expect(
			companion.document.issues.some(({ message }) =>
				message.includes("companion processing")
			)
		).toBe(true);
	});

	it("fails closed when nested defaults gain unknown processing fields", () => {
		const materialContent = createJianying113Beta4AdjacentVideoFixture();
		const firstVideo = readInnerMaterials({ content: materialContent })
			.videos?.[0];
		if (firstVideo === undefined) throw new Error("fixture has no first video");
		const algorithm = firstVideo.video_algorithm as Record<string, unknown>;
		algorithm.future_algorithm = { enabled: false };

		const materialResult = normalizeFixture({ content: materialContent });
		expect(
			materialResult.document.timelines[0]?.tracks[0]?.segments[0]
		).toMatchObject({ capability: "opaque" });

		const companionContent = createJianying113Beta4AdjacentVideoFixture();
		const firstSpeed = readInnerMaterials({ content: companionContent })
			.speeds?.[0];
		if (firstSpeed === undefined) throw new Error("fixture has no first speed");
		firstSpeed.future_mode = 0;

		const companionResult = normalizeFixture({ content: companionContent });
		expect(
			companionResult.document.timelines[0]?.tracks[0]?.segments[0]
		).toMatchObject({ capability: "opaque" });
		expect(
			companionResult.document.issues.some(({ message }) =>
				message.includes("companion processing")
			)
		).toBe(true);
	});
});
