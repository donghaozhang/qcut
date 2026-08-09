/**
 * Exercise same-profile writeback against an isolated copy of a receipt-bound
 * real CapCut 8.1 draft. The source directory is never mutated.
 *
 * Usage:
 *   bun scripts/capcut-e2e/capcut-8-1-writeback-verification.ts \
 *     --case-id <id> \
 *     --source-draft <draft-dir> \
 *     --source-receipt <envelope-receipt.json> \
 *     --output <new-output-dir> [--app-receipt <receipt.json>] [--json]
 *
 * Exit codes: 0 fully verified, 1 invariant failure, 2 missing real-app gate,
 * 3 harness error.
 */

import { cp, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadCapCut81WritebackAppReceipt } from "./capcut-8-1-writeback-app-receipt.js";
import {
	assessCapCut81WritebackVerification,
	assertWritebackManifestIsPathFree,
	CAPCUT_8_1_WRITEBACK_VERIFICATION_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
	collectChangedJsonPointers,
	type CapCut81WritebackVerificationChecks,
	type CapCut81WritebackVerificationManifest,
} from "./capcut-8-1-writeback-verification-contract.js";
import {
	addControlledSentinel,
	applyControlledTimingEdit,
	arraysEqual,
	assertVerification,
	buildTimingSnapshot,
	hasControlledSentinel,
	isJsonRecord,
	isPathWithin,
	readDigests,
	readSourceReceipt,
	requireSafeCaseId,
	sha256Bytes,
	writeVerificationManifest,
} from "./capcut-8-1-writeback-verification-fixture.js";
import { loadCapCut81WritebackRuntime } from "./capcut-8-1-writeback-verification-runtime.js";

export {
	CAPCUT_8_1_WRITEBACK_VERIFICATION_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
};
export type { CapCut81WritebackVerificationManifest };

export interface CapCut81WritebackVerificationOptions {
	appReceiptPath?: string;
	caseId: string;
	json?: boolean;
	now?: () => Date;
	outputDirectory: string;
	sourceDraftDirectory: string;
	sourceReceiptPath: string;
}

export interface CapCut81WritebackVerificationCliOptions
	extends Omit<CapCut81WritebackVerificationOptions, "now"> {
	json: boolean;
}

