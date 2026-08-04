import { describe, expect, it } from "vitest";
import {
	aggregateInteropCapabilities,
	canCommitInteropNode,
	combineInteropCapabilities,
} from "../draft-interop/capability.js";
import {
	parseDraftInteropDocumentV1,
	type DraftInteropDocumentV1,
} from "../draft-interop/document.js";
import {
	collectInteropIssueFingerprints,
	createInteropIssueFingerprint,
	INTEROP_ISSUE_CODES,
	isInteropIssueCode,
} from "../draft-interop/issues.js";

/**
 * JYI-001 acceptance: schema round-trip through JSON, four-state capability
 * aggregation and commit gates, and stable issue codes that reject unknowns.
 */

function sampleDocument(): DraftInteropDocumentV1 {
	return {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "capcut",
			profileId: "capcut-desktop-8.1-plaintext",
			appVersion: "8.1.1",
			schemaVersion: "360000",
			platform: "macos",
			files: [
				{
					relativePath: "draft_info.json",
					byteLength: 4096,
					sha256: "a".repeat(64),
					role: "content",
					classification: "plaintext-json",
				},
				{
					relativePath: "attachment/locked.bin",
					byteLength: 128,
					sha256: "b".repeat(64),
					role: "sidecar",
					classification: "binary",
				},
			],
		},
		project: {
			id: "import-1:project",
			name: "示例工程",
			width: 1920,
			height: 1080,
			fps: 30,
			durationUs: 6_000_000,
		},
		timelines: [
			{
				id: "import-1:timeline-root",
				isRoot: true,
				fps: 30,
				tracks: [
					{
						id: "import-1:track-0",
						kind: "video",
						order: 0,
						isMain: true,
						capability: "exact",
						segments: [
							{
								id: "import-1:segment-0",
								kind: "video",
								resourceId: "import-1:resource-0",
								sourceRange: { startUs: 0, durationUs: 3_000_000 },
								targetRange: { startUs: 0, durationUs: 3_000_000 },
								speed: 1,
								capability: "exact",
								foreignRef: "raw:tracks/0/segments/0",
							},
							{
								id: "import-1:segment-1",
								kind: "transition",
								targetRange: { startUs: 2_500_000, durationUs: 1_000_000 },
								capability: "opaque",
								foreignRef: "raw:materials/transitions/0",
							},
						],
						transitions: [
							{
								id: "import-1:transition-0",
								type: "dissolve",
								fromSegmentId: "import-1:segment-0",
								toSegmentId: "import-1:segment-1",
								durationUs: 500_000,
								capability: "exact",
								foreignRef: "raw:materials/transitions/0",
							},
						],
					},
				],
			},
		],
		resources: [
			{
				id: "import-1:resource-0",
				kind: "video",
				name: "clip-a.mp4",
				originHint: "local-media",
				sha256: "c".repeat(64),
				byteLength: 1_000_000,
				status: "resolved",
				capability: "exact",
			},
			{
				id: "import-1:resource-1",
				kind: "transition-package",
				originHint: "package",
				status: "opaque",
				capability: "opaque",
			},
		],
		links: [
			{
				id: "import-1:link-0",
				type: "video-audio",
				fromId: "import-1:segment-0",
				toId: "import-1:segment-9",
				detached: false,
			},
		],
		issues: [
			{
				code: "FEATURE_OPAQUE",
				severity: "warning",
				message: "Proprietary transition preserved without editing.",
				subjectId: "import-1:segment-1",
				path: "/materials/transitions/0",
			},
		],
	};
}

describe("draft interop document", () => {
	it("round-trips through JSON without loss", () => {
		const original = sampleDocument();
		const parsed = parseDraftInteropDocumentV1(
			JSON.parse(JSON.stringify(original))
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.document).toEqual(original);
	});

	it.each([
		[{ schemaVersion: 2 }, "/schemaVersion"],
		[{ timeUnit: "milliseconds" }, "/timeUnit"],
		[{ project: null }, "/project"],
		[{ links: {} }, "/links"],
	] as const)("fails closed on malformed input %#", (mutation, expectedPath) => {
		const value = {
			...JSON.parse(JSON.stringify(sampleDocument())),
			...mutation,
		};
		const parsed = parseDraftInteropDocumentV1(value);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.issues[0]).toMatchObject({
			code: "DOCUMENT_MALFORMED",
			severity: "error",
			path: expectedPath,
		});
	});

	it("reports the precise path for nested violations", () => {
		const value = JSON.parse(JSON.stringify(sampleDocument()));
		value.timelines[0].tracks[0].segments[0].targetRange.durationUs = -1;
		const parsed = parseDraftInteropDocumentV1(value);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.issues[0].path).toBe(
			"/timelines/0/tracks/0/segments/0/targetRange/durationUs"
		);
	});

	it("rejects zero-duration seam transitions", () => {
		const value = JSON.parse(JSON.stringify(sampleDocument()));
		value.timelines[0].tracks[0].transitions[0].durationUs = 0;
		const parsed = parseDraftInteropDocumentV1(value);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.issues[0].path).toBe(
			"/timelines/0/tracks/0/transitions/0/durationUs"
		);
	});

	it("rejects documents carrying unknown issue codes", () => {
		const value = JSON.parse(JSON.stringify(sampleDocument()));
		value.issues[0].code = "TOTALLY_NEW_CODE";
		const parsed = parseDraftInteropDocumentV1(value);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.issues[0].path).toBe("/issues/0/code");
	});
});

