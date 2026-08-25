// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { JianyingPortraitDetectedFace } from "../jianying-portrait-adjustment-contract.js";
import {
	matchPortraitTrackIds,
	matchPortraitTrackIdsDetailed,
	remapPortraitFeatureParameters,
	restorePortraitReferenceFaces,
} from "../jianying-portrait-adjustment-runtime/track-id-remapping.js";

function face({
	trackId,
	x,
	width,
}: {
	trackId: number;
	x: number;
	width: number;
}): JianyingPortraitDetectedFace {
	return {
		trackId,
		faceId: trackId,
		freidTrackId: trackId,
		personBindingId: `portrait-person:${trackId}`,
		bindingStatus: "matched",
		rect: { x, y: 0.2, width, height: width },
		score: 1,
		yaw: 0,
		pitch: 0,
		roll: 0,
		trackingCount: 1,
		landmarkCount: 106,
	};
}

describe("Jianying portrait track id remapping", () => {
	it("matches the same faces when independent hosts swap native ids", () => {
		const mapping = matchPortraitTrackIds({
			referenceFaces: [
				face({ trackId: 0, x: 0.7, width: 0.15 }),
				face({ trackId: 1, x: 0.1, width: 0.4 }),
			],
			runtimeFaces: [
				face({ trackId: 0, x: 0.1, width: 0.4 }),
				face({ trackId: 1, x: 0.7, width: 0.15 }),
			],
		});

		expect(Object.fromEntries(mapping)).toEqual({ 0: 1, 1: 0 });
	});

	it("rewrites nested feature vectors but keeps the all-faces id", () => {
		const remapped = remapPortraitFeatureParameters({
			featureParameters: JSON.stringify({
				face_adjust_TotalFace: [
					{ id: -1, intensity: 0.1 },
					{ id: 0, intensity: 0.8 },
					{ id: 1, intensity: 0.4 },
				],
			}),
			trackIds: new Map([
				[0, 1],
				[1, 0],
			]),
		});

		expect(JSON.parse(remapped)).toEqual({
			face_adjust_TotalFace: [
				{ id: -1, intensity: 0.1 },
				{ id: 1, intensity: 0.8 },
				{ id: 0, intensity: 0.4 },
			],
		});
	});

	it("restores project reference ids from an already-bound host", () => {
		expect(
			restorePortraitReferenceFaces({
				runtimeFaces: [
					face({ trackId: 8, x: 0.7, width: 0.15 }),
					face({ trackId: 9, x: 0.1, width: 0.4 }),
					face({ trackId: 10, x: 0.4, width: 0.2 }),
				],
				trackIds: new Map([
					[0, 9],
					[1, 8],
				]),
			})
		).toEqual([
			{ trackId: 1, rect: { x: 0.7, y: 0.2, width: 0.15, height: 0.15 } },
			{ trackId: 0, rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.4 } },
		]);
	});

	it("rejects a geometry match when two candidates are ambiguous", () => {
		const match = matchPortraitTrackIdsDetailed({
			referenceFaces: [face({ trackId: 7, x: 0.4, width: 0.2 })],
			runtimeFaces: [
				face({ trackId: 10, x: 0.39, width: 0.2 }),
				face({ trackId: 11, x: 0.41, width: 0.2 }),
			],
		});

		expect(match.trackIds.size).toBe(0);
		expect(match.ambiguousReferenceTrackIds).toEqual([7]);
		expect(match.unmatchedReferenceTrackIds).toEqual([7]);
	});

	it("rejects a face outside the maximum geometry cost", () => {
		const mapping = matchPortraitTrackIds({
			referenceFaces: [face({ trackId: 0, x: 0.05, width: 0.15 })],
			runtimeFaces: [face({ trackId: 1, x: 0.8, width: 0.15 })],
		});

		expect(mapping.size).toBe(0);
	});
});
