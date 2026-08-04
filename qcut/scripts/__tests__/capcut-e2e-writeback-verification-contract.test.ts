import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	assessCapCut81WritebackVerification,
	assertWritebackManifestIsPathFree,
	CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
	collectChangedJsonPointers,
	type CapCut81WritebackVerificationChecks,
	type CapCut81WritebackVerificationManifest,
} from "../capcut-e2e/capcut-8-1-writeback-verification-contract";
import { parseCapCut81WritebackVerificationCliOptions } from "../capcut-e2e/capcut-8-1-writeback-verification";

const PASSING_CHECKS: CapCut81WritebackVerificationChecks = {
	activeMirrorsMatchOutput: true,
	backupMirrorsUnchanged: true,
	onlyPlannedPointersChanged: true,
	originalSourceUnchanged: true,
	recoveryStateClean: true,
	unknownSentinelPreserved: true,
};

function readRealCopyReceipt(): CapCut81WritebackVerificationManifest {
	const receiptPath = join(
		process.cwd(),
		"scripts/capcut-e2e/receipts/capcut-8.1.1-same-profile-writeback-2026-08-05.json"
	);
	return JSON.parse(
		readFileSync(receiptPath, "utf8")
	) as CapCut81WritebackVerificationManifest;
}

function manifest(): CapCut81WritebackVerificationManifest {
	return {
		schema: CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
		schemaVersion: 1,
		caseId: "case-1",
		generatedAtIso: "2026-08-05T00:00:00.000Z",
		profile: {
			profileId: "capcut-desktop-8.1-plaintext",
			appVersion: "8.1.1",
			detectionOutcome: "exact",
		},
		provenance: {
			source: "real-capcut-saved-draft",
			sourceReceiptId: "capcut-8.1.1-envelope-capture-2026-08-04",
			isolation: "copy-before-mutation",
			controlledUnknownSentinel: true,
			realAppOpenSaveReopenVerified: false,
		},
		importEvidence: {
			fileCount: 25,
			trackCount: 2,
			segmentCount: 2,
			resourceCount: 2,
			warningCount: 0,
		},
		transactionEvidence: {
			activeMirrorCount: 4,
			activeMirrorTemplates: [
				"draft_info.json",
				"template-2.tmp",
				"Timelines/{timelineId}/draft_info.json",
				"Timelines/{timelineId}/template-2.tmp",
			],
			backupMirrorCount: 2,
			changedJsonPointers: ["/tracks/0/segments/0/target_timerange/start"],
			plannedPatchCount: 1,
			originalSourceContentSha256: "a".repeat(64),
			isolatedSourceContentSha256: "b".repeat(64),
			outputContentSha256: "c".repeat(64),
			recoveryAction: "none",
		},
		checks: PASSING_CHECKS,
		verdict: "unverified",
		notVerifiedReason: "CapCut 8.1 application receipt is missing.",
	};
}

describe("CapCut 8.1 writeback verification contract", () => {
	it("reports every changed scalar with escaped JSON pointers", () => {
		expect(
			collectChangedJsonPointers({
				left: { list: [{ keep: true, "a/b": 1 }], stable: "yes" },
				right: { list: [{ keep: true, "a/b": 2 }], stable: "yes" },
			})
		).toEqual(["/list/0/a~1b"]);
	});

	it("keeps a successful isolated transaction unverified without an app receipt", () => {
		expect(
			assessCapCut81WritebackVerification({
				checks: PASSING_CHECKS,
				realAppOpenSaveReopenVerified: false,
			})
		).toEqual({
			verdict: "unverified",
			notVerifiedReason: expect.stringContaining("CapCut 8.1"),
		});
	});

	it("passes only after the transaction and real-app gates both pass", () => {
		expect(
			assessCapCut81WritebackVerification({
				checks: PASSING_CHECKS,
				realAppOpenSaveReopenVerified: true,
			})
		).toEqual({ verdict: "pass" });
	});

	it("fails when any transaction invariant is false", () => {
		expect(
			assessCapCut81WritebackVerification({
				checks: { ...PASSING_CHECKS, backupMirrorsUnchanged: false },
				realAppOpenSaveReopenVerified: true,
			})
		).toEqual({ verdict: "fail" });
	});

	it("rejects absolute input paths in evidence", () => {
		const value = manifest();
		value.notVerifiedReason = "copied from /private/source/draft";
		expect(() =>
			assertWritebackManifestIsPathFree({
				forbiddenAbsolutePaths: ["/private/source/draft"],
				manifest: value,
			})
		).toThrow("absolute path");
	});

	it("parses the receipt-bound isolated-copy command", () => {
		expect(
			parseCapCut81WritebackVerificationCliOptions({
				argv: [
					"--case-id",
					"real-8.1-writeback",
					"--source-draft",
					"/draft",
					"--source-receipt",
					"/receipt.json",
					"--output",
					"/evidence",
					"--json",
				],
			})
		).toEqual({
			caseId: "real-8.1-writeback",
			json: true,
			outputDirectory: "/evidence",
			sourceDraftDirectory: "/draft",
			sourceReceiptPath: "/receipt.json",
		});
	});

	it("rejects missing and duplicate CLI values", () => {
		expect(() =>
			parseCapCut81WritebackVerificationCliOptions({
				argv: ["--case-id", "case"],
			})
		).toThrow("--output");
		expect(() =>
			parseCapCut81WritebackVerificationCliOptions({
				argv: ["--case-id", "one", "--case-id", "two"],
			})
		).toThrow("Duplicate flag");
	});

	it("keeps the real-copy receipt path-free and honestly unverified", () => {
		const receipt = readRealCopyReceipt();
		expect(receipt).toMatchObject({
			schema: CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
			schemaVersion: 1,
			profile: {
				profileId: "capcut-desktop-8.1-plaintext",
				appVersion: "8.1.1",
				detectionOutcome: "exact",
			},
			provenance: {
				sourceReceiptId: "capcut-8.1.1-envelope-capture-2026-08-04",
				realAppOpenSaveReopenVerified: false,
			},
			transactionEvidence: {
				activeMirrorCount: 4,
				backupMirrorCount: 2,
				plannedPatchCount: 4,
				recoveryAction: "none",
			},
			checks: PASSING_CHECKS,
			verdict: "unverified",
		});
		const serialized = JSON.stringify(receipt);
		expect(serialized).not.toContain("/Users/");
		expect(serialized).not.toContain("/private/");
		expect(serialized).not.toContain("/var/folders/");
		expect(serialized).not.toMatch(
			/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu
		);
	});
});
