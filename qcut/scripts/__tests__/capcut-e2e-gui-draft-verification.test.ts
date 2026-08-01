import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNonCurrentDraftsUnchanged } from "../capcut-e2e/gui-regression-draft-boundary.js";
import {
	verifyCapCutGuiDraftPhase,
	type CapCutGuiDraftVerificationPhase,
} from "../capcut-e2e/gui-regression-draft-verification.js";
import {
	captureCapCutGuiRootFingerprint,
	type CapCutGuiRootFingerprint,
} from "../capcut-e2e/gui-regression-evidence.js";
import type { CapCutGuiBundleCase } from "../capcut-e2e/gui-regression-contract.js";
import {
	verifyDraftsAfterGuiStep,
	verifyFinalDrafts,
} from "../capcut-e2e/gui-regression-step-draft-verification.js";
import {
	cleanupGuiFixtures,
	createGuiFixture,
	type GuiFixture,
	preflightFixture,
} from "./capcut-e2e-gui-fixture.js";
import { writeRootDraftIds } from "./capcut-e2e-gui-store-fixture.js";

afterEach(cleanupGuiFixtures);

const FULL_DURATION = 6_000_000;
const CLIP_DURATION = 3_000_000;

interface InstalledDraftHarness {
	bundle: CapCutGuiBundleCase;
	fixture: GuiFixture;
	ownerUid: number;
	plannedBundles: readonly CapCutGuiBundleCase[];
	rootFingerprint: CapCutGuiRootFingerprint;
}

function mediaRange({
	duration,
	sourceStart,
	targetStart,
}: {
	duration: number;
	sourceStart: number;
	targetStart: number;
}) {
	return {
		source_timerange: { duration, start: sourceStart },
		target_timerange: { duration, start: targetStart },
	};
}

function dissolveContent() {
	return {
		duration: FULL_DURATION,
		materials: {
			transitions: [
				{
					duration: 466_666,
					id: "transition-material",
					name: "Dissolve",
					type: "transition",
				},
			],
			videos: [{ id: "video-material" }],
		},
		tracks: [
			{
				segments: [
					{
						extra_material_refs: ["speed-a", "transition-material"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: 0,
							targetStart: 0,
						}),
					},
					{
						extra_material_refs: ["speed-b"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: CLIP_DURATION,
							targetStart: CLIP_DURATION,
						}),
					},
				],
				type: "video",
			},
		],
	};
}

async function captureFixtureRoot({
	bundle,
	bundles = [bundle],
	fixture,
	ownerUid,
	preflightRoot,
}: {
	bundle: CapCutGuiBundleCase;
	bundles?: readonly CapCutGuiBundleCase[];
	fixture: GuiFixture;
	ownerUid: number;
	preflightRoot: CapCutGuiRootFingerprint;
}): Promise<CapCutGuiRootFingerprint> {
	return captureCapCutGuiRootFingerprint({
		bundles,
		canonicalStorePath: fixture.canonicalStorePath,
		expectedStoreSentinelIntegrity: preflightRoot.storeSentinelIntegrity,
		ownerUid,
		rootMetaInfoPath: fixture.rootMetaInfoPath,
	});
}

async function createInstalledDraftHarness({
	caseId = "native-text-sticker",
}: {
	caseId?: CapCutGuiBundleCase["caseId"];
} = {}): Promise<InstalledDraftHarness> {
	const fixture = await createGuiFixture();
	const preflight = await preflightFixture({ fixture });
	const bundle = preflight.bundleRun.bundles.find(
		(candidate) => candidate.caseId === caseId
	);
	if (!bundle) throw new Error(`Fixture requires ${caseId}.`);
	await writeRootDraftIds({ draftIds: [bundle.draftId], fixture });
	const rootFingerprint = await captureCapCutGuiRootFingerprint({
		bundles: preflight.bundleRun.bundles,
		canonicalStorePath: fixture.canonicalStorePath,
		expectedStoreSentinelIntegrity:
			preflight.rootFingerprint.storeSentinelIntegrity,
		ownerUid: preflight.identity.processUid,
		rootMetaInfoPath: fixture.rootMetaInfoPath,
	});
	return {
		bundle,
		fixture,
		ownerUid: preflight.identity.processUid,
		plannedBundles: preflight.bundleRun.bundles,
		rootFingerprint,
	};
}

async function verifyHarnessPhase({
	harness,
	phase,
}: {
	harness: InstalledDraftHarness;
	phase: CapCutGuiDraftVerificationPhase;
}) {
	return verifyCapCutGuiDraftPhase({
		bundle: harness.bundle,
		phase,
		rootFingerprint: harness.rootFingerprint,
	});
}

