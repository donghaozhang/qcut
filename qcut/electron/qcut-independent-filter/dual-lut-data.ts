import { readFile, stat } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
	decodeTiledLutPixels,
	loadTiledLutCube,
} from "../native-pipeline/filters/filter-lab-tiled-lut.js";

export async function loadDualTiledCube({ filePath }: { filePath: string }) {
	if ((await stat(filePath)).size > 16 * 1024 * 1024)
		throw new Error("Dual LUT image exceeds size limit.");
	const bytes = await readFile(filePath);
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
		return loadTiledLutCube({ filePath });
	// Some pinned .png assets contain JPEG. Preserve the image decoder's chroma reconstruction.
	const image = await loadImage(bytes);
	if (image.width !== 512 || image.height !== 512)
		throw new Error("Invalid JPEG LUT dimensions.");
	const canvas = createCanvas(512, 512);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	const rgba = context.getImageData(0, 0, 512, 512).data;
	const rgb = new Uint8Array(512 * 512 * 3);
	for (let i = 0; i < 512 * 512; i++)
		rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
	return decodeTiledLutPixels({ pixels: rgb });
}
