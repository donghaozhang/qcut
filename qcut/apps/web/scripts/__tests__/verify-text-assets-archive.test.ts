import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
	TextAssetUploadPlanItem,
	TextAssetUploadPlanReport,
} from "../upload-text-assets-cdn";
import {
	countTextAssetArchiveFiles,
	listTextAssetArchiveEntries,
	parseTextAssetArchiveVerifyArgs,
	readTextAssetArchiveManifest,
	summarizeTextAssetArchiveIssues,
	verifyTextAssetArchive,
	type TextAssetArchiveVerifyIssue,
} from "../verify-text-assets-archive";

const PACKAGE_JSON_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../package.json"
);

function createUploadPlanItem({
	contentType = "application/json",
	key,
	role = "source",
}: {
	contentType?: string;
	key: string;
	role?: TextAssetUploadPlanItem["role"];
}): TextAssetUploadPlanItem {
	return {
		bucket: "qcut-assets",
		cacheControl: "public, max-age=31536000, immutable",
		contentType,
		key,
		localPath: `/tmp/${key}`,
		role,
		sha256: "sha",
		size: 12,
	};
}

function createUploadPlanReport({
	items,
}: {
	items: TextAssetUploadPlanItem[];
}): TextAssetUploadPlanReport {
	return {
		bucket: "qcut-assets",
		generatedAt: "2026-07-15T00:00:00.000Z",
		items,
		prefix: "prod",
		schemaVersion: 1,
		totalBytes: items.reduce((total, item) => total + item.size, 0),
		totalFiles: items.length,
	};
}

describe("text asset archive verifier", () => {
	it("is exposed through the package scripts", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			scripts: Record<string, string>;
		};

		expect(packageJson.scripts["assets:text:verify-archive"]).toBe(
			"bun scripts/verify-text-assets-archive.ts"
		);
	});

	it("parses archive verification options", () => {
		expect(
			parseTextAssetArchiveVerifyArgs({
				argv: ["--archive", "/tmp/text-assets.tar.gz", "--issue-limit", "3"],
			})
		).toMatchObject({
			archivePath: "/tmp/text-assets.tar.gz",
			issueLimit: 3,
		});
	});

	it("reads archive entries and the embedded release manifest", async () => {
		const manifest = createUploadPlanReport({
			items: [
				createUploadPlanItem({
					key: "prod/text-assets/demo/plain@1/template.json",
				}),
			],
		});
		const calls: string[][] = [];
		const runTar = async ({ args }: { args: string[] }) => {
			calls.push(args);
			if (args[0] === "-tzf") {
				return "./_qcut-text-assets-release.json\n./_qcut-text-assets-release-readme.md\n./_qcut-text-designer-gap-report.json\n./prod/text-assets/demo/plain@1/template.json\n";
			}
			if (args[0] === "-xOf") {
				return JSON.stringify(manifest);
			}
			throw new Error("unexpected tar call");
		};

		await expect(
			listTextAssetArchiveEntries({
				archivePath: "/tmp/text-assets.tar.gz",
				runTar,
			})
		).resolves.toEqual([
			"./_qcut-text-assets-release.json",
			"./_qcut-text-assets-release-readme.md",
			"./_qcut-text-designer-gap-report.json",
			"./prod/text-assets/demo/plain@1/template.json",
		]);
		await expect(
			readTextAssetArchiveManifest({
				archivePath: "/tmp/text-assets.tar.gz",
				runTar,
			})
		).resolves.toEqual(manifest);
		expect(calls).toEqual([
			["-tzf", "/tmp/text-assets.tar.gz"],
			["-xOf", "/tmp/text-assets.tar.gz", "./_qcut-text-assets-release.json"],
		]);
	});

	it("counts actual archive files while ignoring directory entries", () => {
		expect(
			countTextAssetArchiveFiles({
				entries: [
					"./",
					"./prod/",
					"./_qcut-text-assets-release.json",
					"./_qcut-text-assets-release-readme.md",
					"./_qcut-text-designer-gap-report.json",
					"./prod/text-assets/demo/plain@1/template.json",
					"../escape.json",
				],
			})
		).toBe(5);
	});

	it("detects missing, unexpected, duplicate, and escaping archive entries", () => {
		const expectedItem = createUploadPlanItem({
			key: "prod/text-assets/demo/plain@1/template.json",
		});
		const manifest = createUploadPlanReport({ items: [expectedItem] });
		const issues = verifyTextAssetArchive({
			entries: [
				"./_qcut-text-assets-release.json",
				"./_qcut-text-assets-release-readme.md",
				"./_qcut-text-designer-gap-report.json",
				"./prod/text-assets/demo/plain@1/template.json",
				"./prod/text-assets/demo/plain@1/template.json",
				"./prod/text-assets/demo/plain@1/extra.json",
				"../escape.json",
			],
			manifest,
		});

		expect(issues).toEqual(
			expect.arrayContaining<TextAssetArchiveVerifyIssue>([
				expect.objectContaining({
					code: "duplicate-archive-entry",
					key: expectedItem.key,
				}),
				expect.objectContaining({
					code: "unexpected-archive-entry",
					key: "prod/text-assets/demo/plain@1/extra.json",
				}),
				expect.objectContaining({
					code: "invalid-archive-entry",
					key: "../escape.json",
				}),
			])
		);
		expect(
			verifyTextAssetArchive({
				entries: [
					"./_qcut-text-assets-release.json",
					"./_qcut-text-assets-release-readme.md",
					"./_qcut-text-designer-gap-report.json",
				],
				manifest,
			})
		).toEqual([
			expect.objectContaining({
				code: "missing-archive-entry",
				key: expectedItem.key,
			}),
		]);
		expect(
			summarizeTextAssetArchiveIssues({
				issues,
				limit: 2,
			})
		).toMatchObject({
			issueSummary: {
				count: 3,
				truncated: 1,
			},
			issues: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
		});
	});

	it("reports release manifest entries that violate role contracts", () => {
		const badThumbnailItem = createUploadPlanItem({
			contentType: "application/json",
			key: "prod/text-assets/demo/plain@1/template.json",
			role: "thumbnail",
		});
		const manifest = createUploadPlanReport({ items: [badThumbnailItem] });

		expect(
			verifyTextAssetArchive({
				entries: [
					"./_qcut-text-assets-release.json",
					"./_qcut-text-assets-release-readme.md",
					"./_qcut-text-designer-gap-report.json",
					`./${badThumbnailItem.key}`,
				],
				manifest,
			})
		).toEqual([
			expect.objectContaining({
				code: "archive-contract-mismatch",
				detail: expect.stringContaining("contentType expected image/webp"),
				key: badThumbnailItem.key,
			}),
		]);
	});
});
