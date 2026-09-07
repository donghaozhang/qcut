// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCoverDependencyResolver } from "../jianying-cover-dependency-recovery";
import { identifyCoverDependency } from "../jianying-cover-dependencies";
import { findJianyingLocalPackagesByHash } from "../jianying-text-runtime/local-package-index";
import { findJianyingTextResourceCatalogCandidates } from "../jianying-text-runtime/resource-catalog";
import {
	installJianyingTextCatalogCandidate,
	isTrustedJianyingResourceUrl,
} from "../jianying-text-runtime/resource-recovery-installer";
import { downloadJianyingFilterPackage } from "../jianying-filter-download";

vi.mock("../jianying-text-runtime/local-package-index", () => ({
	findJianyingLocalPackagesByHash: vi.fn(),
}));
vi.mock("../jianying-text-runtime/resource-catalog", () => ({
	findJianyingTextResourceCatalogCandidates: vi.fn(),
}));
vi.mock("../jianying-text-runtime/resource-recovery-installer", () => ({
	installJianyingTextCatalogCandidate: vi.fn(),
	extractValidatedJianyingResourceArchive: vi.fn(),
	isTrustedJianyingResourceUrl: vi.fn(),
}));
vi.mock("../jianying-filter-download", () => ({
	downloadJianyingFilterPackage: vi.fn(),
}));

const oldHash = "a".repeat(32);
const newHash = "b".repeat(32);
const resourceId = "6917512631515353607";
const catalogResourceId = "6896137661153578248";
const reference = `textEffect/${oldHash}`;
const materials = {
	effects: [
		{
			path: reference,
			type: "text_effect",
			name: "002",
			resource_id: resourceId,
		},
	],
};
const candidate = {
	resourceId,
	catalogResourceId,
	packageHash: newHash,
	title: "Style",
	timestamp: "2026-09-06",
	downloadUrls: ["https://example.bytecdn.com/verified.zip"],
};
let root: string;

beforeEach(async () => {
	vi.resetAllMocks();
	root = await mkdtemp(path.join(tmpdir(), "cover-recovery-"));
	vi.mocked(findJianyingLocalPackagesByHash).mockResolvedValue([]);
	vi.mocked(isTrustedJianyingResourceUrl).mockReturnValue(true);
	vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
		new Map()
	);
	vi.mocked(installJianyingTextCatalogCandidate).mockResolvedValue({
		resourceId,
		state: "unavailable",
		reason: "download-failed",
	});
});
afterEach(async () => rm(root, { recursive: true, force: true }));

function resolver({ allowDownload = false }: { allowDownload?: boolean } = {}) {
	return createCoverDependencyResolver({
		cacheRoots: [root],
		databaseRoots: [root],
		recoveryRoot: root,
		filterRoot: root,
		applicationResources: root,
		allowDownload,
	});
}

async function packageDirectory({ hash = newHash }: { hash?: string } = {}) {
	const packagePath = path.join(root, "artistEffect", resourceId, hash);
	await mkdir(packagePath, { recursive: true });
	await writeFile(
		path.join(packagePath, "config.json"),
		'{"effect":{"Link":[{"type":"InfoSticker"}]}}'
	);
	return packagePath;
}

describe("cover dependency identity", () => {
	it("preserves 64-bit font IDs and excludes author media", () => {
		expect(
			identifyCoverDependency({
				reference,
				materials: {
					texts: [
						{
							font_path: reference,
							font_title: "Font",
							font_resource_id: resourceId,
						},
					],
					videos: [{ font_path: reference, font_resource_id: "other" }],
				},
			})
		).toEqual({ kind: "font", name: "Font", resourceId });
	});
	it("refuses conflicting identities and does not infer by title", () => {
		expect(
			identifyCoverDependency({
				reference,
				materials: {
					effects: [
						...materials.effects,
						{ ...materials.effects[0], resource_id: "123" },
					],
				},
			})
		).toBeUndefined();
		expect(
			identifyCoverDependency({ reference: "unrelated", materials })
		).toBeUndefined();
	});
});

