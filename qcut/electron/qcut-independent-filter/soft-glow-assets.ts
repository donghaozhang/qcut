import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { jianyingFilterPrivateCacheRoot } from "../jianying-filter-local-runtime/private-runtime.js";
import { jianyingFilterCacheRoots } from "../native-pipeline/filters/filter-lab-lut.js";
import { SOFT_GLOW_RESOURCE, SOFT_GLOW_VERSION } from "./soft-glow-contract.js";

export const SOFT_GLOW_LUT_SHA256 =
	"4dc2e1a87a571a18ed4729c04159ddaf18ccf3f79ac35d7cc1141b6aedb2e39f";
const SCENE_SHA256 =
	"09424db1ae0fefdbd459a509db8c04dd4e589db5d7f3ad5586fd86cb5684a7d7";
const RGBA_SHA256 =
	"f9f142849b99e77d5b9174b054c7634d0945f6fd731c4133def07900d0bd9239";

async function checkedFile({
	filePath,
	hash,
}: {
	filePath: string;
	hash: string;
}) {
	const info = await stat(filePath);
	if (!info.isFile() || info.size > 4 * 1024 * 1024)
		throw new Error("Cinematic soft glow asset exceeds the file size limit.");
	const bytes = await readFile(filePath);
	if (createHash("sha256").update(bytes).digest("hex") !== hash)
		throw new Error(
			"Cinematic soft glow asset hash does not match the supported package."
		);
	return bytes;
}

export async function loadSoftGlowLut({
	packagePath,
}: {
	packagePath: string;
}) {
	const feature = join(packagePath, "AmazingFeature");
	const [, png] = await Promise.all([
		checkedFile({ filePath: join(feature, "main.scene"), hash: SCENE_SHA256 }),
		checkedFile({
			filePath: join(feature, "resource/images/reference map2.png"),
			hash: SOFT_GLOW_LUT_SHA256,
		}),
	]);
	const image = await loadImage(png);
	if (image.width !== 512 || image.height !== 512)
		throw new Error("Cinematic soft glow requires a 512 by 512 LUT atlas.");
	const canvas = createCanvas(512, 512);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	const rgba = new Uint8Array(context.getImageData(0, 0, 512, 512).data);
	if (createHash("sha256").update(rgba).digest("hex") !== RGBA_SHA256)
		throw new Error(
			"Cinematic soft glow LUT decoder changed the verified RGBA bytes."
		);
	return rgba;
}

export async function resolveSoftGlowLut() {
	const roots = [
		...new Set([
			jianyingFilterPrivateCacheRoot(),
			...jianyingFilterCacheRoots().map(dirname),
		]),
	];
	const candidates = roots.flatMap((root) =>
		["artistEffect", "effect"].map((kind) =>
			join(root, kind, SOFT_GLOW_RESOURCE, SOFT_GLOW_VERSION)
		)
	);
	const available = await Promise.all(
		candidates.map(async (packagePath) => {
			try {
				return (await stat(packagePath)).isDirectory()
					? packagePath
					: undefined;
			} catch {
				return undefined;
			}
		})
	);
	const packagePath = available.find((value) => value !== undefined);
	if (!packagePath)
		throw new Error(
			"电影柔光需要本机缓存中的指定版本 LUT。没有自动下载或替代滤镜。"
		);
	return loadSoftGlowLut({ packagePath });
}
