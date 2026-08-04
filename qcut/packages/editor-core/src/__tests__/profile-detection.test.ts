import { describe, expect, it } from "vitest";
import type { DraftSourceFile } from "../draft-interop/document.js";
import {
	detectDraftProfile,
	toProfileDetectionEvidence,
} from "../jianying-draft/import/profile-detection.js";
import { CAPCUT_8_1_TOP_LEVEL_KEYS } from "../jianying-draft/capcut-8-1-profile.js";
import {
	getDraftProfile,
	isDraftProfileWritable,
	listDraftProfiles,
	PLAINTEXT_5_9_PROFILE,
	PLAINTEXT_5_9_PROFILE_ID,
	PLAINTEXT_5_9_TOP_LEVEL_KEYS,
	registerDraftProfile,
} from "../jianying-draft/profiles/index.js";

/**
 * JYI-003 acceptance: exact / ambiguous / unsupported / encrypted fixtures,
 * and no writable outcome for anything except an exact, stable profile.
 */

function plaintextFiles(): DraftSourceFile[] {
	return [
		{
			relativePath: "draft_info.json",
			byteLength: 4096,
			sha256: "a".repeat(64),
			role: "content",
			classification: "plaintext-json",
		},
	];
}

describe("profile registry", () => {
	it("registers the two known profiles exactly once", () => {
		const ids = listDraftProfiles().map((profile) => profile.profileId);
		expect(ids).toContain(PLAINTEXT_5_9_PROFILE_ID);
		expect(ids).toContain("capcut-desktop-8.1-plaintext");
		expect(() =>
			registerDraftProfile({ contract: PLAINTEXT_5_9_PROFILE })
		).toThrow(/already registered/);
	});

	it("treats fixture and candidate writeback as non-writable", () => {
		for (const profile of listDraftProfiles()) {
			expect(isDraftProfileWritable({ profileId: profile.profileId })).toBe(
				false
			);
		}
		expect(getDraftProfile({ profileId: "unknown" })).toBeNull();
	});
});

describe("profile detection", () => {
	it("detects CapCut 8.1 exactly from full evidence", () => {
		const result = detectDraftProfile({
			files: plaintextFiles(),
			contentSummary: {
				fileName: "draft_info.json",
				topLevelKeys: [...CAPCUT_8_1_TOP_LEVEL_KEYS],
				appId: 359_289,
				appSource: "cc",
				appVersion: "8.1.1",
				schemaVersion: 360_000,
				newVersion: "159.0.0",
			},
		});
		expect(result.outcome).toBe("exact");
		expect(result.profileId).toBe("capcut-desktop-8.1-plaintext");
		// Exact but not real-app-verified stable writeback: still not writable.
		expect(result.canWrite).toBe(false);

		const evidence = toProfileDetectionEvidence({ result });
		expect(evidence.outcome).toBe("exact");
		expect(evidence.signals.every((signal) => signal.matched)).toBe(true);
	});

	it("detects the new_version written by a CapCut 8.1.1 save", () => {
		const result = detectDraftProfile({
			files: plaintextFiles(),
			contentSummary: {
				fileName: "draft_info.json",
				topLevelKeys: [...CAPCUT_8_1_TOP_LEVEL_KEYS],
				appId: 359_289,
				appSource: "cc",
				appVersion: "8.1.1",
				schemaVersion: 360_000,
				newVersion: "179.0.0",
			},
		});
		expect(result.outcome).toBe("exact");
		expect(result.profileId).toBe("capcut-desktop-8.1-plaintext");
	});

	it("detects synthetic 5.9 exactly and distinguishes it from 8.1", () => {
		const result = detectDraftProfile({
			files: plaintextFiles(),
			contentSummary: {
				fileName: "draft_info.json",
				topLevelKeys: [...PLAINTEXT_5_9_TOP_LEVEL_KEYS],
				appId: 3704,
				appSource: "lv",
				appVersion: "5.9.0",
				schemaVersion: 360_000,
				newVersion: "110.0.0",
			},
		});
		expect(result.outcome).toBe("exact");
		expect(result.profileId).toBe(PLAINTEXT_5_9_PROFILE_ID);
		expect(result.canWrite).toBe(false);
	});

	it("reports ambiguity when app metadata is missing and forbids writing", () => {
		// The 5.9 key set is a subset of 8.1's, so keys alone cannot decide.
		const result = detectDraftProfile({
			files: plaintextFiles(),
			contentSummary: {
				fileName: "draft_info.json",
				topLevelKeys: [...CAPCUT_8_1_TOP_LEVEL_KEYS],
			},
		});
		expect(result.outcome).toBe("ambiguous");
		expect(result.profileId).toBeUndefined();
		expect(result.canWrite).toBe(false);
		expect(
			result.candidates.filter((candidate) => candidate.partial).length
		).toBeGreaterThan(1);
	});

	it("reports unsupported for a foreign layout", () => {
		const result = detectDraftProfile({
			files: [
				{
					relativePath: "project.json",
					byteLength: 10,
					sha256: "b".repeat(64),
					role: "content",
					classification: "plaintext-json",
				},
			],
			contentSummary: {
				fileName: "project.json",
				topLevelKeys: ["scenes", "clips"],
			},
		});
		expect(result.outcome).toBe("unsupported");
		expect(result.canWrite).toBe(false);
	});

	it("reports encrypted content as terminal, without candidates", () => {
		const result = detectDraftProfile({
			files: [
				{
					relativePath: "draft_info.json",
					byteLength: 8192,
					sha256: "c".repeat(64),
					role: "content",
					classification: "encrypted",
				},
			],
		});
		expect(result.outcome).toBe("encrypted");
		expect(result.candidates).toEqual([]);
		expect(result.canWrite).toBe(false);
	});

	it("never decides from a file name alone", () => {
		// Right name, no readable evidence at all: unsupported, not a guess.
		const result = detectDraftProfile({ files: plaintextFiles() });
		expect(result.outcome).toBe("unsupported");
		expect(result.canWrite).toBe(false);
	});
});
