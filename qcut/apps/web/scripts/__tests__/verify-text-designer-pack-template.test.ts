import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildTextDesignerPackTemplate,
	createTextDesignerPackTemplateArchive,
	writeTextDesignerPackTemplate,
} from "../create-text-designer-pack-template";
import {
	parseTextDesignerPackTemplateVerifyArgs,
	verifyTextDesignerPackTemplate,
	verifyTextDesignerPackTemplateInput,
} from "../verify-text-designer-pack-template";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

const PACKAGE_JSON_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../package.json"
);

function createGeneratedEntry({
	assetId = "text-red-demo",
	packageId = "text-fancy-red",
}: {
	assetId?: string;
	packageId?: string;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId,
		cacheKey: `text-assets/${assetId}/plain@1`,
		packageId,
		version: 1,
		thumbnail: {
			byteSize: 5,
			checksumSha256: "thumb-sha",
			mimeType: "image/webp",
			url: `/text-assets/${assetId}/plain@1/thumbnail.webp`,
		},
		source: {
			byteSize: 7,
			checksumSha256: "source-sha",
			mimeType: "application/json",
			url: `/text-assets/${assetId}/plain@1/template.json`,
		},
		qcutPackage: {
			byteSize: 9,
			checksumSha256: "package-sha",
			mimeType: "application/vnd.qcut.text-template+json",
			url: `/text-assets/${assetId}/plain@1/template.qctext`,
		},
	};
}

async function writePackTemplate(): Promise<string> {
	const rootDir = join(tmpdir(), `qcut-designer-pack-verify-${randomUUID()}`);
	const outDir = join(rootDir, "pack");
	const publicDir = join(rootDir, "public");
	const entry = createGeneratedEntry();
	const template = buildTextDesignerPackTemplate({
		assetIds: ["text-red-demo"],
		generatedManifest: {
			"text-red-demo": entry,
		},
	});
	await Promise.all(
		[
			{ content: "RIFF0000WEBP", file: entry.thumbnail },
			{ content: '{"assetId":"text-red-demo"}', file: entry.source },
			{
				content: '{"kind":"qcut-text-template-package"}',
				file: entry.qcutPackage,
			},
		].map(async ({ content, file }) => {
			const path = join(publicDir, file.url.replace(/^\/+/, ""));
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content);
		})
	);
	await writeTextDesignerPackTemplate({
		includeCurrentFiles: true,
		outDir,
		publicDir,
		template,
	});
	return outDir;
}

describe("text designer pack template verifier", () => {
	it("parses verification options", () => {
		expect(
			parseTextDesignerPackTemplateVerifyArgs({
				argv: [
					"--pack-dir",
					"/tmp/designer-pack",
					"--expected-assets",
					"100",
					"--issue-limit",
					"3",
				],
			})
		).toEqual({
			expectedAssets: 100,
			issueLimit: 3,
			packDir: "/tmp/designer-pack",
		});
		expect(
			parseTextDesignerPackTemplateVerifyArgs({
				argv: [
					"--pack-archive",
					"/tmp/designer-pack.tar.gz",
					"--expected-assets",
					"100",
				],
			})
		).toEqual({
			expectedAssets: 100,
			issueLimit: 25,
			packArchivePath: "/tmp/designer-pack.tar.gz",
			packDir: undefined,
		});
		expect(() =>
			parseTextDesignerPackTemplateVerifyArgs({
				argv: [
					"--pack-dir",
					"/tmp/designer-pack",
					"--pack-archive",
					"/tmp/designer-pack.tar.gz",
				],
			})
		).toThrow("Pass only one of --pack-dir or --pack-archive.");
		expect(() =>
			parseTextDesignerPackTemplateVerifyArgs({
				argv: [
					"--pack-archive",
					"/tmp/designer-pack.tar.gz",
					"--pack-dir",
					"/tmp/designer-pack",
				],
			})
		).toThrow("Pass only one of --pack-dir or --pack-archive.");
	});

	it("keeps package scripts wired to the designer handoff verifier", async () => {
		const packageJson = JSON.parse(
			await readFile(PACKAGE_JSON_PATH, "utf8")
		) as {
			scripts: Record<string, string>;
		};

		expect(
			packageJson.scripts["assets:text:verify-designer-pack-template"]
		).toBe(
			"bun scripts/verify-text-designer-pack-template.ts --pack-archive dist/text-designer-pack-template.tar.gz --expected-assets 100"
		);
		expect(packageJson.scripts["assets:text:proof-designer-handoff"]).toBe(
			"bun run assets:text:create-designer-ready-pack-archive && bun run assets:text:verify-designer-pack-template"
		);
	});

	it("accepts a generated designer pack template", async () => {
		const packDir = await writePackTemplate();

		await expect(
			verifyTextDesignerPackTemplate({
				expectedAssets: 1,
				packDir,
			})
		).resolves.toEqual([]);
	});

	it("accepts a generated designer pack template archive", async () => {
		const packDir = await writePackTemplate();
		const archivePath = join(
			dirname(packDir),
			"text-designer-pack-template.tar.gz"
		);
		await createTextDesignerPackTemplateArchive({
			archivePath,
			outDir: packDir,
		});

		const result = await verifyTextDesignerPackTemplateInput({
			expectedAssets: 1,
			packArchivePath: archivePath,
		});

		expect(result).toMatchObject({
			assetCount: 1,
			issues: [],
		});
		expect(result.archiveFiles).toBeGreaterThan(0);
	});

	it("reports checklist rows that drift from the manifest", async () => {
		const packDir = await writePackTemplate();
		const checklistPath = join(packDir, "replacement-checklist.csv");
		const checklist = await readFile(checklistPath, "utf8");
		await writeFile(
			checklistPath,
			checklist.replace("assets/text-red-demo/template.qctext", "wrong.qctext")
		);

		const issues = await verifyTextDesignerPackTemplate({
			expectedAssets: 1,
			packDir,
		});

		expect(issues).toEqual([
			expect.objectContaining({
				code: "checklist-mismatch",
				key: "text-red-demo",
			}),
		]);
	});
});
