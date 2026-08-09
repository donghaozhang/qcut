import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTempRoot({ prefix }: { prefix: string }) {
	return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeTextFile({
	filePath,
	content,
}: {
	filePath: string;
	content: string;
}) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, content);
}

export function writeJsonFile({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}) {
	writeTextFile({ filePath, content: JSON.stringify(value) });
}

export function writePpm({
	filePath,
	width,
	height,
	pixels,
}: {
	filePath: string;
	width: number;
	height: number;
	pixels: number[];
}) {
	const expectedLength = width * height * 3;
	if (pixels.length !== expectedLength) {
		throw new Error(`Expected ${expectedLength} RGB values, received ${pixels.length}`);
	}
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(
		filePath,
		Buffer.concat([
			Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii"),
			Buffer.from(pixels),
		])
	);
}
