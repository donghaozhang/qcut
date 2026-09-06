import { afterEach, describe, expect, it } from "vitest";
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	JIANYING_COVER_CATEGORIES,
	type CoverObservation,
} from "../jianying-cover-contract";
import {
	backupCoverCatalog,
	cacheJianyingCovers,
	coverDependencyReferences,
	listPrivateCovers,
	readCoverCatalog,
	verifyCoverCatalog,
} from "../jianying-cover-private-cache";

const roots: string[] = [];
const packageHash = "a".repeat(32);
const previewHash = "b".repeat(32);
const fontHash = "c".repeat(32);
const observation: CoverObservation = {
	packageHash,
	previewHash,
	title: "Fixture cover",
	categories: ["life", "recommended"],
	evidence: "native-ui-and-template-content",
};
const webp = Buffer.from(
	"UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
	"base64"
);

async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), "qcut-cover-cache-test-"));
	roots.push(root);
	const sourceRoot = path.join(root, "source");
	const destination = path.join(root, "owned");
	await mkdir(path.join(sourceRoot, "template", packageHash), {
		recursive: true,
	});
	await mkdir(path.join(sourceRoot, "image"), { recursive: true });
	await mkdir(path.join(sourceRoot, "effect", "123", fontHash), {
		recursive: true,
	});
	await writeFile(path.join(sourceRoot, "image", previewHash), webp);
	await writeFile(
		path.join(sourceRoot, "effect", "123", fontHash, "font.ttf"),
		"test font payload"
	);
	await writeFile(
		path.join(sourceRoot, "effect", "123", fontHash, "config.json"),
		'{"file":"font.ttf"}'
	);
	const definition = path.join(
		sourceRoot,
		"template",
		packageHash,
		"template.json"
	);
	await writeFile(
		definition,
		JSON.stringify({
			cover: {
				cover_draft: {
					tracks: [],
					materials: {
						texts: [{ content: "Hello", font_path: `text/${fontHash}` }],
						videos: [{ path: "video/author-private-photo.png" }],
					},
				},
			},
		})
	);
	return {
		root,
		sourceRoot,
		destination,
		definition,
		observations: [observation],
	};
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("private Jianying cover cache", () => {
	it("preserves the observed eight categories in native order", () => {
		expect(JIANYING_COVER_CATEGORIES.map((item) => item.zh)).toEqual([
			"默认",
			"推荐",
			"生活",
			"游戏",
			"知识",
			"时尚",
			"影视",
			"美食",
		]);
	});
	it("copies definitions, real previews and complete resource directories without source links", async () => {
		const options = await fixture();
		const catalog = await cacheJianyingCovers(options);
		expect(catalog.entries[0]).toMatchObject({
			cacheStatus: "complete",
			textCount: 1,
			renderStatus: "native-renderer-required",
		});
		expect(catalog.entries[0].dependencies[0].files).toHaveLength(2);
		await rm(options.sourceRoot, { recursive: true });
		const library = await listPrivateCovers({ root: options.destination });
		expect(library.entries[0].previewDataUrl).toBe(
			`data:image/webp;base64,${webp.toString("base64")}`
		);
		const backup = path.join(options.root, "backup");
		await backupCoverCatalog({
			root: options.destination,
			destination: backup,
		});
		await rm(options.destination, { recursive: true });
		expect(await listPrivateCovers({ root: backup })).toEqual(library);
	});
	it("is idempotent and preserves earlier batches", async () => {
		const options = await fixture();
		await cacheJianyingCovers(options);
		await cacheJianyingCovers(options);
		const catalog = await cacheJianyingCovers({ ...options, observations: [] });
		expect(catalog.entries).toHaveLength(1);
	});
	it("keeps verified owned dependencies and category memberships when retrying a depleted source", async () => {
		const options = await fixture();
		const before = await cacheJianyingCovers(options);
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const after = await cacheJianyingCovers({
			...options,
			observations: [{ ...observation, categories: ["games"] }],
		});
		expect(after.entries[0].dependencies).toEqual(
			before.entries[0].dependencies
		);
		expect(after.entries[0].categories).toEqual([
			"life",
			"recommended",
			"games",
		]);
		await verifyCoverCatalog({ root: options.destination, catalog: after });
	});
	it("does not reuse dependencies from a changed template definition", async () => {
		const options = await fixture();
		await cacheJianyingCovers(options);
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const changed = JSON.parse(await readFile(options.definition, "utf8"));
		changed.cover.cover_draft.materials.texts[0].content = "Changed";
		await writeFile(options.definition, JSON.stringify(changed));
		const after = await cacheJianyingCovers(options);
		expect(after.entries[0].dependencies[0].status).toBe("missing");
	});
	it("retains recovered lab packages and provenance independently of both sources", async () => {
		const options = await fixture();
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const lab = path.join(options.root, "lab");
		await mkdir(path.join(lab, "package"), { recursive: true });
		await writeFile(path.join(lab, "package", "effect.frag"), "shader payload");
		await writeFile(
			path.join(lab, "package", "._effect.frag"),
			"disk metadata"
		);
		const resolution = {
			method: "catalog-version" as const,
			source: "text-lab" as const,
			packageHash: "d".repeat(32),
		};
		const catalog = await cacheJianyingCovers({
			...options,
			resolveDependency: async () => ({
				source: { root: lab, relativePath: "package", resolution },
			}),
		});
		expect(catalog.entries[0].dependencies[0]).toMatchObject({
			status: "cached",
			resolution,
		});
		expect(catalog.entries[0].dependencies[0].files).toHaveLength(1);
		await rm(lab, { recursive: true });
		await rm(options.sourceRoot, { recursive: true });
		await verifyCoverCatalog({ root: options.destination, catalog });
		const backup = path.join(options.root, "backup");
		await backupCoverCatalog({
			root: options.destination,
			destination: backup,
		});
		expect(
			(await readCoverCatalog({ root: backup }))?.entries[0].dependencies[0]
				.resolution
		).toEqual(resolution);
	});
	it("copies only the selected builtin font and preserves a missing reason", async () => {
		const options = await fixture();
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const lab = path.join(options.root, "lab");
		await mkdir(lab);
		await writeFile(path.join(lab, "font.ttf"), "font");
		await writeFile(path.join(lab, "unrelated.ttf"), "unrelated");
		const catalog = await cacheJianyingCovers({
			...options,
			resolveDependency: async () => ({
				source: {
					root: lab,
					relativePath: "font.ttf",
					singleFile: true,
					resolution: { method: "builtin", source: "application-builtin" },
				},
			}),
		});
		expect(catalog.entries[0].dependencies[0].files).toHaveLength(1);
		expect(catalog.entries[0].dependencies[0].files[0].logicalPath).toBe(
			`text/${fontHash}/font.ttf`
		);
		const missing = await cacheJianyingCovers({
			...options,
			destination: path.join(options.root, "fresh-missing-cache"),
			resolveDependency: async () => ({ reason: "catalog-missing" }),
		});
		expect(missing.entries[0].dependencies[0]).toMatchObject({
			status: "missing",
			reason: "catalog-missing",
		});
	});
	it("rejects symlinks inside recovered lab packages without replacing the catalog", async () => {
		const options = await fixture();
		await cacheJianyingCovers(options);
		const before = await readFile(
			path.join(options.destination, "catalog.json")
		);
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const lab = path.join(options.root, "lab");
		await mkdir(lab);
		await symlink(options.definition, path.join(lab, "escape"));
		await expect(
			cacheJianyingCovers({
				...options,
				resolveDependency: async () => ({
					source: {
						root: options.root,
						relativePath: "lab",
						resolution: { method: "exact-package", source: "text-lab" },
					},
				}),
			})
		).rejects.toThrow("Symlink");
		expect(
			await readFile(path.join(options.destination, "catalog.json"))
		).toEqual(before);
	});
	it("reports missing dependencies instead of claiming offline readiness", async () => {
		const options = await fixture();
		await rm(path.join(options.sourceRoot, "effect"), { recursive: true });
		const catalog = await cacheJianyingCovers(options);
		expect(catalog.entries[0].cacheStatus).toBe("missing-dependencies");
		expect(catalog.entries[0].dependencies[0]).toMatchObject({
			status: "missing",
			files: [],
		});
	});
	it("does not copy replaceable author backgrounds or system text placeholders", () => {
		expect(
			coverDependencyReferences({
				materials: {
					videos: [{ path: "video/private.png" }],
					texts: [{ font_path: "text/" }],
					effects: [{ path: "filter/abc" }],
				},
			})
		).toEqual(["filter/abc"]);
	});
	it("does not guess a replacement for unknown native paths", async () => {
		const options = await fixture();
		await writeFile(
			options.definition,
			JSON.stringify({
				cover: {
					cover_draft: {
						tracks: [],
						materials: { effects: [{ path: "/old-app/brightness" }] },
					},
				},
			})
		);
		const catalog = await cacheJianyingCovers(options);
		expect(catalog.entries[0].dependencies[0].status).toBe("unsupported-path");
	});
	it("rejects traversal in observations", async () => {
		const options = await fixture();
		await expect(
			cacheJianyingCovers({
				...options,
				observations: [{ ...observation, packageHash: "../secret" }],
			})
		).rejects.toThrow();
	});
	it("rejects unobserved categories and duplicate package IDs", async () => {
		const options = await fixture();
		await expect(
			cacheJianyingCovers({
				...options,
				observations: [{ ...observation, categories: ["random"] }],
			})
		).rejects.toThrow();
		await expect(
			cacheJianyingCovers({
				...options,
				observations: [observation, observation],
			})
		).rejects.toThrow("Duplicate");
	});
	it("rejects symlink source previews and resource files", async () => {
		const options = await fixture();
		const preview = path.join(options.sourceRoot, "image", previewHash);
		await rm(preview);
		await symlink(options.definition, preview);
		await expect(cacheJianyingCovers(options)).rejects.toThrow("Symlink");
		await rm(preview);
		await writeFile(preview, webp);
		await symlink(
			options.definition,
			path.join(options.sourceRoot, "effect", "123", fontHash, "escape")
		);
		await expect(cacheJianyingCovers(options)).rejects.toThrow("Symlink");
	});
	it("rejects non-image previews without replacing a valid catalog", async () => {
		const options = await fixture();
		await cacheJianyingCovers(options);
		const before = await readFile(
			path.join(options.destination, "catalog.json")
		);
		await writeFile(
			path.join(options.sourceRoot, "image", previewHash),
			"not an image"
		);
		await expect(cacheJianyingCovers(options)).rejects.toThrow("not WebP");
		expect(
			await readFile(path.join(options.destination, "catalog.json"))
		).toEqual(before);
	});
	it("rejects partial template JSON and leaves the previous batch intact", async () => {
		const options = await fixture();
		await cacheJianyingCovers(options);
		await writeFile(options.definition, '{"cover":');
		await expect(cacheJianyingCovers(options)).rejects.toThrow();
		expect(
			(await listPrivateCovers({ root: options.destination })).entries
		).toHaveLength(1);
	});
	it("detects corrupt stored bytes before listing or backing up", async () => {
		const options = await fixture();
		const catalog = await cacheJianyingCovers(options);
		await writeFile(
			path.join(options.destination, catalog.entries[0].definition.path),
			"corrupt"
		);
		await expect(
			verifyCoverCatalog({ root: options.destination, catalog })
		).rejects.toThrow("checksum");
		await expect(
			listPrivateCovers({ root: options.destination })
		).rejects.toThrow("checksum");
		await expect(
			backupCoverCatalog({
				root: options.destination,
				destination: path.join(options.root, "backup"),
			})
		).rejects.toThrow("checksum");
	});
	it("rejects manifest path escapes and symlink output directories", async () => {
		const options = await fixture();
		const catalog = await cacheJianyingCovers(options);
		catalog.entries[0].definition.path = "../secret";
		await writeFile(
			path.join(options.destination, "catalog.json"),
			JSON.stringify(catalog)
		);
		await expect(
			readCoverCatalog({ root: options.destination })
		).rejects.toThrow();
		await rm(options.destination, { recursive: true });
		await mkdir(options.destination);
		await symlink(
			options.sourceRoot,
			path.join(options.destination, "objects")
		);
		await expect(cacheJianyingCovers(options)).rejects.toThrow("Symlink");
	});
	it("refuses to make the private destination a child of the Jianying cache", async () => {
		const options = await fixture();
		await expect(
			cacheJianyingCovers({
				...options,
				destination: path.join(options.sourceRoot, "owned"),
			})
		).rejects.toThrow("independent");
	});
	it("returns an empty library when the private archive does not exist", async () => {
		const options = await fixture();
		expect(await listPrivateCovers({ root: options.destination })).toEqual({
			entries: [],
			capturedAt: null,
			coverage: "observed-downloaded-subset",
		});
	});
});