describe("lab-backed cover recovery", () => {
	it("reuses exact packages without reading the catalog or downloading", async () => {
		const packagePath = await packageDirectory({ hash: oldHash });
		vi.mocked(findJianyingLocalPackagesByHash).mockResolvedValue([packagePath]);
		expect(
			(await resolver()({ reference, materials })).source?.resolution
		).toMatchObject({
			method: "exact-package",
			source: "text-lab",
			packageHash: oldHash,
		});
		expect(findJianyingTextResourceCatalogCandidates).not.toHaveBeenCalled();
		expect(installJianyingTextCatalogCandidate).not.toHaveBeenCalled();
	});
	it("records catalog-backed version remapping and uses the word-art installer for InfoSticker", async () => {
		const packagePath = await packageDirectory();
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		vi.mocked(installJianyingTextCatalogCandidate).mockResolvedValue({
			resourceId,
			state: "recovered",
			packageHash: newHash,
			packagePath,
		});
		const result = await resolver({ allowDownload: true })({
			reference,
			materials,
		});
		expect(result.source?.resolution).toEqual({
			method: "catalog-version",
			source: "text-lab",
			resourceId,
			catalogResourceId,
			packageHash: newHash,
			label: "Style",
		});
		expect(installJianyingTextCatalogCandidate).toHaveBeenCalledWith(
			expect.objectContaining({ role: "word-art", candidate })
		);
		expect(JSON.stringify(result)).not.toContain("https:");
	});
	it("never downloads by default and reports a catalog miss", async () => {
		expect(await resolver()({ reference, materials })).toEqual({
			reason: "catalog-missing",
		});
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		expect(await resolver()({ reference, materials })).toEqual({
			reason: "package-not-downloaded",
		});
		expect(installJianyingTextCatalogCandidate).not.toHaveBeenCalled();
	});
	it("does not turn a failed recovery into a cached dependency", async () => {
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		expect(
			await resolver({ allowDownload: true })({ reference, materials })
		).toEqual({ reason: "package-recovery-failed" });
	});
	it("does not call an opaque word-art archive a complete dependency", async () => {
		const packagePath = await packageDirectory();
		await rm(path.join(packagePath, "config.json"));
		await writeFile(
			path.join(packagePath, "catalog-package.zip"),
			"opaque archive"
		);
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		vi.mocked(installJianyingTextCatalogCandidate).mockResolvedValue({
			resourceId,
			state: "recovered",
			packageHash: newHash,
			packagePath,
		});
		expect(
			await resolver({ allowDownload: true })({ reference, materials })
		).toEqual({ reason: "package-recovery-failed" });
	});
	it("prefers the original hash over a newer version", async () => {
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([
				[resourceId, [candidate, { ...candidate, packageHash: oldHash }]],
			])
		);
		await resolver({ allowDownload: true })({ reference, materials });
		expect(
			vi.mocked(installJianyingTextCatalogCandidate).mock.calls[0][0].candidate
				.packageHash
		).toBe(oldHash);
	});
	it("delegates filter installation to the existing filter lab", async () => {
		const packagePath = await packageDirectory();
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		vi.mocked(downloadJianyingFilterPackage).mockResolvedValue({
			resourceId,
			version: newHash,
			packagePath,
		});
		const result = await resolver({ allowDownload: true })({
			reference: `filter/${oldHash}`,
			materials: {
				effects: [
					{
						...materials.effects[0],
						path: `filter/${oldHash}`,
						type: "filter",
					},
				],
			},
		});
		expect(result.source?.resolution.source).toBe("filter-lab");
		expect(downloadJianyingFilterPackage).toHaveBeenCalledWith(
			expect.objectContaining({ managedRoot: path.join(root, "artistEffect") })
		);
		expect(installJianyingTextCatalogCandidate).not.toHaveBeenCalled();
	});
	it("does not send untrusted catalog URLs to the filter downloader", async () => {
		vi.mocked(findJianyingTextResourceCatalogCandidates).mockResolvedValue(
			new Map([[resourceId, [candidate]]])
		);
		vi.mocked(isTrustedJianyingResourceUrl).mockReturnValue(false);
		await resolver({ allowDownload: true })({
			reference: `filter/${oldHash}`,
			materials: {
				effects: [
					{
						...materials.effects[0],
						path: `filter/${oldHash}`,
						type: "filter",
					},
				],
			},
		});
		expect(downloadJianyingFilterPackage).not.toHaveBeenCalled();
	});
	it("copies an explicit system-font dependency, not a font with an unavailable ID", async () => {
		await mkdir(path.join(root, "Font/SystemFont"), { recursive: true });
		await writeFile(path.join(root, "Font/SystemFont/zh-hans.ttf"), "font");
		const args = {
			reference: `text/${oldHash}`,
			materials: {
				texts: [
					{
						font_path: `text/${oldHash}`,
						font_title: "系统",
						font_resource_id: "",
					},
				],
			},
		};
		expect((await resolver()(args)).source).toMatchObject({
			singleFile: true,
			relativePath: "Font/SystemFont/zh-hans.ttf",
			resolution: { method: "builtin" },
		});
		args.materials.texts[0].font_resource_id = resourceId;
		expect((await resolver()(args)).source).toBeUndefined();
		expect(
			(
				await resolver()({
					...args,
					materials: {
						texts: [
							{
								...args.materials.texts[0],
								font_resource_id: Number(resourceId),
							},
						],
					},
				})
			).source
		).toBeUndefined();
	});
	it("accepts only the known typed native brightness reference", async () => {
		await mkdir(path.join(root, "DefaultAdjustBundle/brightness"), {
			recursive: true,
		});
		const ref =
			"/var/containers/Bundle/Application/ABC-123/VideoFusionInhouse.app/LVEditor.bundle/AdjustResource.bundle/brightness";
		expect(
			(
				await resolver()({
					reference: ref,
					materials: { effects: [{ path: ref, type: "brightness" }] },
				})
			).source?.resolution.method
		).toBe("builtin");
		expect(
			(
				await resolver()({
					reference: "/secret/brightness",
					materials: {
						effects: [{ path: "/secret/brightness", type: "brightness" }],
					},
				})
			).source
		).toBeUndefined();
	});
	it("rejects a symlinked package directory", async () => {
		const packagePath = await packageDirectory();
		const link = path.join(root, oldHash);
		await symlink(packagePath, link);
		vi.mocked(findJianyingLocalPackagesByHash).mockResolvedValue([link]);
		expect((await resolver()({ reference, materials })).source).toBeUndefined();
	});
	it("honors brightness versions and refuses unknown builtin versions", async () => {
		await mkdir(path.join(root, "DefaultAdjustBundle/brightness_v1"), {
			recursive: true,
		});
		const ref =
			"/var/containers/Bundle/Application/ABC-123/VideoFusionInhouse.app/LVEditor.bundle/AdjustResource.bundle/brightness";
		const args = {
			reference: ref,
			materials: {
				effects: [{ path: ref, type: "brightness", version: "v1" }],
			},
		};
		expect((await resolver()(args)).source?.relativePath).toBe(
			"DefaultAdjustBundle/brightness_v1"
		);
		args.materials.effects[0].version = "v999";
		expect((await resolver()(args)).source).toBeUndefined();
		expect(
			identifyCoverDependency({
				reference: ref,
				materials: { effects: [{ ...args.materials.effects[0], version: 1 }] },
			})
		).toBeUndefined();
	});
});
