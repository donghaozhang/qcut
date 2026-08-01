import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	analyzeCapCut81FontReferencePair,
	inspectCapCut81FontReferenceDraft,
	writeCapCut81FontReference,
} from "../capcut-e2e/font-reference.js";
import {
	parseCapCut81FontReferenceCliOptions,
	runCapCut81FontReferenceCli,
} from "../capcut-e2e/font-reference-cli.js";
import {
	createFontReferenceDraft,
	createFontReferenceOutputDirectory,
	FONT_REFERENCE_TARGET_TEXT as TARGET_TEXT,
	removeFontReferenceFixtures,
} from "./capcut-e2e-font-reference-fixture.js";

afterEach(async () => {
	await removeFontReferenceFixtures();
});

describe("CapCut 8.1 native font reference analysis", () => {
	it("requires one exact value for every capture CLI option", () => {
		const options = parseCapCut81FontReferenceCliOptions({
			args: [
				"--before",
				"./before",
				"--after",
				"./after",
				"--text",
				TARGET_TEXT,
				"--font-label",
				"Reference Font",
				"--output",
				"./reference.json",
			],
		});

		expect(options).toMatchObject({
			fontLabel: "Reference Font",
			targetText: TARGET_TEXT,
		});
		expect(options.beforeDraftDirectory).toMatch(/\/before$/u);
		expect(options.afterDraftDirectory).toMatch(/\/after$/u);
		expect(options.outputPath).toMatch(/\/reference\.json$/u);
		expect(() =>
			parseCapCut81FontReferenceCliOptions({
				args: ["--before", "a", "--before", "b"],
			})
		).toThrow("Duplicate option --before");
	});

	it("captures root and timeline font bindings without copying the draft", async () => {
		const draftDirectory = await createFontReferenceDraft({ name: "default" });

		const evidence = await inspectCapCut81FontReferenceDraft({
			draftDirectory,
			targetText: TARGET_TEXT,
		});

		expect(evidence).toMatchObject({
			binding: {
				materialFields: {
					font_name: "",
					font_path:
						"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
					font_resource_id: "",
				},
				materialFonts: { present: true, value: [] },
				styleFonts: [{ present: false, styleIndex: 0, value: null }],
				text: TARGET_TEXT,
				topLevelFontMaterials: { present: false, value: null },
			},
			canonicalDraftDirectory: draftDirectory,
			targetMaterialId: "font-reference-text-material",
			textSegment: {
				duration: 6_000_000,
				segmentId: "font-reference-text-segment",
				trackId: "font-reference-text-track",
			},
			timelineId: "timeline-1",
			updateTime: 1_000_000,
		});
		expect(evidence.canonicalDraftSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
		expect(evidence.normalizedDraftSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
		expect(evidence.rootDraftInfo.sha256).toMatch(/^[a-f0-9]{64}$/u);
		expect(evidence.timelineDraftInfo.sha256).toBe(
			evidence.rootDraftInfo.sha256
		);
	});

	it("accepts only self-reported CapCut 8.1.1 cc draft metadata", async () => {
		const invalidDrafts = await Promise.all([
			createFontReferenceDraft({
				name: "wrong-id",
				options: { appId: "359289" },
			}),
			createFontReferenceDraft({
				name: "wrong-version",
				options: { appVersion: "8.2.0" },
			}),
			createFontReferenceDraft({
				name: "wrong-source",
				options: { appSource: "lv" },
			}),
		]);

		await Promise.all(
			invalidDrafts.map((draftDirectory) =>
				expect(
					inspectCapCut81FontReferenceDraft({
						draftDirectory,
						targetText: TARGET_TEXT,
					})
				).rejects.toThrow(
					"platform must identify CapCut app_id=359289, app_version=8.1.1, app_source=cc"
				)
			)
		);
	});

	it("requires one visible positive-duration text segment and unique reference", async () => {
		const invalidDrafts = await Promise.all([
			createFontReferenceDraft({
				name: "hidden",
				options: { segmentVisible: false },
			}),
			createFontReferenceDraft({
				name: "zero-duration",
				options: { segmentDuration: 0 },
			}),
			createFontReferenceDraft({
				name: "wrong-reference",
				options: { segmentMaterialId: "other-material" },
			}),
			createFontReferenceDraft({
				name: "duplicate-reference",
				options: { duplicateReferenceInVideoTrack: true },
			}),
			createFontReferenceDraft({
				name: "extra-text-track",
				options: { extraTextTrack: true },
			}),
		]);

		const failures = invalidDrafts.map((draftDirectory) =>
			expect(
				inspectCapCut81FontReferenceDraft({
					draftDirectory,
					targetText: TARGET_TEXT,
				})
			).rejects.toThrow()
		);
		await Promise.all(failures);
	});

	it("reports only isolated native font-field changes", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const resource = { id: "font-resource-1", name: "Source Han Sans CN" };
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_id: "font-resource-1",
					font_name: "Source Han Sans CN",
					font_path: "/font-cache/source-han-sans-cn.otf",
					font_resource_id: "font-resource-1",
				},
				materialFonts: [resource],
				styleFont: "font-resource-1",
				topLevelFontMaterials: [resource],
			},
		});

		const reference = await analyzeCapCut81FontReferencePair({
			afterDraftDirectory,
			beforeDraftDirectory,
			fontLabel: " Source Han Sans CN ",
			targetText: TARGET_TEXT,
		});

		expect(reference.changedPaths).toEqual([
			"material.font_id",
			"material.font_name",
			"material.font_path",
			"material.font_resource_id",
			"material.fonts",
			"materials.fonts",
			"content.styles[0].font",
		]);
		expect(reference).toMatchObject({
			fontLabel: "Source Han Sans CN",
			schema: "qcut.capcut-8-1.font-reference",
			schemaVersion: 2,
			targetText: TARGET_TEXT,
			verificationStatus: "unverified-draft-self-report",
		});
	});

	it("normalizes only the top-level update_time between saved snapshots", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
			options: { createTime: 500_000, updateTime: 1_000_000 },
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				createTime: 500_000,
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
				updateTime: 2_000_000,
			},
		});

		const reference = await analyzeCapCut81FontReferencePair({
			afterDraftDirectory,
			beforeDraftDirectory,
			fontLabel: "Reference Font",
			targetText: TARGET_TEXT,
		});

		expect(reference.before.updateTime).toBe(1_000_000);
		expect(reference.after.updateTime).toBe(2_000_000);
		expect(reference.before.rootDraftInfo.sha256).not.toBe(
			reference.after.rootDraftInfo.sha256
		);
		expect(reference.before.canonicalDraftSemanticSha256).not.toBe(
			reference.after.canonicalDraftSemanticSha256
		);
		expect(reference.before.normalizedDraftSemanticSha256).toBe(
			reference.after.normalizedDraftSemanticSha256
		);
	});

	it("rejects create_time and nested timestamp changes", async () => {
		const [beforeCreateTime, afterCreateTime, beforeNested, afterNested] =
			await Promise.all([
				createFontReferenceDraft({
					name: "before-create-time",
					options: { createTime: 500_000, updateTime: 1_000_000 },
				}),
				createFontReferenceDraft({
					name: "after-create-time",
					options: {
						createTime: 600_000,
						fontFields: {
							font_name: "Reference Font",
							font_path: "/fonts/reference.otf",
							font_resource_id: "reference-font",
						},
						updateTime: 2_000_000,
					},
				}),
				createFontReferenceDraft({
					name: "before-nested",
					options: { nestedUpdateTime: 1_000_000 },
				}),
				createFontReferenceDraft({
					name: "after-nested",
					options: {
						fontFields: {
							font_name: "Reference Font",
							font_path: "/fonts/reference.otf",
							font_resource_id: "reference-font",
						},
						nestedUpdateTime: 2_000_000,
						updateTime: 2_000_000,
					},
				}),
			]);

		await Promise.all([
			expect(
				analyzeCapCut81FontReferencePair({
					afterDraftDirectory: afterCreateTime,
					beforeDraftDirectory: beforeCreateTime,
					fontLabel: "Reference Font",
					targetText: TARGET_TEXT,
				})
			).rejects.toThrow("outside the allowed target font bindings"),
			expect(
				analyzeCapCut81FontReferencePair({
					afterDraftDirectory: afterNested,
					beforeDraftDirectory: beforeNested,
					fontLabel: "Reference Font",
					targetText: TARGET_TEXT,
				})
			).rejects.toThrow("outside the allowed target font bindings"),
		]);
	});

	it("rejects malformed top-level update_time values", async () => {
		const draftDirectory = await createFontReferenceDraft({
			name: "invalid-update-time",
			options: { updateTime: "1785430000000000" },
		});

		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow(
			"top-level update_time must be a non-negative safe integer"
		);
	});

	it("rejects an unreferenced top-level font resource change by itself", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				topLevelFontMaterials: [{ id: "resource-id", name: "Reference Font" }],
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("cannot establish a target text font binding by itself");
	});

	it("requires the exact UI label inside the after-draft font bindings", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font Bold",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("must contain the exact UI font label");
	});

	it("rejects a UI label carried only by an unrelated top-level font resource", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_id: "target-font",
					font_name: "Internal Font Name",
					font_path: "/fonts/target.otf",
					font_resource_id: "target-font",
				},
				topLevelFontMaterials: [
					{ id: "unrelated-font", name: "Reference Font" },
				],
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("must contain the exact UI font label");
	});

	it("accepts a top-level UI label only when its resource id is target-bound", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_id: "target-font",
					font_name: "Internal Font Name",
					font_path: "/fonts/target.otf",
					font_resource_id: "target-font",
				},
				topLevelFontMaterials: [{ id: "target-font", name: "Reference Font" }],
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).resolves.toMatchObject({ fontLabel: "Reference Font" });
	});

	it("rejects a pair with no font-field change", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "unchanged",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("no canonical font-identity binding change");
	});

	it("rejects a capture that changed non-font text semantics", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
				styleSize: 18,
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("outside the allowed target font bindings");
	});

	it("rejects every whole-draft change outside the explicit binding allowlist", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				draftName: "Changed during capture",
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("outside the allowed target font bindings");
	});

	it("does not treat unknown font-prefixed fields as font identity", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				extraMaterialFields: { font_weight: 900 },
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("outside the allowed target font bindings");
	});

	it("treats material font_size as layout, not font identity", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: { materialFontSize: 99 },
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "unchanged",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("outside the allowed target font bindings");
	});

	it("requires full semantic agreement between root and timeline copies", async () => {
		const [bindingMismatch, metadataMismatch, updateTimeMismatch] =
			await Promise.all([
				createFontReferenceDraft({
					name: "binding-mismatch",
					options: {
						timelineFontFields: {
							font_name: "Different Font",
							font_path: "/fonts/different.otf",
							font_resource_id: "different-font",
						},
					},
				}),
				createFontReferenceDraft({
					name: "metadata-mismatch",
					options: { timelineDraftName: "Different timeline copy" },
				}),
				createFontReferenceDraft({
					name: "update-time-mismatch",
					options: { timelineUpdateTime: 2_000_000 },
				}),
			]);

		await Promise.all(
			[bindingMismatch, metadataMismatch, updateTimeMismatch].map(
				(draftDirectory) =>
					expect(
						inspectCapCut81FontReferenceDraft({
							draftDirectory,
							targetText: TARGET_TEXT,
						})
					).rejects.toThrow("must be semantically identical")
			)
		);
	});

	it("rejects ambiguous target text and symlinked timeline entries", async () => {
		const duplicateDraft = await createFontReferenceDraft({
			name: "duplicate",
			options: { duplicateTarget: true },
		});

		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory: duplicateDraft,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("dedicated single-text draft; found 2");

		const symlinkDraft = await createFontReferenceDraft({ name: "symlink" });
		await symlink(
			join(symlinkDraft, "Timelines", "timeline-1"),
			join(symlinkDraft, "Timelines", "timeline-alias"),
			"dir"
		);
		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory: symlinkDraft,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("must not contain symlinks");
	});

	it("labels CLI output as unverified draft self-report evidence", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});
		const outputRoot = await createFontReferenceOutputDirectory();
		const outputPath = join(outputRoot, "cli-reference.json");

		const result = await runCapCut81FontReferenceCli({
			args: [
				"--before",
				beforeDraftDirectory,
				"--after",
				afterDraftDirectory,
				"--text",
				TARGET_TEXT,
				"--font-label",
				"Reference Font",
				"--output",
				outputPath,
			],
		});

		expect(result.verificationStatus).toBe("unverified-draft-self-report");
		expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
			verificationStatus: "unverified-draft-self-report",
		});
	});

	it("writes a new hash-bound reference manifest without overwriting", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});
		const reference = await analyzeCapCut81FontReferencePair({
			afterDraftDirectory,
			beforeDraftDirectory,
			fontLabel: "Reference Font",
			targetText: TARGET_TEXT,
		});
		const outputRoot = await createFontReferenceOutputDirectory();
		const outputPath = join(outputRoot, "reference.json");

		await writeCapCut81FontReference({ outputPath, reference });

		expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(reference);
		await expect(
			writeCapCut81FontReference({ outputPath, reference })
		).rejects.toMatchObject({ code: "EEXIST" });
	});
});
