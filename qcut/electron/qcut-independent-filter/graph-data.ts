import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import { jianyingFilterCacheRoots } from "../native-pipeline/filters/filter-lab-lut.js";
import { loadTiledLutCube } from "../native-pipeline/filters/filter-lab-tiled-lut.js";
import { parseAdobeThreeDl } from "./adobe-three-dl.js";
import {
	findIndependentGraphProfile,
	type IndependentGraphProfile,
} from "./graph-profiles.js";
import { encodeIndependentCube, type IndependentCube } from "./lut-data.js";

export interface IndependentGraphData {
	profile: IndependentGraphProfile;
	cube: IndependentCube;
	overlay?: { width: number; height: number; rgba: Uint8Array };
}

export function supportsIndependentGraph({
	card,
}: {
	card: JianyingFilterCatalogCard;
}) {
	return Boolean(
		card.available &&
			card.cacheStatus === "cached" &&
			card.version &&
			!card.sdkModel &&
			!card.requirements?.some((value) => value !== "blit") &&
			findIndependentGraphProfile({
				identity: { resourceId: card.resourceId, version: card.version },
			})
	);
}

export async function hashIndependentGraphControls({ root }: { root: string }) {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	if (entries.length > 5000 || entries.some((entry) => entry.isSymbolicLink()))
		throw new Error("Unsafe or oversized independent graph package.");
	const paths = entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)))
		.filter((path) =>
			/\.(lua|xshader|frag|vert|scene|material|rt|texture|json|config)$/.test(
				path
			)
		)
		.sort();
	const sizes = await Promise.all(
		paths.map(async (path) => (await stat(join(root, path))).size)
	);
	if (
		sizes.some((size) => size > 2 * 1024 * 1024) ||
		sizes.reduce((sum, size) => sum + size, 0) > 32 * 1024 * 1024
	)
		throw new Error("Graph control files exceed size limits.");
	const chunks = await Promise.all(
		paths.map(async (path) => ({
			path,
			bytes: await readFile(join(root, path)),
		}))
	);
	const hash = createHash("sha256");
	for (const { path, bytes } of chunks)
		hash.update(path).update("\0").update(bytes).update("\0");
	return hash.digest("hex");
}

export async function hashIndependentGraphAssets({
	root,
	profile,
}: {
	root: string;
	profile: Pick<IndependentGraphProfile, "kind" | "alphaWeighted">;
}) {
	const paths =
		profile.kind === "direct"
			? [profile.alphaWeighted ? "texture/filter1.3dl" : "texture/filter.3dl"]
			: [
					profile.kind === "sharpen" ? "image/filter.png" : "image/lut0.png",
					...(profile.kind === "vignette" ? ["image/src1.png"] : []),
				];
	const chunks = await Promise.all(
		paths.map(async (path) => {
			const file = join(root, "AmazingFeature", path);
			if ((await stat(file)).size > 16 * 1024 * 1024)
				throw new Error("Graph asset exceeds size limit.");
			return { path, bytes: await readFile(file) };
		})
	);
	const hash = createHash("sha256");
	for (const { path, bytes } of chunks)
		hash.update(path).update("\0").update(bytes).update("\0");
	return hash.digest("hex");
}

export async function independentGraphPackageRoot({
	profile,
}: {
	profile: IndependentGraphProfile;
}) {
	const roots = [...new Set(jianyingFilterCacheRoots().map(dirname))].reverse();
	const candidates = roots.flatMap((root) =>
		["artistEffect", "effect"].map((container) =>
			join(root, container, profile.resourceId, profile.version)
		)
	);
	const existing = await Promise.all(
		candidates.map(async (path) => {
			try {
				return (await stat(path)).isDirectory() ? path : null;
			} catch {
				return null;
			}
		})
	);
	const root = existing.find(Boolean);
	if (!root)
		throw new Error("Independent graph package is not cached locally.");
	const resolved = await realpath(root);
	const parent = await realpath(dirname(root));
	if (!resolved.startsWith(parent + sep))
		throw new Error("Graph package escapes its cache.");
	if ((await hashIndependentGraphControls({ root })) !== profile.controlHash)
		throw new Error(
			"Independent graph controls changed. This package needs revalidation."
		);
	if (
		(await hashIndependentGraphAssets({ root, profile })) !== profile.assetHash
	)
		throw new Error(
			"Independent graph assets changed. Restore the verified private package."
		);
	return root;
}

export async function loadIndependentGraph({
	card,
}: {
	card: JianyingFilterCatalogCard;
}): Promise<IndependentGraphData> {
	if (!supportsIndependentGraph({ card }))
		throw new Error("Unsupported independent graph identity.");
	const profile = findIndependentGraphProfile({
		identity: { resourceId: card.resourceId, version: card.version! },
	})!;
	const root = await independentGraphPackageRoot({ profile });
	const feature = join(root, "AmazingFeature");
	if (profile.kind === "direct") {
		const path = join(
			feature,
			profile.alphaWeighted ? "texture/filter1.3dl" : "texture/filter.3dl"
		);
		if ((await stat(path)).size > 16 * 1024 * 1024)
			throw new Error("3DL file too large.");
		return {
			profile,
			cube: parseAdobeThreeDl({ text: await readFile(path, "utf8") }),
		};
	}
	const cube = await loadTiledLutCube({
		filePath: join(
			feature,
			"image",
			profile.kind === "sharpen" ? "filter.png" : "lut0.png"
		),
	});
	if (!cube) throw new Error("Independent graph LUT is invalid.");
	if (profile.kind !== "vignette") return { profile, cube };
	const path = join(feature, "image/src1.png");
	if ((await stat(path)).size > 16 * 1024 * 1024)
		throw new Error("Overlay file too large.");
	const image = await loadImage(await readFile(path));
	if (
		image.width > 4096 ||
		image.height > 4096 ||
		image.width * image.height > 4096 * 4096
	)
		throw new Error("Overlay dimensions are unsupported.");
	const canvas = createCanvas(image.width, image.height);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	return {
		profile,
		cube,
		overlay: {
			width: image.width,
			height: image.height,
			rgba: new Uint8Array(
				context.getImageData(0, 0, image.width, image.height).data
			),
		},
	};
}

export function encodeIndependentGraph({
	graph,
}: {
	graph: IndependentGraphData;
}) {
	const kind = ["direct", "sharpen", "vignette", "soften"].indexOf(
		graph.profile.kind
	);
	if (kind < 0 || ![0.5, 1].includes(graph.profile.corner))
		throw new Error("Invalid independent graph configuration.");
	const overlay = graph.overlay;
	if (kind !== 2 && overlay) throw new Error("Unexpected graph overlay.");
	if (
		kind === 2 &&
		(!overlay ||
			!Number.isInteger(overlay.width) ||
			!Number.isInteger(overlay.height) ||
			overlay.width < 1 ||
			overlay.height < 1 ||
			overlay.width > 4096 ||
			overlay.height > 4096 ||
			overlay.rgba.length !== overlay.width * overlay.height * 4)
	)
		throw new Error("Invalid graph overlay.");
	const header = Buffer.alloc(24);
	header.writeUInt32LE(kind, 0);
	header.writeUInt32LE(graph.profile.alphaWeighted ? 1 : 0, 4);
	header.writeFloatLE(graph.profile.corner, 8);
	header.writeUInt32LE(overlay?.width ?? 0, 12);
	header.writeUInt32LE(overlay?.height ?? 0, 16);
	return Buffer.concat([
		header,
		encodeIndependentCube({ cube: graph.cube }),
		overlay?.rgba ?? new Uint8Array(),
	]);
}
