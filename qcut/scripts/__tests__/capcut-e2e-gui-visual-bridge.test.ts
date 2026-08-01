import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CAPCUT_GUI_CASE_EXPECTATIONS } from "../capcut-e2e/gui-regression-contract.js";
import { CAPCUT_NATIVE_CJK_REVIEW_FILE_NAME } from "../capcut-e2e/gui-native-cjk-review.js";
import { writeCapCutGuiVisualCaptureManifest } from "../capcut-e2e/gui-visual-capture-manifest.js";
import {
	buildCapCutGuiVisualVerification,
	loadCapCutGuiVisualVerification,
	writeCapCutGuiVisualVerification,
} from "../capcut-e2e/gui-visual-verification.js";
import { describeVisualFile } from "../capcut-e2e/visual-files.js";
import {
	cleanupGuiVisualBridgeFixtures,
	createGuiVisualBridgeFixture,
} from "./capcut-e2e-gui-visual-fixture.js";
import { buildNativeCjkReviewReceipt } from "./capcut-e2e-gui-visual-review-fixture.js";

afterEach(cleanupGuiVisualBridgeFixtures);

async function writeCaptureManifest({
	verifiedVisuals = false,
}: {
	verifiedVisuals?: boolean;
} = {}) {
	const fixture = await createGuiVisualBridgeFixture({ verifiedVisuals });
	const capture = await writeCapCutGuiVisualCaptureManifest({
		createdAt: "2026-08-01T00:02:30.000Z",
		extractionManifestPath: fixture.extractionManifestPath,
		guiPlanPath: fixture.guiPlanPath,
		guiResultPath: fixture.guiResultPath,
		visualOracleManifestPath: fixture.visualOracleManifestPath,
	});
	return { capture, fixture };
}

async function writeReviewReceipt({
	capture,
	fixture,
	tofuAbsent = true,
}: {
	capture: Awaited<ReturnType<typeof writeCaptureManifest>>["capture"];
	fixture: Awaited<ReturnType<typeof writeCaptureManifest>>["fixture"];
	tofuAbsent?: boolean;
}) {
	const captureManifestEvidence = await describeVisualFile({
		path: capture.manifestPath,
	});
	const receipt = buildNativeCjkReviewReceipt({
		captureManifest: capture.manifest,
		captureManifestEvidence,
		tofuAbsent,
	});
	const path = join(
		fixture.evidenceDirectory,
		CAPCUT_NATIVE_CJK_REVIEW_FILE_NAME
	);
	await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
	return { path, receipt };
}