describe("CapCut GUI installed-draft verification", () => {
	it("proves exact source/target directories, relative paths, bytes, and hashes", async () => {
		const harness = await createInstalledDraftHarness();
		const result = await verifyHarnessPhase({
			harness,
			phase: "installed",
		});

		expect(result).toMatchObject({
			caseId: "native-text-sticker",
			directoryCount: harness.bundle.verification.draftDirectories.length + 1,
			fileCount: harness.bundle.verification.draftFiles.length,
			phase: "installed",
			status: "source-byte-equivalent",
		});
		expect(result).toHaveProperty(
			"installedInventorySha256",
			expect.stringMatching(/^[a-f0-9]{64}$/u)
		);
		if (result.status !== "source-byte-equivalent") {
			throw new Error("Expected installed draft verification.");
		}
		expect(result).toHaveProperty(
			"sourceInventorySha256",
			result.installedInventorySha256
		);
	});

	it.each([
		{
			label: "missing file",
			mutate: ({ draftDirectory }: { draftDirectory: string }) =>
				rm(join(draftDirectory, "draft_info.json")),
		},
		{
			label: "extra file",
			mutate: ({ draftDirectory }: { draftDirectory: string }) =>
				writeFile(join(draftDirectory, "extra.bin"), "extra", "utf8"),
		},
		{
			label: "extra directory",
			mutate: ({ draftDirectory }: { draftDirectory: string }) =>
				mkdir(join(draftDirectory, "unexpected")),
		},
		{
			label: "replaced contents",
			mutate: ({ draftDirectory }: { draftDirectory: string }) =>
				writeFile(join(draftDirectory, "draft_info.json"), "different", "utf8"),
		},
	])("rejects a target draft with a $label", async ({ mutate }) => {
		const harness = await createInstalledDraftHarness();
		const draftDirectory = join(
			harness.fixture.canonicalStorePath,
			harness.bundle.verification.draftFolderName
		);
		await mutate({ draftDirectory });
		harness.rootFingerprint = await captureFixtureRoot({
			bundle: harness.bundle,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});

		await expect(
			verifyHarnessPhase({ harness, phase: "installed" })
		).rejects.toThrow("does not exactly match its verified source bundle");
	});

	it("rejects a symlink before treating it as installed evidence", async () => {
		const harness = await createInstalledDraftHarness();
		const draftDirectory = join(
			harness.fixture.canonicalStorePath,
			harness.bundle.verification.draftFolderName
		);
		const targetPath = join(draftDirectory, "draft_info.json");
		await rm(targetPath);
		await symlink(
			join(harness.bundle.draftDirectory, "draft_info.json"),
			targetPath
		);

		await expect(
			captureFixtureRoot({
				bundle: harness.bundle,
				fixture: harness.fixture,
				ownerUid: harness.ownerUid,
				preflightRoot: harness.rootFingerprint,
			})
		).rejects.toThrow("must not contain symlinks");
	});

	it("rejects same-byte replacement of a previously installed draft", async () => {
		const harness = await createInstalledDraftHarness();
		const targetPath = join(
			harness.fixture.canonicalStorePath,
			harness.bundle.verification.draftFolderName,
			"assets",
			"source.bin"
		);
		const bytes = await readFile(targetPath);
		await rm(targetPath);
		await writeFile(targetPath, bytes);
		const rootFingerprintAfter = await captureFixtureRoot({
			bundle: harness.bundle,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});

		expect(() =>
			assertNonCurrentDraftsUnchanged({
				bundles: harness.plannedBundles,
				currentCaseId: "dissolve",
				rootFingerprintAfter,
				rootFingerprintBefore: harness.rootFingerprint,
			})
		).toThrow("non-current draft changed during dissolve");
	});
});

