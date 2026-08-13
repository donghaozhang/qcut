// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JianyingFontCatalog } from "../jianying-font-lab-catalog.js";
import { resolveJianyingTextRuntimeFont } from "../jianying-text-runtime/font-resolver.js";

function catalog({
	fontId,
	filePaths,
}: {
	fontId: string;
	filePaths: string[];
}): JianyingFontCatalog {
	const sha256 = fontId.slice("sha256:".length);
	return {
		entries: [
			{
				fontId,
				filePaths,
				sha256,
				cssFamily: "QCutLocal_test",
				familyName: "QCut Test",
				fullName: "QCut Test Regular",
				postscriptName: "QCutTest-Regular",
				subfamilyName: "Regular",
				format: "ttf",
				size: 4,
				sourceKinds: ["effect"],
			},
		],
		rootCount: 1,
		fileCount: 1,
		duplicateFileCount: 0,
		invalidFileCount: 0,
		oversizedFileCount: 0,
	};
}

describe("Jianying text runtime font resolver", () => {
	it("uses the requested font when its catalog file remains readable", async () => {
		const temporary = await mkdtemp(path.join(os.tmpdir(), "qcut-font-ready-"));
		try {
			const fontPath = path.join(temporary, "requested.ttf");
			await writeFile(fontPath, "font");
			const fontId = `sha256:${"a".repeat(64)}`;
			await expect(
				resolveJianyingTextRuntimeFont({
					fontAssetId: fontId,
					getCatalog: async () => catalog({ fontId, filePaths: [fontPath] }),
					fallbackCandidates: [],
				})
			).resolves.toEqual({
				filePath: fontPath,
				state: "requested",
				diagnostics: [],
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it.each([
		{
			label: "catalog entry",
			code: "font-asset-missing" as const,
			filePaths: null,
		},
		{
			label: "font file",
			code: "font-file-missing" as const,
			filePaths: ["missing.ttf"],
		},
	])("falls back when the requested $label is missing", async (sample) => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-font-fallback-")
		);
		try {
			const fallbackPath = path.join(temporary, "fallback.ttf");
			await writeFile(fallbackPath, "font");
			const fontId = `sha256:${"b".repeat(64)}`;
			const emptyCatalog: JianyingFontCatalog = {
				entries: [],
				rootCount: 0,
				fileCount: 0,
				duplicateFileCount: 0,
				invalidFileCount: 0,
				oversizedFileCount: 0,
			};
			const result = await resolveJianyingTextRuntimeFont({
				fontAssetId: fontId,
				getCatalog: async () =>
					sample.filePaths
						? catalog({
								fontId,
								filePaths: sample.filePaths.map((filePath) =>
									path.join(temporary, filePath)
								),
							})
						: emptyCatalog,
				fallbackCandidates: [fallbackPath],
			});

			expect(result).toMatchObject({
				filePath: fallbackPath,
				state: "fallback",
				diagnostics: [{ code: sample.code, fontAssetId: fontId }],
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("rejects malformed font identities instead of treating them as missing", async () => {
		await expect(
			resolveJianyingTextRuntimeFont({
				fontAssetId: "../../font.ttf",
				fallbackCandidates: [],
			})
		).rejects.toThrow("字体引用格式无效");
	});
});