describe("interop capability", () => {
	it("combines to the strictest member and aggregates counts", () => {
		expect(combineInteropCapabilities([])).toBe("exact");
		expect(combineInteropCapabilities(["exact", "exact"])).toBe("exact");
		expect(combineInteropCapabilities(["exact", "downgrade"])).toBe(
			"downgrade"
		);
		expect(combineInteropCapabilities(["downgrade", "opaque"])).toBe("opaque");
		expect(combineInteropCapabilities(["opaque", "blocked", "exact"])).toBe(
			"blocked"
		);

		expect(
			aggregateInteropCapabilities({
				values: ["exact", "exact", "downgrade", "opaque", "blocked"],
			})
		).toEqual({
			exact: 2,
			downgrade: 1,
			opaque: 1,
			blocked: 1,
			total: 5,
			overall: "blocked",
		});
	});

	it("enforces the commit-gate table", () => {
		const base = {
			warningsAccepted: false,
			sameProfile: false,
			nodeUnchanged: false,
		};
		expect(canCommitInteropNode({ ...base, capability: "exact" })).toBe(true);
		expect(canCommitInteropNode({ ...base, capability: "downgrade" })).toBe(
			false
		);
		expect(
			canCommitInteropNode({
				...base,
				capability: "downgrade",
				warningsAccepted: true,
			})
		).toBe(true);
		expect(
			canCommitInteropNode({
				...base,
				capability: "opaque",
				sameProfile: true,
			})
		).toBe(false);
		expect(
			canCommitInteropNode({
				...base,
				capability: "opaque",
				sameProfile: true,
				nodeUnchanged: true,
			})
		).toBe(true);
		expect(
			canCommitInteropNode({
				...base,
				capability: "opaque",
				nodeUnchanged: true,
			})
		).toBe(false);
		expect(
			canCommitInteropNode({
				capability: "blocked",
				warningsAccepted: true,
				sameProfile: true,
				nodeUnchanged: true,
			})
		).toBe(false);
	});
});

describe("interop issues", () => {
	it("keeps the code registry stable and rejects unknown codes", () => {
		expect(isInteropIssueCode("FEATURE_BLOCKED")).toBe(true);
		expect(isInteropIssueCode("NOT_A_CODE")).toBe(false);
		// The registry is a public contract: existing codes must never
		// disappear. Additions append; removals are breaking.
		for (const code of [
			"PROFILE_AMBIGUOUS",
			"PAYLOAD_ENCRYPTED",
			"REF_BROKEN",
			"RESOURCE_MISSING",
			"FEATURE_DOWNGRADED",
			"UNKNOWN_SUBTREE_PRESERVED",
			"DOCUMENT_MALFORMED",
		]) {
			expect(INTEROP_ISSUE_CODES).toContain(code);
		}
	});

	it("fingerprints ignore the message and separate the fields", () => {
		const issue = {
			code: "FEATURE_DOWNGRADED" as const,
			severity: "warning" as const,
			message: "human copy",
			subjectId: "seg-1",
			path: "/a/b",
		};
		const fingerprint = createInteropIssueFingerprint({ issue });
		expect(fingerprint).toBe(
			createInteropIssueFingerprint({
				issue: { ...issue, message: "different copy" },
			})
		);
		expect(fingerprint).not.toBe(
			createInteropIssueFingerprint({
				issue: { ...issue, subjectId: "seg-2" },
			})
		);

		expect(
			collectInteropIssueFingerprints({
				issues: [
					issue,
					{ ...issue, subjectId: "seg-0" },
					{ ...issue, severity: "error" as const },
				],
				severity: "warning",
			})
		).toHaveLength(2);
	});
});
