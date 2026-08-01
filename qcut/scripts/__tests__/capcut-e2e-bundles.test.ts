import { describe, expect, it } from "vitest";
import { parseBundleRunId } from "../capcut-e2e/generate-bundles.js";
import {
	buildMigrationCases,
	type MigrationCaseDefinition,
} from "../capcut-e2e/migration-case-builder.js";
import type { MigrationExportPlan } from "../capcut-e2e/migration-api-contract.js";
import { assertMigrationCaseAssetInventory } from "../capcut-e2e/migration-result-guard.js";
import { assertPlanMatchesWarningAllowlist } from "../capcut-e2e/migration-warning-guard.js";
import {
	buildAlphaEvidenceArgs,
	parseAlphaSignalStats,
	validateStickerGeometry,
} from "../capcut-e2e/sticker-evidence.js";

function cases(): MigrationCaseDefinition[] {
	return buildMigrationCases({
		sources: {
			audioPath: "/run/source-audio.wav",
			sticker: { height: 512, path: "/repo/icon.png", width: 512 },
			videoPath: "/run/source-video.mp4",
		},
	});
}

function requireCase({
	caseId,
}: {
	caseId: MigrationCaseDefinition["caseId"];
}): MigrationCaseDefinition {
	const value = cases().find((candidate) => candidate.caseId === caseId);
	if (!value) throw new Error(`Missing test case ${caseId}.`);
	return value;
}

function plan({
	issues,
}: {
	issues: MigrationExportPlan["issues"];
}): MigrationExportPlan {
	const errors = issues.filter(({ severity }) => severity === "error");
	const warnings = issues.filter(({ severity }) => severity === "warning");
	return {
		blockerFingerprints: errors.map(({ code }) => `blocker-${code}`),
		canCommit: errors.length === 0,
		expiresAtUnixMilliseconds: 10_000,
		issueSetFingerprint: "issue-set",
		issues,
		planToken: "plan-token",
		requestFingerprint: "request",
		warningFingerprints: warnings.map(({ code }) => `warning-${code}`),
	};
}

