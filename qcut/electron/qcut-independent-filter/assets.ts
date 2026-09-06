import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { jianyingFilterPrivateCacheRoot } from "../jianying-filter-local-runtime/private-runtime.js";
import { jianyingFilterCacheRoots } from "../native-pipeline/filters/filter-lab-lut.js";
import { QCUT_FOG_RESOURCE, QCUT_FOG_VERSION } from "./contract.js";

const LUT_SHA256 =
	"e3d93009c983c84a674e5d288d8d3fbdd8f3e9572f9687132cc03bd4e14976d8";

export function validateIndependentFilterIdentity({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	if (resourceId !== QCUT_FOG_RESOURCE || version !== QCUT_FOG_VERSION) {
		throw new Error(
			"QCut Metal currently supports only the verified Fog package version."
		);
	}
}

export async function loadIndependentFogLut({
	filePath,
}: {
	filePath: string;
}) {
	if ((await stat(filePath)).size > 4 * 1024 * 1024)
		throw new Error("Local Fog LUT exceeds the size limit.");
	const bytes = await readFile(filePath);
	if (createHash("sha256").update(bytes).digest("hex") !== LUT_SHA256) {
		throw new Error("Local Fog LUT hash does not match the verified version.");
	}
	const image = await loadImage(bytes);
	if (image.width !== 512 || image.height !== 512)
		throw new Error("Fog LUT must be a 512x512 atlas.");
	const canvas = createCanvas(512, 512);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	return new Uint8Array(context.getImageData(0, 0, 512, 512).data);
}

export async function resolveIndependentFogLut() {
	const override = process.env.QCUT_INDEPENDENT_FILTER_LUT_PATH;
	const roots = [
		...new Set([
			jianyingFilterPrivateCacheRoot(),
			...jianyingFilterCacheRoots().map(dirname),
		]),
	];
	const candidates = override
		? [override]
		: roots.map((root) =>
				join(
					root,
					"artistEffect",
					QCUT_FOG_RESOURCE,
					QCUT_FOG_VERSION,
					"AmazingFeature",
					"image",
					"filter.png"
				)
			);
	const found = await Promise.all(
		candidates.map(async (filePath) => {
			try {
				return (await stat(filePath)).isFile() ? filePath : undefined;
			} catch {
				return undefined;
			}
		})
	);
	const filePath = found.find((candidate) => candidate !== undefined);
	if (!filePath)
		throw new Error(
			"QCut Metal requires the local Fog LUT. No assets are bundled or downloaded automatically."
		);
	await loadIndependentFogLut({ filePath });
	return filePath;
}
