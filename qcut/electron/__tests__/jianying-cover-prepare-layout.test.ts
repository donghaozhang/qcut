import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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
import { preparePrivateCoverTextLayout } from "../jianying-cover-prepare-layout";
import { retainCoverLayoutWordArt } from "../jianying-cover-layout-assets";
import { listPrivateCovers } from "../jianying-cover-private-cache";
import type {
	CoverCachedFile,
	CoverCachedEntry,
	CoverCatalog,
} from "../jianying-cover-contract";
import { coverLayoutFixture } from "./fixtures/cover-layout";

vi.mock("../jianying-font-lab-catalog", () => ({
	readFontkitMetadata: () => ({
		familyName: "Fixture",
		fullName: "Fixture Regular",
		postscriptName: "Fixture-Regular",
		subfamilyName: "Regular",
	}),
}));
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

async function fixture({ wordArt = false }: { wordArt?: boolean } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "qcut-cover-layout-"));
	roots.push(root);
	await mkdir(path.join(root, "objects"));
	const source = coverLayoutFixture();
	if (wordArt) source.segment.extra_material_refs = [source.effect.id];
	const store = async ({
		content,
		logicalPath,
	}: {
		content: string;
		logicalPath: string;
	}): Promise<CoverCachedFile> => {
		const bytes = Buffer.from(content),
			sha256 = createHash("sha256").update(bytes).digest("hex");
		const file = {
			path: `objects/${sha256}`,
			sha256,
			bytes: bytes.length,
			logicalPath,
		};
		await writeFile(path.join(root, file.path), bytes);
		return file;
	};
	const definition = await store({
		content: JSON.stringify(source.definition),
		logicalPath: "template.json",
	});
	const preview = await store({
		content: "fixture-preview",
		logicalPath: "preview.webp",
	});
	const font = await store({
		content: "fixture-font",
		logicalPath: `${source.fontReference}/font.ttf`,
	});
	const config = await store({
		content: JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
		logicalPath: `${source.effectReference}/config.json`,
	});
	const texture = await store({
		content: "fixture-texture",
		logicalPath: `${source.effectReference}/image/texture.png`,
	});
	const dependency: CoverCachedEntry["dependencies"][number] = {
		reference: source.effectReference,
		status: "cached",
		files: [config, texture],
		resolution: {
			method: "catalog-version",
			source: "text-lab",
			catalogResourceId: "789",
			packageHash: "e".repeat(32),
		},
	};
	const entry: CoverCachedEntry = {
		packageHash: "a".repeat(32),
		previewHash: "f".repeat(32),
		title: "Fixture",
		categories: ["life"],
		evidence: "native-ui-and-template-content",
		definition,
		preview,
		dependencies: [
			{ reference: source.fontReference, status: "cached", files: [font] },
			{ reference: source.filter.path, status: "missing", files: [] },
			...(wordArt ? [dependency] : []),
		],
		textCount: 1,
		cacheStatus: "missing-dependencies",
		renderStatus: "native-renderer-required",
	};
	const catalog: CoverCatalog = {
		schema: "qcut.private-jianying-cover",
		version: 1,
		capturedAt: new Date().toISOString(),
		coverage: "observed-downloaded-subset",
		entries: [entry],
	};
	await writeFile(path.join(root, "catalog.json"), JSON.stringify(catalog));
	return {
		root,
		source,
		entry,
		font,
		dependency,
		catalog,
		store,
		fontRoot: path.join(root, "fonts"),
		packageRoot: path.join(root, "packages"),
		request: { packageHash: entry.packageHash },
	};
}