export async function runCapCut81WritebackVerification({
	appReceiptPath: appReceiptPathInput,
	caseId,
	now = () => new Date(),
	outputDirectory: outputDirectoryInput,
	sourceDraftDirectory: sourceDraftDirectoryInput,
	sourceReceiptPath: sourceReceiptPathInput,
}: CapCut81WritebackVerificationOptions): Promise<CapCut81WritebackVerificationManifest> {
	requireSafeCaseId({ caseId });
	const outputDirectory = resolve(outputDirectoryInput);
	const sourceDraftDirectory = resolve(sourceDraftDirectoryInput);
	const sourceReceiptPath = resolve(sourceReceiptPathInput);
	const appReceiptPath =
		appReceiptPathInput === undefined
			? undefined
			: resolve(appReceiptPathInput);
	const runtime = await loadCapCut81WritebackRuntime();
	if (
		isPathWithin({
			candidate: outputDirectory,
			parent: sourceDraftDirectory,
		}) ||
		isPathWithin({ candidate: sourceDraftDirectory, parent: outputDirectory })
	) {
		throw new Error(
			"Output and source draft directories must not contain each other."
		);
	}

	const sourceReceipt = await readSourceReceipt({
		path: sourceReceiptPath,
		profileId: runtime.profileId,
	});
	const sourceDiscovery = await runtime.discoverDraftDirectory({
		draftDirectory: sourceDraftDirectory,
	});
	const sourceSnapshot = await runtime.readDraftSourceSnapshot({
		rootRealPath: sourceDiscovery.rootRealPath,
		files: sourceDiscovery.files,
	});
	const originalSourceBytes = await readFile(
		join(sourceDraftDirectory, "draft_info.json")
	);
	assertVerification(
		sourceSnapshot.files.length === sourceReceipt.fileCount &&
			originalSourceBytes.byteLength === sourceReceipt.rootContentByteLength &&
			sha256Bytes({ bytes: originalSourceBytes }) ===
				sourceReceipt.rootContentSha256,
		"Source draft does not match the real-app envelope receipt."
	);
	const originalContent = JSON.parse(
		originalSourceBytes.toString("utf8")
	) as unknown;
	assertVerification(
		isJsonRecord(originalContent),
		"CapCut draft_info.json must be an object."
	);

	await mkdir(outputDirectory, { mode: 0o700 });
	const draftDirectory = join(outputDirectory, "draft-copy");
	await cp(sourceDraftDirectory, draftDirectory, {
		errorOnExist: true,
		recursive: true,
	});
	const { activeMirrorRelativePaths, isolatedSourceBytes, timelineId } =
		await addControlledSentinel({
			buildActiveContentMirrorPaths: runtime.buildActiveContentMirrorPaths,
			draftDirectory,
			originalContent,
		});
	const backupRelativePaths = [
		"draft_info.json.bak",
		`Timelines/${timelineId}/draft_info.json.bak`,
	] as const;
	const backupDigestsBefore = await readDigests({
		draftDirectory,
		relativePaths: backupRelativePaths,
	});

	const session = runtime.createImportSession({
		buildIdentity: {
			appVersion: "capcut-8.1-writeback-verification",
			interopSchemaVersion: 1,
		},
	});
	const inspect = await session.inspect({
		input: { draftPath: draftDirectory },
	});
	assertVerification(
		inspect.outcome === "exact" &&
			inspect.profileId === runtime.profileId &&
			inspect.semantic !== undefined,
		"Isolated copy did not match the exact CapCut 8.1 profile."
	);
	const plan = await session.plan({ input: { draftPath: draftDirectory } });
	assertVerification(
		plan.plan.canCommit,
		"Isolated copy import plan is blocked."
	);
	assertVerification(
		plan.plan.warningFingerprints.length === 0,
		"Verification case requires a zero-warning core-media source."
	);
	const committed = await session.commit({
		input: {
			planToken: plan.plan.planToken,
			acceptedWarningFingerprints: [],
		},
	});
	assertVerification(
		committed.envelopeCapture !== undefined,
		"Envelope capture is missing."
	);
	const payloadBytes = Buffer.from(
		committed.envelopeCapture.payloadBase64,
		"base64"
	);
	const verifiedPayload = await runtime.verifyEnvelopePayload({
		envelope: committed.envelopeCapture.envelope,
		payloadBytes,
	});
	assertVerification(
		verifiedPayload.ok,
		"Envelope payload verification failed."
	);

	const mediaItemIdByResourceId = new Map(
		committed.bundle.resourceStaging.map((resource) => {
			const internalId =
				committed.bundle.internalIdBySemanticId[resource.resourceId];
			assertVerification(
				internalId !== undefined,
				"Staged resource has no QCut id."
			);
			return [resource.resourceId, internalId] as const;
		})
	);
	const tracks = runtime.buildImportTimelineTracks({
		bundle: committed.bundle,
		mediaItemIdByResourceId,
	});
	const timingSnapshot = buildTimingSnapshot({
		bundle: committed.bundle,
		tracks,
	});
	applyControlledTimingEdit({
		bundle: committed.bundle,
		snapshot: timingSnapshot,
	});
	const prepared = runtime.prepareWriteback({
		baselineDocument: committed.bundle.document,
		bytesByPath: verifiedPayload.bytesByPath,
		envelope: committed.envelopeCapture.envelope,
		internalIdBySemanticId: committed.bundle.internalIdBySemanticId,
		snapshot: timingSnapshot,
	});
	assertVerification(
		prepared.ok && prepared.changed,
		"Controlled writeback preparation failed."
	);
	assertVerification(
		prepared.patches.length === 4,
		"Controlled writeback must produce exactly four timing patches."
	);
	assertVerification(
		committed.bundle.document.source.appVersion ===
			sourceReceipt.targetAppVersion,
		"Imported profile app version does not match the source receipt."
	);
	const writeResult = await runtime.writeContent({
		contentBytes: prepared.contentBytes,
		draftDirectory,
		expectedSourceSha256: prepared.expectedSourceSha256,
		profileId: runtime.profileId,
	});

	const activeMirrorDigests = await readDigests({
		draftDirectory,
		relativePaths: activeMirrorRelativePaths,
	});
	const backupDigestsAfter = await readDigests({
		draftDirectory,
		relativePaths: backupRelativePaths,
	});
	const writtenBytes = await readFile(join(draftDirectory, "draft_info.json"));
	const writtenContent = JSON.parse(writtenBytes.toString("utf8")) as unknown;
	const isolatedSourceContent = JSON.parse(
		new TextDecoder().decode(isolatedSourceBytes)
	) as unknown;
	const changedJsonPointers = collectChangedJsonPointers({
		left: isolatedSourceContent,
		right: writtenContent,
	}).sort();
	const plannedJsonPointers = prepared.patches
		.map(({ jsonPointer }) => jsonPointer)
		.sort();
	const recovery = await runtime.recoverWriteback({
		draftDirectory,
	});
	const sourceChanges = await runtime.verifyDraftSourceUnchanged({
		snapshot: sourceSnapshot,
	});
	const checks: CapCut81WritebackVerificationChecks = {
		activeMirrorsMatchOutput: activeMirrorDigests.every(
			(digest) => digest === writeResult.contentSha256
		),
		backupMirrorsUnchanged: arraysEqual({
			left: backupDigestsBefore,
			right: backupDigestsAfter,
		}),
		onlyPlannedPointersChanged: arraysEqual({
			left: changedJsonPointers,
			right: plannedJsonPointers,
		}),
		originalSourceUnchanged: sourceChanges.length === 0,
		recoveryStateClean: recovery.action === "none",
		unknownSentinelPreserved: hasControlledSentinel({
			content: writtenContent,
		}),
	};
	const appVerification =
		appReceiptPath === undefined
			? undefined
			: await loadCapCut81WritebackAppReceipt({
					expected: {
						activeMirrorTemplates: runtime.activeContentMirrorTemplates,
						caseId,
						outputContentSha256: writeResult.contentSha256,
						profileId: runtime.profileId,
					},
					path: appReceiptPath,
				});
	const assessment = assessCapCut81WritebackVerification({
		appVerification,
		checks,
	});
	const manifest: CapCut81WritebackVerificationManifest = {
		schema: CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA,
		schemaVersion: 2,
		caseId,
		generatedAtIso: now().toISOString(),
		profile: {
			profileId: runtime.profileId,
			...(committed.bundle.document.source.appVersion === undefined
				? {}
				: { appVersion: committed.bundle.document.source.appVersion }),
			detectionOutcome: "exact",
		},
		provenance: {
			source: "real-capcut-saved-draft",
			sourceReceiptId: sourceReceipt.receiptId,
			isolation: "copy-before-mutation",
			controlledUnknownSentinel: true,
			appVerification: appVerification ?? null,
		},
		importEvidence: {
			fileCount: inspect.fileCount,
			trackCount: inspect.semantic.trackCount,
			segmentCount: inspect.semantic.segmentCount,
			resourceCount: inspect.semantic.resourceCount,
			warningCount: plan.plan.warningFingerprints.length,
		},
		transactionEvidence: {
			activeMirrorCount: 4,
			activeMirrorTemplates: runtime.activeContentMirrorTemplates,
			backupMirrorCount: 2,
			changedJsonPointers,
			plannedPatchCount: prepared.patches.length,
			originalSourceContentSha256: sourceReceipt.rootContentSha256,
			isolatedSourceContentSha256: sha256Bytes({
				bytes: isolatedSourceBytes,
			}),
			outputContentSha256: writeResult.contentSha256,
			recoveryAction: recovery.action,
		},
		checks,
		verdict: assessment.verdict,
		...(assessment.notVerifiedReason === undefined
			? {}
			: { notVerifiedReason: assessment.notVerifiedReason }),
	};
	assertWritebackManifestIsPathFree({
		forbiddenAbsolutePaths: [
			sourceDraftDirectory,
			sourceReceiptPath,
			outputDirectory,
			draftDirectory,
			...(appReceiptPath === undefined ? [] : [appReceiptPath]),
		],
		manifest,
	});
	await writeVerificationManifest({ manifest, outputDirectory });
	return manifest;
}