describe("CapCut GUI cross-case draft boundaries", () => {
	it("rejects mutation of a non-current draft after any GUI step", async () => {
		const harness = await createInstalledDraftHarness();
		const dissolve = harness.plannedBundles.find(
			({ caseId }) => caseId === "dissolve"
		);
		if (!dissolve) throw new Error("Fixture requires dissolve.");
		await writeRootDraftIds({
			draftIds: [harness.bundle.draftId, dissolve.draftId],
			fixture: harness.fixture,
		});
		const rootFingerprintBefore = await captureFixtureRoot({
			bundle: harness.bundle,
			bundles: harness.plannedBundles,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});
		await writeFile(
			join(
				harness.fixture.canonicalStorePath,
				dissolve.verification.draftFolderName,
				"assets",
				"source.bin"
			),
			"cross-case-tamper",
			"utf8"
		);
		const rootFingerprintAfter = await captureFixtureRoot({
			bundle: harness.bundle,
			bundles: harness.plannedBundles,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: rootFingerprintBefore,
		});
		const verifyDraftPhase = vi.fn(verifyCapCutGuiDraftPhase);

		await expect(
			verifyDraftsAfterGuiStep({
				bundles: harness.plannedBundles,
				rootFingerprintAfter,
				rootFingerprintBefore,
				step: {
					action: "capture-export",
					caseId: "native-text-sticker",
					description: "Capture current-case export.",
					evidencePaths: [],
					expectedCheckIds: [],
					sequence: 1,
				},
				verifyDraftPhase,
			})
		).rejects.toThrow("dissolve non-current draft changed");
		expect(verifyDraftPhase).not.toHaveBeenCalled();
	});

	it("rechecks all three drafts at the final root boundary", async () => {
		const harness = await createInstalledDraftHarness();
		await writeRootDraftIds({
			draftIds: harness.plannedBundles.map(({ draftId }) => draftId),
			fixture: harness.fixture,
		});
		const rootFingerprint = await captureFixtureRoot({
			bundle: harness.bundle,
			bundles: harness.plannedBundles,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});
		const verifyDraftPhase = vi.fn(verifyCapCutGuiDraftPhase);

		const receipts = await verifyFinalDrafts({
			bundles: harness.plannedBundles,
			rootFingerprint,
			verifyDraftPhase,
		});

		expect(receipts).toHaveLength(3);
		expect(receipts.every(({ phase }) => phase === "final")).toBe(true);
		expect(verifyDraftPhase).toHaveBeenCalledTimes(3);
	});
});

describe("CapCut GUI saved/reopened semantic verification", () => {
	it("verifies every active content mirror with existing case invariants", async () => {
		const harness = await createInstalledDraftHarness({ caseId: "dissolve" });
		const draftDirectory = join(
			harness.fixture.canonicalStorePath,
			harness.bundle.verification.draftFolderName
		);
		const timelineDirectory = join(
			draftDirectory,
			"Timelines",
			harness.bundle.verification.ids.timelineId
		);
		await mkdir(timelineDirectory, { recursive: true });
		const contentText = JSON.stringify(dissolveContent());
		await Promise.all(
			[
				join(draftDirectory, "draft_info.json"),
				join(draftDirectory, "template-2.tmp"),
				join(timelineDirectory, "draft_info.json"),
				join(timelineDirectory, "template-2.tmp"),
			].map((path) => writeFile(path, contentText, "utf8"))
		);
		harness.rootFingerprint = await captureFixtureRoot({
			bundle: harness.bundle,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});

		const result = await verifyHarnessPhase({ harness, phase: "reopened" });

		expect(result).toMatchObject({
			caseId: "dissolve",
			phase: "reopened",
			semanticEvidence: {
				caseId: "dissolve",
				transition: { name: "Dissolve" },
			},
			status: "semantic-and-immutable-assets-verified",
		});
		expect(result).toHaveProperty("contentFiles", expect.any(Array));
		if (result.phase !== "reopened") {
			throw new Error("Expected reopened semantic verification.");
		}
		expect(result.contentFiles).toHaveLength(4);
		expect(result.immutableAssetFiles).toHaveLength(1);
	});

	it("rejects one divergent or invalid active content mirror", async () => {
		const harness = await createInstalledDraftHarness({ caseId: "dissolve" });
		const draftDirectory = join(
			harness.fixture.canonicalStorePath,
			harness.bundle.verification.draftFolderName
		);
		const timelineDirectory = join(
			draftDirectory,
			"Timelines",
			harness.bundle.verification.ids.timelineId
		);
		await mkdir(timelineDirectory, { recursive: true });
		const validContent = JSON.stringify(dissolveContent());
		await Promise.all([
			writeFile(join(draftDirectory, "draft_info.json"), validContent, "utf8"),
			writeFile(join(draftDirectory, "template-2.tmp"), validContent, "utf8"),
			writeFile(
				join(timelineDirectory, "draft_info.json"),
				validContent,
				"utf8"
			),
			writeFile(join(timelineDirectory, "template-2.tmp"), "{}", "utf8"),
		]);
		harness.rootFingerprint = await captureFixtureRoot({
			bundle: harness.bundle,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});

		await expect(
			verifyHarnessPhase({ harness, phase: "saved" })
		).rejects.toThrow("CapCut draft duration");
	});

	it("rejects a copied media asset that no longer matches the source bundle", async () => {
		const harness = await createInstalledDraftHarness({ caseId: "dissolve" });
		await writeFile(
			join(
				harness.fixture.canonicalStorePath,
				harness.bundle.verification.draftFolderName,
				"assets",
				"source.bin"
			),
			"tampered-media",
			"utf8"
		);
		harness.rootFingerprint = await captureFixtureRoot({
			bundle: harness.bundle,
			fixture: harness.fixture,
			ownerUid: harness.ownerUid,
			preflightRoot: harness.rootFingerprint,
		});

		await expect(
			verifyHarnessPhase({ harness, phase: "final" })
		).rejects.toThrow("immutable asset assets/source.bin");
	});
});