describe("private cover layout preparation", () => {
	it("requires verified builtin font identity for implicit system fonts", async () => {
		const input = await fixture();
		input.source.text.font_path = "text/";
		input.source.text.font_title = "系统";
		input.entry.definition = await input.store({
			content: JSON.stringify(input.source.definition),
			logicalPath: "template.json",
		});
		await writeFile(
			path.join(input.root, "catalog.json"),
			JSON.stringify(input.catalog)
		);
		expect(
			(await listPrivateCovers({ root: input.root })).entries[0].textLayout
				?.ready
		).toBe(false);
		await expect(preparePrivateCoverTextLayout(input)).rejects.toThrow(
			"missing or ambiguous"
		);
		input.entry.dependencies[0].resolution = {
			method: "builtin",
			source: "application-builtin",
			label: "SystemFont/zh-hans.ttf",
		};
		await writeFile(
			path.join(input.root, "catalog.json"),
			JSON.stringify(input.catalog)
		);
		expect(
			(await listPrivateCovers({ root: input.root })).entries[0].textLayout
				?.ready
		).toBe(true);
		expect(
			(await preparePrivateCoverTextLayout(input)).fonts["text/"].fontId
		).toBe(`sha256:${input.font.sha256}`);
	});
	it("rejects extra files inside existing native packages", async () => {
		const input = await fixture({ wordArt: true });
		await preparePrivateCoverTextLayout(input);
		await writeFile(
			path.join(input.packageRoot, "789", "e".repeat(32), "unexpected.lua"),
			"return 1"
		);
		await expect(preparePrivateCoverTextLayout(input)).rejects.toThrow(
			"file inventory mismatch"
		);
	});
	it("loads text independently of missing background filters and retains its verified font", async () => {
		const input = await fixture();
		const result = await preparePrivateCoverTextLayout(input);
		expect(result.texts[0].text.content).toBe("Hello");
		expect(
			await readFile(
				path.join(input.fontRoot, `${input.font.sha256}.ttf`),
				"utf8"
			)
		).toBe("fixture-font");
		const listed = (await listPrivateCovers({ root: input.root })).entries[0];
		expect(listed.cacheStatus).toBe("missing-dependencies");
		expect(listed.textLayout).toMatchObject({
			ready: true,
			requiresNative: false,
		});
		expect(listed.dependencies[1].usage?.role).toBe("background");
	});
	it("rehydrates exact mapped word-art files for the existing runtime and coalesces concurrent requests", async () => {
		const input = await fixture({ wordArt: true });
		const first = preparePrivateCoverTextLayout(input);
		expect(preparePrivateCoverTextLayout(input)).toBe(first);
		const result = await first;
		expect(result.wordArt[input.source.effectReference]).toMatchObject({
			resourceId: "789",
			packageHash: "e".repeat(32),
			packageKind: "InfoSticker",
		});
		expect(
			await readFile(
				path.join(
					input.packageRoot,
					"789",
					"e".repeat(32),
					"image/texture.png"
				),
				"utf8"
			)
		).toBe("fixture-texture");
		await expect(preparePrivateCoverTextLayout(input)).resolves.toMatchObject({
			packageHash: input.entry.packageHash,
		});
	});
	it("rejects corrupt font bytes before staging a usable layout", async () => {
		const input = await fixture();
		await writeFile(path.join(input.root, input.font.path), "corrupt");
		await expect(preparePrivateCoverTextLayout(input)).rejects.toThrow();
	});
	it("rejects arbitrary paths and unobserved template IDs", async () => {
		const input = await fixture();
		expect(() =>
			preparePrivateCoverTextLayout({
				...input,
				request: { packageHash: "../escape" },
			})
		).toThrow();
		await expect(
			preparePrivateCoverTextLayout({
				...input,
				request: { packageHash: "f".repeat(32) },
			})
		).rejects.toThrow("Unknown cached");
	});
	it("rejects traversal, duplicate and symlinked word-art destinations", async () => {
		const input = await fixture({ wordArt: true });
		const request = { ...input, effect: input.source.effect };
		await expect(
			retainCoverLayoutWordArt({
				...request,
				dependency: {
					...input.dependency,
					files: [
						{
							...input.dependency.files[0],
							logicalPath: `${input.source.effectReference}/../escape`,
						},
					],
				},
			})
		).rejects.toThrow("Unsafe");
		await expect(
			retainCoverLayoutWordArt({
				...request,
				dependency: {
					...input.dependency,
					files: [input.dependency.files[0], input.dependency.files[0]],
				},
			})
		).rejects.toThrow("Duplicate");
		await mkdir(input.packageRoot);
		await symlink(input.root, path.join(input.packageRoot, "789"));
		await expect(retainCoverLayoutWordArt(request)).rejects.toThrow(
			"Symlinked"
		);
	});
});