describe("CapCut GUI visual evidence bridge", () => {
	it("binds the complete GUI result to the exact oracle capture layout", async () => {
		const { capture, fixture } = await writeCaptureManifest();

		expect(capture.manifest).toMatchObject({
			capturesDirectory: join(fixture.evidenceDirectory, "visual-captures"),
			exports: {
				dissolve: {
					path: join(fixture.evidenceDirectory, "dissolve", "export.mp4"),
				},
				lutMask: {
					path: join(fixture.evidenceDirectory, "lut-mask", "export.mp4"),
				},
				nativeTextSticker: {
					path: join(
						fixture.evidenceDirectory,
						"native-text-sticker",
						"export.mp4"
					),
				},
			},
			oracleCaptures: {
				dissolve: expect.arrayContaining([
					expect.objectContaining({
						capture: expect.objectContaining({ exists: true }),
					}),
				]),
				lutMask: expect.objectContaining({ exists: false }),
				sticker: expect.objectContaining({ exists: false }),
			},
			runId: "gui-visual-test",
		});
		const verification = await buildCapCutGuiVisualVerification({
			captureManifestPath: capture.manifestPath,
			completedAt: "2026-08-01T00:04:00.000Z",
		});

		expect(verification.overallStatus).toBe("unverified");
		expect(verification.verifiedCheckIds).toEqual([]);
		expect(verification.checks.map(({ id }) => id)).toEqual(
			CAPCUT_GUI_CASE_EXPECTATIONS.flatMap(({ checks }) =>
				checks.map(({ id }) => id)
			)
		);
		expect(
			verification.checks.every(({ status }) => status === "unverified")
		).toBe(true);
	});

	it("promotes native CJK only from a bound human receipt and visual effects only from the oracle", async () => {
		const { capture, fixture } = await writeCaptureManifest({
			verifiedVisuals: true,
		});
		const review = await writeReviewReceipt({ capture, fixture });

		const verification = await buildCapCutGuiVisualVerification({
			captureManifestPath: capture.manifestPath,
			completedAt: "2026-08-01T00:04:00.000Z",
			nativeCjkReviewReceiptPath: review.path,
		});

		expect(
			Object.fromEntries(
				verification.checks.map(({ id, status }) => [id, status])
			)
		).toMatchObject({
			"dissolve-export": "unverified",
			"lut-mask-export": "unverified",
			"lut-mask-reopen": "verified",
			"native-caption-cjk-visible": "verified",
			"native-elements-export": "unverified",
			"native-title-cjk-visible": "verified",
			"transparent-sticker-reopen": "unverified",
		});
		expect(verification.verifiedCheckIds).toEqual([
			"native-title-cjk-visible",
			"native-caption-cjk-visible",
			"lut-mask-reopen",
		]);
		expect(verification.overallStatus).toBe("unverified");
	});

	it("treats an explicit tofu observation as a failed native-text gate", async () => {
		const { capture, fixture } = await writeCaptureManifest();
		const review = await writeReviewReceipt({
			capture,
			fixture,
			tofuAbsent: false,
		});

		const verification = await buildCapCutGuiVisualVerification({
			captureManifestPath: capture.manifestPath,
			completedAt: "2026-08-01T00:04:00.000Z",
			nativeCjkReviewReceiptPath: review.path,
		});

		expect(
			verification.checks.find(({ id }) => id === "native-title-cjk-visible")
		).toMatchObject({ status: "failed" });
		expect(verification.overallStatus).toBe("failed");

		const malformed = structuredClone(review.receipt) as unknown as {
			observations: { phases: Record<string, unknown>[] }[];
		};
		const firstPhase = malformed.observations[0]?.phases[0];
		if (!firstPhase) throw new Error("Fixture receipt is incomplete.");
		firstPhase.glyphsFullyRendered = false;
		firstPhase.tofuAbsent = "not-a-boolean";
		await writeFile(
			review.path,
			`${JSON.stringify(malformed, null, 2)}\n`,
			"utf8"
		);
		await expect(
			buildCapCutGuiVisualVerification({
				captureManifestPath: capture.manifestPath,
				nativeCjkReviewReceiptPath: review.path,
			})
		).rejects.toThrow("tofuAbsent must be boolean");
	});

	it("rejects a review receipt whose screenshot hash is not bound", async () => {
		const { capture, fixture } = await writeCaptureManifest();
		const review = await writeReviewReceipt({ capture, fixture });
		const forged = structuredClone(review.receipt);
		const title = forged.observations[0];
		const firstOpen = title?.phases[0];
		if (!firstOpen) throw new Error("Fixture receipt is incomplete.");
		firstOpen.evidence.sha256 = "f".repeat(64);
		await writeFile(
			review.path,
			`${JSON.stringify(forged, null, 2)}\n`,
			"utf8"
		);

		await expect(
			buildCapCutGuiVisualVerification({
				captureManifestPath: capture.manifestPath,
				completedAt: "2026-08-01T00:04:00.000Z",
				nativeCjkReviewReceiptPath: review.path,
			})
		).rejects.toThrow("evidence hash is not bound");
	});

	it("does not upgrade a capture that appeared after an unverified oracle run", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const stickerPath = fixture.oracle.sticker.reopenedAsset.path;
		await mkdir(dirname(stickerPath), { recursive: true });
		await writeFile(stickerPath, "late arbitrary PNG", "utf8");

		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("Visual oracle capture changed");
	});

	it("rejects an oracle from a different bundle manifest despite the same run ID", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const foreign = structuredClone(fixture.oracle);
		foreign.source.bundleManifest = foreign.source.fixtureManifest;
		await writeFile(
			fixture.visualOracleManifestPath,
			`${JSON.stringify(foreign, null, 2)}\n`,
			"utf8"
		);

		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("not bound to the GUI run");
	});

	it("rejects a forged PNG even when its new hash is written into extraction provenance", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const extraction = JSON.parse(
			await readFile(fixture.extractionManifestPath, "utf8")
		) as {
			frames: {
				id: string;
				output: { bytes: number; path: string; sha256: string };
			}[];
		};
		const frame = extraction.frames.find(({ id }) => id === "dissolve-p050");
		if (!frame) throw new Error("Fixture extraction is incomplete.");
		await writeFile(frame.output.path, "forged prebuilt PNG", "utf8");
		frame.output = await describeVisualFile({ path: frame.output.path });
		await writeFile(
			fixture.extractionManifestPath,
			`${JSON.stringify(extraction, null, 2)}\n`,
			"utf8"
		);

		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("failed exact re-extraction");
	});

	it("rejects a changed frame index or extraction command contract", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const extraction = JSON.parse(
			await readFile(fixture.extractionManifestPath, "utf8")
		) as {
			frames: { command: { filter: string }; zeroBasedFrameIndex: number }[];
		};
		const frame = extraction.frames[0];
		if (!frame) throw new Error("Fixture extraction is incomplete.");
		frame.zeroBasedFrameIndex += 1;
		frame.command.filter = "select=eq(n\\,999)";
		await writeFile(
			fixture.extractionManifestPath,
			`${JSON.stringify(extraction, null, 2)}\n`,
			"utf8"
		);

		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("frame native-elements-export-frame is inconsistent");
	});

	it("rejects a changed CFR probe even when extracted PNGs are untouched", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const extraction = JSON.parse(
			await readFile(fixture.extractionManifestPath, "utf8")
		) as {
			exportProbes: {
				frameRate: { denominator: number; numerator: number };
				timestampTicks: string[];
			}[];
		};
		const probe = extraction.exportProbes[0];
		if (!probe) throw new Error("Fixture CFR probe is incomplete.");
		probe.frameRate.numerator = 60;
		probe.timestampTicks[1] = "999";
		await writeFile(
			fixture.extractionManifestPath,
			`${JSON.stringify(extraction, null, 2)}\n`,
			"utf8"
		);

		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("export CFR probes changed");
	});

	it("rejects a forged oracle status and changed GUI evidence", async () => {
		const fixture = await createGuiVisualBridgeFixture();
		const forgedOracle = structuredClone(fixture.oracle);
		forgedOracle.sticker.status = "verified";
		await writeFile(
			fixture.visualOracleManifestPath,
			`${JSON.stringify(forgedOracle, null, 2)}\n`,
			"utf8"
		);
		await expect(
			writeCapCutGuiVisualCaptureManifest({
				extractionManifestPath: fixture.extractionManifestPath,
				guiPlanPath: fixture.guiPlanPath,
				guiResultPath: fixture.guiResultPath,
				visualOracleManifestPath: fixture.visualOracleManifestPath,
			})
		).rejects.toThrow("status must be unverified");

		const fresh = await writeCaptureManifest();
		const screenshotPath =
			fresh.capture.manifest.nativeText.title["first-open"].path;
		const prior = await readFile(screenshotPath, "utf8");
		await writeFile(screenshotPath, `${prior}changed`, "utf8");
		await expect(
			buildCapCutGuiVisualVerification({
				captureManifestPath: fresh.capture.manifestPath,
			})
		).rejects.toThrow("captured evidence no longer matches");
	});

	it("reconstructs persisted verification before trusting it", async () => {
		const { capture, fixture } = await writeCaptureManifest();
		const review = await writeReviewReceipt({ capture, fixture });
		const written = await writeCapCutGuiVisualVerification({
			captureManifestPath: capture.manifestPath,
			completedAt: "2026-08-01T00:04:00.000Z",
			nativeCjkReviewReceiptPath: review.path,
		});

		await expect(
			loadCapCutGuiVisualVerification({ path: written.manifestPath })
		).resolves.toMatchObject({ manifest: written.manifest });
		await writeFile(
			review.path,
			`${JSON.stringify({ changed: true })}\n`,
			"utf8"
		);
		await expect(
			loadCapCutGuiVisualVerification({ path: written.manifestPath })
		).rejects.toThrow();
	});

	it("cannot report verified when any locked plan check is omitted", async () => {
		const { capture } = await writeCaptureManifest();
		const written = await writeCapCutGuiVisualVerification({
			captureManifestPath: capture.manifestPath,
			completedAt: "2026-08-01T00:04:00.000Z",
		});
		const forged = JSON.parse(await readFile(written.manifestPath, "utf8")) as {
			checks: unknown[];
			overallStatus: string;
			verifiedCheckIds: string[];
		};
		forged.checks.pop();
		forged.overallStatus = "verified";
		forged.verifiedCheckIds = CAPCUT_GUI_CASE_EXPECTATIONS.flatMap(
			({ checks }) => checks.map(({ id }) => id)
		);
		await writeFile(
			written.manifestPath,
			`${JSON.stringify(forged, null, 2)}\n`,
			"utf8"
		);

		await expect(
			loadCapCutGuiVisualVerification({ path: written.manifestPath })
		).rejects.toThrow("not reproducible");
	});
});
