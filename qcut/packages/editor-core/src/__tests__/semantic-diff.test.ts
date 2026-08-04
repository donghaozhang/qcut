import { describe, expect, it } from "vitest";
import type { DraftInteropDocumentV1 } from "../draft-interop/document.js";
import {
	diffDraftInteropDocuments,
	halfFrameToleranceUs,
} from "../draft-interop/semantic-diff.js";

/**
 * JYI-017 acceptance (pure core): identical round-trips report clean,
 * sub-threshold drift is tolerable, and every loss shape is breaking.
 */

function createDocument(): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "jianying",
			profileId: "jianying-synthetic-plaintext-5.9",
			platform: "macos",
			files: [],
		},
		project: { id: "p", name: "P", width: 1920, height: 1080, fps: 30 },
		timelines: [
			{
				id: "root",
				isRoot: true,
				tracks: [
					{
						id: "track-a",
						kind: "video",
						order: 0,
						isMain: true,
						segments: [
							{
								id: "seg-1",
								kind: "video",
								resourceId: "res-1",
								sourceRange: { startUs: 500_000, durationUs: 4_000_000 },
								targetRange: { startUs: 0, durationUs: 4_000_000 },
								capability: "exact",
							},
							{
								id: "seg-2",
								kind: "video",
								resourceId: "res-1",
								targetRange: { startUs: 4_000_000, durationUs: 2_000_000 },
								speed: 2,
								capability: "exact",
							},
						],
						capability: "exact",
					},
				],
			},
		],
		resources: [
			{
				id: "res-1",
				kind: "video",
				name: "clip.mp4",
				sha256: "a".repeat(64),
				durationUs: 5_000_000,
				status: "pending",
				capability: "exact",
			},
		],
		links: [
			{
				id: "link-1",
				type: "video-audio",
				fromId: "seg-1",
				toId: "seg-2",
			},
		],
		issues: [],
	};
}

function clone(document: DraftInteropDocumentV1): DraftInteropDocumentV1 {
	return JSON.parse(JSON.stringify(document));
}

describe("halfFrameToleranceUs", () => {
	it("computes half a frame in integer microseconds", () => {
		expect(halfFrameToleranceUs({ fps: 30 })).toBe(16_666);
		expect(halfFrameToleranceUs({ fps: 60 })).toBe(8_333);
		expect(halfFrameToleranceUs({ fps: 0 })).toBe(0);
		expect(halfFrameToleranceUs({ fps: Number.NaN })).toBe(0);
	});
});

describe("diffDraftInteropDocuments", () => {
	it("reports an identical round-trip as clean", () => {
		const left = createDocument();
		const result = diffDraftInteropDocuments({ left, right: clone(left) });
		expect(result).toMatchObject({
			identical: true,
			breakingCount: 0,
			tolerableCount: 0,
			infoCount: 0,
		});
	});

	it("ignores assessment-side fields entirely", () => {
		const left = createDocument();
		const right = clone(left);
		right.timelines[0].tracks[0].segments[0].capability = "downgrade";
		right.resources[0].status = "resolved";
		right.issues = [
			{ code: "FEATURE_DOWNGRADED", severity: "warning", message: "x" },
		];
		expect(diffDraftInteropDocuments({ left, right }).identical).toBe(true);
	});

	it("classifies sub-half-frame timing drift as tolerable", () => {
		const left = createDocument();
		const right = clone(left);
		right.timelines[0].tracks[0].segments[0].targetRange.startUs += 10_000;
		const tolerance = halfFrameToleranceUs({ fps: left.project.fps });
		const result = diffDraftInteropDocuments({
			left,
			right,
			options: { timeToleranceUs: tolerance },
		});
		expect(result.identical).toBe(false);
		expect(result.breakingCount).toBe(0);
		expect(result.tolerableCount).toBe(1);
		expect(result.entries[0]).toMatchObject({
			path: "/timelines/0/tracks/0/segments/0/targetRange/startUs",
			severity: "tolerable",
			subjectId: "seg-1",
		});

		// The same drift with zero tolerance is breaking.
		const strict = diffDraftInteropDocuments({ left, right });
		expect(strict.breakingCount).toBe(1);
	});

	it("reports a missing segment as breaking", () => {
		const left = createDocument();
		const right = clone(left);
		right.timelines[0].tracks[0].segments.pop();
		const result = diffDraftInteropDocuments({ left, right });
		expect(result.breakingCount).toBeGreaterThan(0);
		expect(
			result.entries.some(
				(entry) => entry.kind === "missing" && entry.subjectId === "seg-2"
			)
		).toBe(true);
	});

	it("reports an extra track as breaking", () => {
		const left = createDocument();
		const right = clone(left);
		right.timelines[0].tracks.push({
			id: "track-ghost",
			kind: "audio",
			order: 1,
			segments: [],
			capability: "exact",
		});
		const result = diffDraftInteropDocuments({ left, right });
		expect(
			result.entries.some(
				(entry) => entry.kind === "extra" && entry.subjectId === "track-ghost"
			)
		).toBe(true);
	});

	it("treats resource renames as info but byte changes as breaking", () => {
		const left = createDocument();
		const renamed = clone(left);
		renamed.resources[0].name = "clip (relinked).mp4";
		const renameResult = diffDraftInteropDocuments({ left, right: renamed });
		expect(renameResult.breakingCount).toBe(0);
		expect(renameResult.infoCount).toBe(1);

		const rehashed = clone(left);
		rehashed.resources[0].sha256 = "b".repeat(64);
		const rehashResult = diffDraftInteropDocuments({ left, right: rehashed });
		expect(rehashResult.breakingCount).toBe(1);

		// A one-sided hash (unknown on one side) is not a difference.
		const oneSided = clone(left);
		delete (oneSided.resources[0] as { sha256?: string }).sha256;
		expect(diffDraftInteropDocuments({ left, right: oneSided }).identical).toBe(
			true
		);
	});

	it("uses the speed tolerance and defaults absent speed to 1", () => {
		const left = createDocument();
		const right = clone(left);
		right.timelines[0].tracks[0].segments[1].speed = 2.0001;
		const tolerant = diffDraftInteropDocuments({
			left,
			right,
			options: { speedTolerance: 0.001 },
		});
		expect(tolerant.breakingCount).toBe(0);
		expect(tolerant.tolerableCount).toBe(1);

		const explicitOne = clone(left);
		explicitOne.timelines[0].tracks[0].segments[0].speed = 1;
		expect(
			diffDraftInteropDocuments({ left, right: explicitOne }).identical
		).toBe(true);
	});

	it("reports link set changes as breaking in both directions", () => {
		const left = createDocument();
		const removed = clone(left);
		removed.links = [];
		expect(
			diffDraftInteropDocuments({ left, right: removed }).entries[0]
		).toMatchObject({ path: "/links", kind: "missing", severity: "breaking" });

		const added = clone(left);
		added.links.push({
			id: "link-2",
			type: "group",
			fromId: "seg-1",
			toId: "seg-2",
		});
		expect(
			diffDraftInteropDocuments({ left, right: added }).entries[0]
		).toMatchObject({ path: "/links", kind: "extra", severity: "breaking" });
	});

	it("reports project geometry changes as breaking", () => {
		const left = createDocument();
		const right = clone(left);
		right.project.width = 1080;
		right.project.height = 1920;
		const result = diffDraftInteropDocuments({ left, right });
		expect(result.breakingCount).toBe(2);
	});
});
