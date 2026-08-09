import { describe, expect, it } from "vitest";
import type {
	DraftInteropDocumentV1,
	InteropText,
} from "../draft-interop/document.js";
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
						transitions: [
							{
								id: "transition-1",
								type: "dissolve",
								fromSegmentId: "seg-1",
								toSegmentId: "seg-2",
								durationUs: 500_000,
								capability: "exact",
								foreignRef: "raw-transition-1",
							},
						],
						capability: "exact",
					},
					{
						id: "track-text",
						kind: "text",
						order: 1,
						segments: [
							{
								id: "text-1",
								kind: "text",
								targetRange: { startUs: 0, durationUs: 2_000_000 },
								text: {
									content: "Hello",
									fontSizePx: 48,
									fontFamily: "Arial",
									color: "#ffffff",
									textAlign: "center",
									fontWeight: "bold",
									fontStyle: "italic",
									textDecoration: "underline",
									xPx: 100,
									yPx: 200,
									rotationDegrees: 5,
									opacity: 0.9,
									letterSpacingPx: 2,
									widthPx: 600,
									stroke: {
										color: "#000000",
										widthPx: 3,
										opacity: 0.8,
									},
									background: {
										color: "#112233",
										opacity: 0.5,
										radiusPx: 8,
										paddingPx: 12,
									},
									shadow: {
										color: "#334455",
										opacity: 0.6,
										offsetXPx: 4,
										offsetYPx: 5,
										blurPx: 9,
									},
									foreignRef: "raw-text-1",
								},
								capability: "downgrade",
							},
						],
						capability: "downgrade",
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

function textFrom(document: DraftInteropDocumentV1): InteropText {
	const text = document.timelines[0].tracks[1].segments[0].text;
	if (text === undefined)
		throw new Error("text fixture is missing text semantics");
	return text;
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
		right.timelines[0].tracks[0].transitions![0].capability = "downgrade";
		right.timelines[0].tracks[0].transitions![0].foreignRef =
			"different-transition-binding";
		textFrom(right).foreignRef = "different-text-binding";
		right.resources[0].status = "resolved";
		right.issues = [
			{ code: "FEATURE_DOWNGRADED", severity: "warning", message: "x" },
		];
		expect(diffDraftInteropDocuments({ left, right }).identical).toBe(true);
	});

	it("reports every static text field change as breaking", () => {
		const left = createDocument();
		const cases: Array<{
			path: string;
			mutate: (text: InteropText) => void;
		}> = [
			{ path: "content", mutate: (text) => (text.content = "Changed") },
			{ path: "fontSizePx", mutate: (text) => (text.fontSizePx = 49) },
			{ path: "fontFamily", mutate: (text) => (text.fontFamily = "Inter") },
			{ path: "color", mutate: (text) => (text.color = "#eeeeee") },
			{ path: "textAlign", mutate: (text) => (text.textAlign = "left") },
			{ path: "fontWeight", mutate: (text) => (text.fontWeight = "normal") },
			{ path: "fontStyle", mutate: (text) => (text.fontStyle = "normal") },
			{
				path: "textDecoration",
				mutate: (text) => (text.textDecoration = "none"),
			},
			{ path: "xPx", mutate: (text) => (text.xPx = 101) },
			{ path: "yPx", mutate: (text) => (text.yPx = 201) },
			{
				path: "rotationDegrees",
				mutate: (text) => (text.rotationDegrees = 6),
			},
			{ path: "opacity", mutate: (text) => (text.opacity = 0.8) },
			{
				path: "letterSpacingPx",
				mutate: (text) => (text.letterSpacingPx = 3),
			},
			{ path: "widthPx", mutate: (text) => (text.widthPx = 601) },
			{
				path: "stroke/color",
				mutate: (text) => (text.stroke!.color = "#111111"),
			},
			{
				path: "stroke/widthPx",
				mutate: (text) => (text.stroke!.widthPx = 4),
			},
			{
				path: "stroke/opacity",
				mutate: (text) => (text.stroke!.opacity = 0.7),
			},
			{
				path: "background/color",
				mutate: (text) => (text.background!.color = "#223344"),
			},
			{
				path: "background/opacity",
				mutate: (text) => (text.background!.opacity = 0.4),
			},
			{
				path: "background/radiusPx",
				mutate: (text) => (text.background!.radiusPx = 9),
			},
			{
				path: "background/paddingPx",
				mutate: (text) => (text.background!.paddingPx = 13),
			},
			{
				path: "shadow/color",
				mutate: (text) => (text.shadow!.color = "#445566"),
			},
			{
				path: "shadow/opacity",
				mutate: (text) => (text.shadow!.opacity = 0.5),
			},
			{
				path: "shadow/offsetXPx",
				mutate: (text) => (text.shadow!.offsetXPx = 5),
			},
			{
				path: "shadow/offsetYPx",
				mutate: (text) => (text.shadow!.offsetYPx = 6),
			},
			{
				path: "shadow/blurPx",
				mutate: (text) => (text.shadow!.blurPx = 10),
			},
		];
		for (const testCase of cases) {
			const right = clone(left);
			testCase.mutate(textFrom(right));
			const result = diffDraftInteropDocuments({ left, right });
			expect(result.breakingCount, testCase.path).toBe(1);
			expect(result.entries[0], testCase.path).toMatchObject({
				path: `/timelines/0/tracks/1/segments/0/text/${testCase.path}`,
				kind: "changed",
				severity: "breaking",
				subjectId: "text-1",
			});
		}
	});

	it("reports missing text and nested styles without exposing bindings", () => {
		const left = createDocument();
		const noText = clone(left);
		noText.timelines[0].tracks[1].segments[0].text = undefined;
		const textResult = diffDraftInteropDocuments({ left, right: noText });
		expect(textResult.entries).toEqual([
			{
				path: "/timelines/0/tracks/1/segments/0/text",
				kind: "missing",
				severity: "breaking",
				subjectId: "text-1",
			},
		]);
		expect(JSON.stringify(textResult)).not.toContain("raw-text-1");

		const noStroke = clone(left);
		textFrom(noStroke).stroke = undefined;
		expect(
			diffDraftInteropDocuments({ left, right: noStroke }).entries[0]
		).toMatchObject({
			path: "/timelines/0/tracks/1/segments/0/text/stroke",
			kind: "missing",
			severity: "breaking",
		});
	});

	it("compares transition identity fields and applies timing tolerance", () => {
		const left = createDocument();
		const changedType = clone(left);
		changedType.timelines[0].tracks[0].transitions![0].type = "unknown";
		expect(
			diffDraftInteropDocuments({ left, right: changedType }).entries[0]
		).toMatchObject({
			path: "/timelines/0/tracks/0/transitions/0/type",
			severity: "breaking",
			subjectId: "transition-1",
		});

		const changedEndpoint = clone(left);
		changedEndpoint.timelines[0].tracks[0].transitions![0].toSegmentId =
			"seg-1";
		expect(
			diffDraftInteropDocuments({ left, right: changedEndpoint }).entries[0]
		).toMatchObject({
			path: "/timelines/0/tracks/0/transitions/0/toSegmentId",
			severity: "breaking",
		});

		const drifted = clone(left);
		drifted.timelines[0].tracks[0].transitions![0].durationUs += 10_000;
		const tolerance = halfFrameToleranceUs({ fps: left.project.fps });
		const driftResult = diffDraftInteropDocuments({
			left,
			right: drifted,
			options: { timeToleranceUs: tolerance },
		});
		expect(driftResult.breakingCount).toBe(0);
		expect(driftResult.entries[0]).toMatchObject({
			path: "/timelines/0/tracks/0/transitions/0/durationUs",
			severity: "tolerable",
		});
	});

	it("reports missing and extra transitions but ignores array order", () => {
		const left = createDocument();
		left.timelines[0].tracks[0].transitions!.push({
			id: "transition-2",
			type: "dissolve",
			fromSegmentId: "seg-2",
			toSegmentId: "seg-1",
			durationUs: 250_000,
			capability: "downgrade",
		});
		const reordered = clone(left);
		reordered.timelines[0].tracks[0].transitions!.reverse();
		expect(
			diffDraftInteropDocuments({ left, right: reordered }).identical
		).toBe(true);

		const missing = clone(left);
		missing.timelines[0].tracks[0].transitions!.pop();
		expect(
			diffDraftInteropDocuments({ left, right: missing }).entries[0]
		).toMatchObject({
			path: "/timelines/0/tracks/0/transitions/1",
			kind: "missing",
			subjectId: "transition-2",
		});

		const extra = clone(left);
		extra.timelines[0].tracks[0].transitions!.push({
			id: "transition-extra",
			type: "dissolve",
			fromSegmentId: "seg-1",
			toSegmentId: "seg-2",
			durationUs: 100_000,
			capability: "exact",
		});
		expect(
			diffDraftInteropDocuments({ left, right: extra }).entries[0]
		).toMatchObject({
			path: "/timelines/0/tracks/0/transitions",
			kind: "extra",
			subjectId: "transition-extra",
		});
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