describe("CapCut migration bundle cases", () => {
	it("builds native text, caption, independent audio, and transparent sticker", () => {
		const native = requireCase({ caseId: "native-text-sticker" });
		const elements = native.snapshot.tracks.flatMap(({ elements }) => elements);
		const title = elements.find(({ type }) => type === "text");
		const caption = elements.find(({ type }) => type === "captions");
		const sticker = elements.find(({ type }) => type === "sticker");
		const audio = native.snapshot.media.find(({ type }) => type === "audio");

		expect(title).toMatchObject({
			content: "剪映真实导入测试 ABC123",
			fontFamily: "system",
		});
		expect(caption).toMatchObject({ style: { fontFamily: "system" } });
		expect(sticker).toMatchObject({
			height: 18,
			mediaId: "qcut-icon",
			width: 18,
		});
		expect(audio).toMatchObject({
			sourcePath: "/run/source-audio.wav",
			type: "audio",
		});
		expect(native.allowedWarnings).toEqual([
			{
				code: "STICKER_EXPORTED_AS_IMAGE_OVERLAY",
				elementId: "native-sticker",
				mediaId: "qcut-icon",
				message:
					"Local QCut sticker is exported as an editable photo overlay, not a native JianYing resource sticker; accept this semantic downgrade before writing.",
				trackId: "native-sticker-track",
			},
			{
				code: "UNSUPPORTED_CAPTION_METADATA",
				elementId: "native-caption",
				message:
					"Caption language, confidence, and source metadata are not represented in the draft.",
				trackId: "native-caption-track",
			},
		]);
	});

	it("builds adjacent source halves with an exact 0.5 second dissolve", () => {
		const dissolve = requireCase({ caseId: "dissolve" });
		const track = dissolve.snapshot.tracks[0];
		expect(track?.elements).toMatchObject([
			{ id: "dissolve-clip-a", startTime: 0, trimEnd: 3, trimStart: 0 },
			{ id: "dissolve-clip-b", startTime: 3, trimEnd: 0, trimStart: 3 },
		]);
		expect(track?.transitions).toEqual([
			expect.objectContaining({
				duration: 0.5,
				easing: "easeInOut",
				presetId: "dissolve",
				type: "dissolve",
			}),
		]);
		expect(dissolve.allowedWarnings).toEqual([
			{
				code: "CAPCUT_8_1_TRANSITION_DURATION_CANONICALIZED",
				message:
					"CapCut 8.1 uses its verified 466666µs native Dissolve duration instead of QCut's 500000µs duration.",
				trackId: "dissolve-video-track",
			},
		]);
	});

	it("repeats Clip A with an obvious 2x2 invert LUT and unnamed static ellipse", () => {
		const lutMask = requireCase({ caseId: "lut-mask" });
		const elements = lutMask.snapshot.tracks[0]?.elements ?? [];
		const raw = elements[0];
		const treated = elements[1];
		if (!(raw?.type === "media" && treated?.type === "media")) {
			throw new Error("LUT/mask case must contain media elements.");
		}

		expect(raw).toMatchObject({ startTime: 0, trimEnd: 3, trimStart: 0 });
		expect(treated).toMatchObject({ startTime: 3, trimEnd: 3, trimStart: 0 });
		expect(treated.color?.lut).toMatchObject({
			enabled: true,
			intensity: 100,
			name: "QCut 2x2 Invert",
		});
		expect(treated.color?.lut.cube.values).toEqual([
			1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0,
		]);
		expect(treated.mask).toMatchObject({
			enabled: true,
			feather: 0,
			invert: false,
			type: "ellipse",
		});
		expect(treated.mask).not.toHaveProperty("name");
		expect(lutMask.allowedWarnings).toEqual([]);
	});

	it("accepts only the exact per-case warning-code multiset", () => {
		const captionWarning = {
			code: "UNSUPPORTED_CAPTION_METADATA",
			message: "caption metadata",
			severity: "warning" as const,
		};
		expect(() =>
			assertPlanMatchesWarningAllowlist({
				allowedWarnings: [captionWarning],
				caseId: "native",
				plan: plan({ issues: [captionWarning] }),
			})
		).not.toThrow();
		expect(() =>
			assertPlanMatchesWarningAllowlist({
				allowedWarnings: [],
				caseId: "native",
				plan: plan({ issues: [captionWarning] }),
			})
		).toThrow("warning allowlist changed");
		expect(() =>
			assertPlanMatchesWarningAllowlist({
				allowedWarnings: [
					{ ...captionWarning, elementId: "different-caption" },
				],
				caseId: "native",
				plan: plan({ issues: [captionWarning] }),
			})
		).toThrow("warning allowlist changed");
		expect(() =>
			assertPlanMatchesWarningAllowlist({
				allowedWarnings: [],
				caseId: "blocked",
				plan: plan({
					issues: [
						{
							code: "BLOCKED",
							message: "blocked",
							severity: "error",
						},
					],
				}),
			})
		).toThrow("migration plan is blocked");
	});

	it("requires an explicit safe existing run ID", () => {
		expect(parseBundleRunId({ args: ["--run-id", "proof-1"] })).toBe("proof-1");
		expect(() => parseBundleRunId({ args: [] })).toThrow(
			"existing-fixture-run"
		);
		expect(() => parseBundleRunId({ args: ["--run-id", "../escape"] })).toThrow(
			"Run ID"
		);
	});

	it("requires each case's exact copied and generated asset inventory", () => {
		const expectedAssets = {
			sourceAudio: { bytes: 10, sha256: "audio-hash" },
			sourceVideo: { bytes: 20, sha256: "video-hash" },
			sticker: { bytes: 30, sha256: "sticker-hash" },
		};
		expect(() =>
			assertMigrationCaseAssetInventory({
				caseId: "lut-mask",
				copiedAssets: [
					{
						bytes: 20,
						mediaId: "source-video",
						sha256: "video-hash",
						type: "video",
					},
				],
				expectedAssets,
				generatedAssets: [{ kind: "generated-lut" }],
			})
		).not.toThrow();
		expect(() =>
			assertMigrationCaseAssetInventory({
				caseId: "lut-mask",
				copiedAssets: [
					{
						bytes: 20,
						mediaId: "source-video",
						sha256: "video-hash",
						type: "video",
					},
				],
				expectedAssets,
				generatedAssets: [{ kind: "lut" }],
			})
		).toThrow("generated asset inventory changed");
		expect(() =>
			assertMigrationCaseAssetInventory({
				caseId: "lut-mask",
				copiedAssets: [
					{
						bytes: 20,
						mediaId: "source-video",
						sha256: "changed-hash",
						type: "video",
					},
				],
				expectedAssets,
				generatedAssets: [{ kind: "generated-lut" }],
			})
		).toThrow("not bound to its source evidence");
	});
});

describe("CapCut migration sticker evidence", () => {
	it("uses an explicit alpha-extract filter and parses transparent/opaque range", () => {
		const args = buildAlphaEvidenceArgs({ imagePath: "/repo/icon.png" });
		expect(args).toContain("/repo/icon.png");
		expect(args).toContain("alphaextract,signalstats,metadata=print");
		expect(
			parseAlphaSignalStats({
				stderr: "lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n",
			})
		).toEqual({
			hasOpaquePixels: true,
			hasTransparentPixels: true,
			maximum: 255,
			method: "ffmpeg-alphaextract-signalstats",
			minimum: 0,
		});
	});

	it("rejects an image whose alpha plane is fully opaque", () => {
		expect(() =>
			parseAlphaSignalStats({
				stderr: "lavfi.signalstats.YMIN=255\nlavfi.signalstats.YMAX=255\n",
			})
		).toThrow("transparent pixels");
	});

	it("requires true transparency and exact 512x512 geometry", () => {
		expect(() =>
			parseAlphaSignalStats({
				stderr: "lavfi.signalstats.YMIN=1\nlavfi.signalstats.YMAX=255\n",
			})
		).toThrow("transparent pixels");
		expect(() =>
			validateStickerGeometry({ height: 512, width: 512 })
		).not.toThrow();
		expect(() => validateStickerGeometry({ height: 256, width: 512 })).toThrow(
			"exactly 512x512"
		);
	});
});
