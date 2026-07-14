import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
	TextAssetUploadPlanItem,
	TextAssetUploadPlanReport,
} from "../upload-text-assets-cdn";
import {
	parseTextAssetStageVerifyArgs,
	readTextAssetStageManifest,
	summarizeTextAssetStageIssues,
	verifyTextAssetStage,
	verifyTextAssetStageUploadPlanSync,
	type TextAssetStageVerifyIssue,
} from "../verify-text-assets-stage";

const PACKAGE_JSON_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../package.json"
);

function checksum({ value }: { value: string }): string {
	return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function createUploadPlanItem({
	content,
	contentType = "application/json",
	key,
	localPath = "/tmp/source/template.json",
	role = "source",
}: {
	content: string;
	contentType?: string;
	key: string;
	localPath?: string;
	role?: TextAssetUploadPlanItem["role"];
}): TextAssetUploadPlanItem {
	return {
		bucket: "qcut-assets",
		cacheControl: "public, max-age=31536000, immutable",
		contentType,
		key,
		localPath,
		role,
		sha256: checksum({ value: content }),
		size: Buffer.byteLength(content),
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

function createTextPackageContent({
	sourceItem,
	sourceSha256 = sourceItem.sha256,
	thumbnailItem,
	thumbnailSha256 = thumbnailItem.sha256,
}: {
	sourceItem: TextAssetUploadPlanItem;
	sourceSha256?: string;
	thumbnailItem: TextAssetUploadPlanItem;
	thumbnailSha256?: string;
}): string {
	return JSON.stringify({
		schemaVersion: 1,
		kind: "qcut-text-template-package",
		assetId: "text-demo",
		packageId: "text-demo",
		version: 1,
		cacheKey: "text-assets/demo/plain@1",
		files: {
			source: "template.json",
			thumbnail: "thumbnail.webp",
		},
		resources: [
			{
				byteSize: thumbnailItem.size,
				checksumSha256: thumbnailSha256,
				mimeType: thumbnailItem.contentType,
				path: "thumbnail.webp",
				role: "thumbnail",
				url: "/text-assets/demo/plain@1/thumbnail.webp",
			},
			{
				byteSize: sourceItem.size,
				checksumSha256: sourceSha256,
				mimeType: sourceItem.contentType,
				path: "template.json",
				role: "source",
				url: "/text-assets/demo/plain@1/template.json",
			},
		],
		source: {
			schemaVersion: 1,
			assetId: "text-demo",
			packageId: "text-demo",
			version: 1,
			template: {
				content: "花字",
				id: "text-demo-template",
				name: "Demo",
				type: "text",
			},
		},
	});
}

describe("text asset stage verifier", () => {
	it("is exposed through the package scripts", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			scripts: Record<string, string>;
		};

		expect(packageJson.scripts["assets:text:verify-stage"]).toBe(
			"bun scripts/verify-text-assets-stage.ts --upload-plan dist/text-assets-upload-plan.json"
		);
	});

	it("parses stage verification options", () => {
		expect(
			parseTextAssetStageVerifyArgs({
				argv: [
					"--stage-dir",
					"/tmp/stage",
					"--manifest",
					"/tmp/stage-manifest.json",
					"--upload-plan",
					"/tmp/upload-plan.json",
					"--issue-limit",
					"3",
				],
			})
		).toMatchObject({
			issueLimit: 3,
			manifestPath: "/tmp/stage-manifest.json",
			stageDir: "/tmp/stage",
			uploadPlanPath: "/tmp/upload-plan.json",
		});
	});

	it("verifies staged files against the release manifest", async () => {
		const stageDir = join(tmpdir(), `qcut-stage-verify-${randomUUID()}`);
		const content = '{"assetId":"text-demo"}';
		const item = createUploadPlanItem({
			content,
			key: "prod/text-assets/demo/plain@1/template.json",
		});
		const manifest = createUploadPlanReport({ items: [item] });
		const stagedPath = join(stageDir, item.key);
		const manifestPath = join(stageDir, "_qcut-text-assets-release.json");
		await mkdir(dirname(stagedPath), { recursive: true });
		await writeFile(stagedPath, content);
		await writeFile(manifestPath, JSON.stringify(manifest));

		await expect(readTextAssetStageManifest({ manifestPath })).resolves.toEqual(
			manifest
		);
		await expect(
			verifyTextAssetStage({
				manifest,
				stageDir,
				uploadPlan: manifest,
			})
		).resolves.toEqual([]);
	});

	it("reports upload plans that drift away from the staged release manifest", () => {
		const content = '{"assetId":"text-demo"}';
		const expectedItem = createUploadPlanItem({
			content,
			key: "prod/text-assets/demo/plain@1/template.json",
		});
		const uploadItem = {
			...expectedItem,
			sha256: "different-sha",
		};
		const manifest = createUploadPlanReport({ items: [expectedItem] });
		const uploadPlan = {
			...createUploadPlanReport({ items: [uploadItem] }),
			totalBytes: manifest.totalBytes + 1,
		};

		expect(
			verifyTextAssetStageUploadPlanSync({ manifest, uploadPlan })
		).toEqual([
			{
				code: "upload-plan-mismatch",
				detail: expect.stringContaining("totalBytes expected 23, received 24"),
				key: "_qcut-text-assets-release.json",
			},
		]);
		expect(
			verifyTextAssetStageUploadPlanSync({ manifest, uploadPlan })[0]?.detail
		).toEqual(expect.stringContaining(`${expectedItem.key}.sha256 mismatch`));
	});

	it("reports missing, mutated, and escaping stage entries", async () => {
		const stageDir = join(tmpdir(), `qcut-stage-verify-${randomUUID()}`);
		const validContent = '{"assetId":"text-demo"}';
		const changedContent = '{"assetId":"changed"}';
		const changedItem = createUploadPlanItem({
			content: validContent,
			key: "prod/text-assets/demo/plain@1/template.json",
		});
		const missingItem = createUploadPlanItem({
			content: validContent,
			key: "prod/text-assets/demo/plain@1/missing.json",
		});
		const escapingItem = createUploadPlanItem({
			content: validContent,
			key: "../outside.json",
		});
		const safeDotItem = createUploadPlanItem({
			content: validContent,
			key: "..safe/template.json",
		});
		const manifest = createUploadPlanReport({
			items: [changedItem, missingItem, escapingItem, safeDotItem],
		});
		await Promise.all(
			[
				{ content: changedContent, item: changedItem },
				{ content: validContent, item: safeDotItem },
			].map(async ({ content, item }) => {
				const path = join(stageDir, item.key);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content);
			})
		);

		const issues = await verifyTextAssetStage({
			manifest,
			stageDir,
		});

		expect(issues).toEqual(
			expect.arrayContaining<TextAssetStageVerifyIssue>([
				expect.objectContaining({
					code: "byte-size-mismatch",
					key: changedItem.key,
				}),
				expect.objectContaining({
					code: "checksum-mismatch",
					key: changedItem.key,
				}),
				expect.objectContaining({
					code: "missing-file",
					key: missingItem.key,
				}),
				expect.objectContaining({
					code: "invalid-stage-key",
					key: escapingItem.key,
				}),
			])
		);
		expect(issues).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: safeDotItem.key,
				}),
			])
		);
		expect(
			summarizeTextAssetStageIssues({
				issues,
				limit: 2,
			})
		).toMatchObject({
			issueSummary: {
				count: 5,
				truncated: 3,
			},
			issues: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
		});
	});

	it("reports staged files that violate role contracts", async () => {
		const stageDir = join(tmpdir(), `qcut-stage-contract-${randomUUID()}`);
		const content = "webp";
		const badThumbnailItem = createUploadPlanItem({
			content,
			contentType: "application/json",
			key: "prod/text-assets/demo/plain@1/template.json",
			role: "thumbnail",
		});
		const manifest = createUploadPlanReport({
			items: [badThumbnailItem],
		});
		const stagedPath = join(stageDir, badThumbnailItem.key);
		await mkdir(dirname(stagedPath), { recursive: true });
		await writeFile(stagedPath, content);

		await expect(
			verifyTextAssetStage({
				manifest,
				stageDir,
			})
		).resolves.toEqual([
			expect.objectContaining({
				code: "stage-contract-mismatch",
				detail: expect.stringContaining("contentType expected image/webp"),
				key: badThumbnailItem.key,
			}),
		]);
	});

	it("reports qctext package companion resources that drift from staged files", async () => {
		const stageDir = join(tmpdir(), `qcut-stage-package-${randomUUID()}`);
		const thumbnailContent = "thumbnail-webp";
		const sourceContent = '{"assetId":"text-demo"}';
		const thumbnailItem = createUploadPlanItem({
			content: thumbnailContent,
			contentType: "image/webp",
			key: "prod/text-assets/demo/plain@1/thumbnail.webp",
			role: "thumbnail",
		});
		const sourceItem = createUploadPlanItem({
			content: sourceContent,
			key: "prod/text-assets/demo/plain@1/template.json",
		});
		const packageContent = createTextPackageContent({
			sourceItem,
			sourceSha256: "f".repeat(64),
			thumbnailItem,
		});
		const packageItem = createUploadPlanItem({
			content: packageContent,
			contentType: "application/vnd.qcut.text-template+json",
			key: "prod/text-assets/demo/plain@1/template.qctext",
			role: "package",
		});
		const manifest = createUploadPlanReport({
			items: [thumbnailItem, sourceItem, packageItem],
		});
		await Promise.all(
			[
				{ content: thumbnailContent, item: thumbnailItem },
				{ content: sourceContent, item: sourceItem },
				{ content: packageContent, item: packageItem },
			].map(async ({ content, item }) => {
				const path = join(stageDir, item.key);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content);
			})
		);

		await expect(
			verifyTextAssetStage({
				manifest,
				stageDir,
			})
		).resolves.toEqual([
			expect.objectContaining({
				code: "package-resource-mismatch",
				detail: expect.stringContaining("checksumSha256 expected"),
				key: packageItem.key,
			}),
		]);
	});

	it("reports staged marketplace metadata that is stale versus source files", async () => {
		const stageDir = join(tmpdir(), `qcut-stage-marketplace-${randomUUID()}`);
		const sourceContent = JSON.stringify({
			assetId: "text-demo",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
			schemaVersion: 1,
			version: 1,
			marketplace: {
				editorialRank: 3,
				heatScore: 91,
				remoteTags: ["market:hero"],
				searchAliases: ["封面"],
			},
			definition: {
				id: "demo-template",
				resource: {
					cacheKey: "text-assets/text-fancy-red/plain@1",
				},
			},
			template: {
				content: "花字",
				id: "demo-template",
				name: "Demo",
				type: "text",
			},
		});
		const marketplaceContent = JSON.stringify({
			assets: [
				{
					assetId: "text-demo",
					editorialRank: 1,
					heatScore: 10,
					remoteTags: [],
					searchAliases: [],
					templateId: "stale-template",
				},
			],
			schemaVersion: 1,
		});
		const sourceItem: TextAssetUploadPlanItem = {
			...createUploadPlanItem({
				content: sourceContent,
				key: "prod/text-assets/text-fancy-red/plain@1/template.json",
			}),
			assetId: "text-demo",
			cacheKey: "text-assets/text-fancy-red/plain@1",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
			version: 1,
		};
		const marketplaceItem = createUploadPlanItem({
			content: marketplaceContent,
			key: "prod/text-assets/marketplace.json",
			role: "metadata",
		});
		const manifest = createUploadPlanReport({
			items: [sourceItem, marketplaceItem],
		});
		await Promise.all(
			[
				{ content: sourceContent, item: sourceItem },
				{ content: marketplaceContent, item: marketplaceItem },
			].map(async ({ content, item }) => {
				const path = join(stageDir, item.key);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content);
			})
		);

		const issues = await verifyTextAssetStage({
			manifest,
			stageDir,
		});

		expect(issues).toEqual([
			expect.objectContaining({
				code: "marketplace-source-mismatch",
				key: marketplaceItem.key,
			}),
		]);
		expect(issues[0]?.detail).toEqual(
			expect.stringContaining("templateId expected demo-template")
		);
		expect(issues[0]?.detail).toEqual(
			expect.stringContaining("remoteTags missing source:designer-imported")
		);
		expect(issues[0]?.detail).toEqual(
			expect.stringContaining("searchAliases missing 封面")
		);
	});
});
