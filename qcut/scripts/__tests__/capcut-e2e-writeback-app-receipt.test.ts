import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	CAPCUT_GUI_RESULT_SCHEMA,
	CAPCUT_GUI_RESULT_SCHEMA_VERSION,
	type CapCut81WritebackAppReceipt,
} from "../capcut-e2e/capcut-8-1-writeback-app-receipt-contract";
import {
	loadCapCut81WritebackAppReceipt,
	parseCapCut81WritebackAppReceipt,
} from "../capcut-e2e/capcut-8-1-writeback-app-receipt";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
	CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	CAPCUT_GUI_CODESIGN_PATH,
} from "../capcut-e2e/gui-regression-app-signature";

const PROFILE_ID = "capcut-desktop-8.1-plaintext";
const OUTPUT_SHA256 = "1".repeat(64);
const SAVED_SHA256 = "2".repeat(64);
const ACTIVE_MIRROR_TEMPLATES = [
	"draft_info.json",
	"template-2.tmp",
	"Timelines/{timelineId}/draft_info.json",
	"Timelines/{timelineId}/template-2.tmp",
] as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

function buildMirrors({ sha256 }: { sha256: string }) {
	return ACTIVE_MIRROR_TEMPLATES.map((template) => ({
		byteLength: 4096,
		sha256,
		template,
	})) as unknown as CapCut81WritebackAppReceipt["phases"][number]["activeMirrors"];
}

function buildReceipt(): CapCut81WritebackAppReceipt {
	return {
		app: {
			bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
			bundleVersion: "8.1.1",
			executableSha256: "a".repeat(64),
			infoPlistSha256: "b".repeat(64),
			shortVersion: "8.1.1",
			signature: {
				authorities: CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
				cdHash: "c".repeat(40),
				codesignPath: CAPCUT_GUI_CODESIGN_PATH,
				designatedRequirement: CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
				identifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
				teamIdentifier: CAPCUT_GUI_APP_TEAM_IDENTIFIER,
			},
		},
		caseId: "capcut-8-1-writeback",
		generatedAtIso: "2026-08-05T04:00:00.000Z",
		harness: {
			applicationState: "quiescent",
			planSha256: "d".repeat(64),
			processBoundaries: {
				finalProcessState: "absent",
				initialProcessState: "absent",
				openProcessGenerationSha256: "e".repeat(64),
				reopenProcessGenerationSha256: "f".repeat(64),
				saveAndQuitProcessState: "absent",
			},
			resultSha256: "3".repeat(64),
			runId: "gui-run-1",
			runnerSchema: CAPCUT_GUI_RESULT_SCHEMA,
			runnerSchemaVersion: CAPCUT_GUI_RESULT_SCHEMA_VERSION,
		},
		phases: [
			{
				activeMirrors: buildMirrors({ sha256: OUTPUT_SHA256 }),
				capturedAtIso: "2026-08-05T01:00:00.000Z",
				phase: "pre-open",
				unknownSentinelPreserved: true,
			},
			{
				activeMirrors: buildMirrors({ sha256: SAVED_SHA256 }),
				capturedAtIso: "2026-08-05T02:00:00.000Z",
				phase: "saved",
				unknownSentinelPreserved: true,
			},
			{
				activeMirrors: buildMirrors({ sha256: SAVED_SHA256 }),
				capturedAtIso: "2026-08-05T03:00:00.000Z",
				phase: "reopened",
				unknownSentinelPreserved: true,
			},
		],
		profile: {
			appVersion: "8.1.1",
			detectionOutcome: "exact",
			profileId: PROFILE_ID,
		},
		schema: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	};
}

function parse({ value = buildReceipt() }: { value?: unknown } = {}) {
	return parseCapCut81WritebackAppReceipt({
		expected: {
			activeMirrorTemplates: ACTIVE_MIRROR_TEMPLATES,
			caseId: "capcut-8-1-writeback",
			outputContentSha256: OUTPUT_SHA256,
			profileId: PROFILE_ID,
		},
		value,
	});
}

describe("CapCut 8.1 writeback app receipt", () => {
	it("accepts an exact app, distinct process generations, and stable reopen mirrors", () => {
		expect(parse()).toMatchObject({
			app: {
				bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
				shortVersion: "8.1.1",
			},
			caseId: "capcut-8-1-writeback",
			phases: [
				{ phase: "pre-open" },
				{ phase: "saved" },
				{ phase: "reopened" },
			],
		});
	});

	it("rejects CapCut 9.1 even when the remaining receipt is valid", () => {
		const receipt = structuredClone(buildReceipt()) as unknown as {
			app: { shortVersion: string };
		};
		receipt.app.shortVersion = "9.1.0";
		expect(() => parse({ value: receipt })).toThrow("exact version 8.1.1");
	});

	it("rejects a receipt bound to a different pre-open output hash", () => {
		const receipt = structuredClone(buildReceipt());
		receipt.phases[0].activeMirrors = buildMirrors({ sha256: "4".repeat(64) });
		expect(() => parse({ value: receipt })).toThrow("writeback output");
	});

	it("rejects a receipt without all three ordered phases", () => {
		const receipt = structuredClone(buildReceipt()) as unknown as {
			phases: unknown[];
		};
		receipt.phases.pop();
		expect(() => parse({ value: receipt })).toThrow(
			"pre-open, saved, and reopened"
		);
	});

	it("rejects reuse of the same process generation for open and reopen", () => {
		const receipt = structuredClone(buildReceipt());
		receipt.harness.processBoundaries.reopenProcessGenerationSha256 =
			receipt.harness.processBoundaries.openProcessGenerationSha256;
		expect(() => parse({ value: receipt })).toThrow("distinct open and reopen");
	});

	it("rejects a reopened draft whose active content differs from the saved state", () => {
		const receipt = structuredClone(buildReceipt());
		receipt.phases[2].activeMirrors = buildMirrors({ sha256: "5".repeat(64) });
		expect(() => parse({ value: receipt })).toThrow("stable reopen state");
	});

	it("loads a bounded file and returns only path-free hash bindings", async () => {
		const directory = await mkdtemp(join(tmpdir(), "qcut-capcut-app-receipt-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "app-receipt.json");
		const bytes = Buffer.from(
			`${JSON.stringify(buildReceipt(), null, 2)}\n`,
			"utf8"
		);
		await writeFile(path, bytes, { flag: "wx", mode: 0o600 });

		const verification = await loadCapCut81WritebackAppReceipt({
			expected: {
				activeMirrorTemplates: ACTIVE_MIRROR_TEMPLATES,
				caseId: "capcut-8-1-writeback",
				outputContentSha256: OUTPUT_SHA256,
				profileId: PROFILE_ID,
			},
			path,
		});

		expect(verification).toEqual({
			app: {
				bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
				bundleVersion: "8.1.1",
				cdHash: "c".repeat(40),
				executableSha256: "a".repeat(64),
				infoPlistSha256: "b".repeat(64),
				shortVersion: "8.1.1",
			},
			harness: {
				planSha256: "d".repeat(64),
				resultSha256: "3".repeat(64),
				runId: "gui-run-1",
			},
			preOpenContentSha256: OUTPUT_SHA256,
			receiptSha256: createHash("sha256").update(bytes).digest("hex"),
			reopenedContentSha256: SAVED_SHA256,
			savedContentSha256: SAVED_SHA256,
		});
		expect(JSON.stringify(verification)).not.toContain(directory);
	});
});