const CLI_VALUE_FLAGS = [
	"--app-receipt",
	"--case-id",
	"--source-draft",
	"--source-receipt",
	"--output",
] as const;

type CliValueFlag = (typeof CLI_VALUE_FLAGS)[number];

function isCliValueFlag({ flag }: { flag: string }): boolean {
	return CLI_VALUE_FLAGS.some((candidate) => candidate === flag);
}

function requireCliValue({
	flag,
	values,
}: {
	flag: CliValueFlag;
	values: ReadonlyMap<CliValueFlag, string>;
}): string {
	const value = values.get(flag);
	if (value === undefined) throw new Error(`Missing required flag: ${flag}`);
	return value;
}

export function parseCapCut81WritebackVerificationCliOptions({
	argv,
}: {
	argv: string[];
}): CapCut81WritebackVerificationCliOptions {
	const values = new Map<CliValueFlag, string>();
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index] ?? "";
		if (flag === "--json") {
			if (json) throw new Error("Duplicate flag: --json");
			json = true;
			continue;
		}
		if (!isCliValueFlag({ flag })) throw new Error(`Unknown flag: ${flag}`);
		const valueFlag = flag as CliValueFlag;
		if (values.has(valueFlag)) throw new Error(`Duplicate flag: ${flag}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		values.set(valueFlag, value);
		index += 1;
	}
	return {
		...(values.has("--app-receipt")
			? { appReceiptPath: values.get("--app-receipt") }
			: {}),
		caseId: requireCliValue({ flag: "--case-id", values }),
		json,
		outputDirectory: requireCliValue({ flag: "--output", values }),
		sourceDraftDirectory: requireCliValue({ flag: "--source-draft", values }),
		sourceReceiptPath: requireCliValue({ flag: "--source-receipt", values }),
	};
}

async function main(): Promise<void> {
	const options = parseCapCut81WritebackVerificationCliOptions({
		argv: process.argv.slice(2),
	});
	const manifest = await runCapCut81WritebackVerification(options);
	process.stdout.write(
		options.json
			? `${JSON.stringify(manifest, null, 2)}\n`
			: `case: ${manifest.caseId}\nverdict: ${manifest.verdict}\n`
	);
	if (manifest.verdict === "fail") process.exitCode = 1;
	if (manifest.verdict === "unverified") process.exitCode = 2;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	resolve(process.cwd()),
	"scripts",
	"capcut-e2e",
	"capcut-8-1-writeback-verification.ts"
);
if (entryPath === expectedEntryPath) {
	void main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`capcut-8.1-writeback-verification error: ${message}\n`
		);
		process.exitCode = 3;
	});
}
