import { open, readFile } from "node:fs/promises";
import type { FilterLabCube } from "./filter-lab-lut.js";

const MAX_CUBE_HEADER_BYTES = 64 * 1024;
const MAX_CUBE_SIZE = 256;

function parseTriplet({
	value,
}: {
	value: string;
}): [number, number, number] | null {
	const entries = value.trim().split(/\s+/).map(Number);
	if (
		entries.length !== 3 ||
		entries.some((entry) => !Number.isFinite(entry))
	) {
		return null;
	}
	return [entries[0], entries[1], entries[2]];
}

export function findTextCubeSize({ text }: { text: string }): number | null {
	const match = /^\s*LUT_3D_SIZE\s+(\d+)\s*$/im.exec(text);
	if (!match) return null;
	const size = Number(match[1]);
	return Number.isSafeInteger(size) && size >= 2 && size <= MAX_CUBE_SIZE
		? size
		: null;
}

export function decodeTextCube({
	text,
}: {
	text: string;
}): FilterLabCube | null {
	if (/^\s*LUT_1D_SIZE\b/im.test(text)) return null;
	const size = findTextCubeSize({ text });
	if (!size) return null;

	let domainMin: [number, number, number] = [0, 0, 0];
	let domainMax: [number, number, number] = [1, 1, 1];
	const values: number[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const [keyword, ...rest] = line.split(/\s+/);
		if (keyword === "DOMAIN_MIN") {
			const parsed = parseTriplet({ value: rest.join(" ") });
			if (!parsed) return null;
			domainMin = parsed;
			continue;
		}
		if (keyword === "DOMAIN_MAX") {
			const parsed = parseTriplet({ value: rest.join(" ") });
			if (!parsed) return null;
			domainMax = parsed;
			continue;
		}
		if (/^[A-Za-z_]/.test(line)) continue;
		const parsed = parseTriplet({ value: line });
		if (!parsed) return null;
		values.push(...parsed);
	}
	if (values.length !== size ** 3 * 3) return null;
	return { size, domainMin, domainMax, values: Float64Array.from(values) };
}

export async function inspectTextCubeFile({
	filePath,
}: {
	filePath: string;
}): Promise<number | null> {
	try {
		const handle = await open(filePath, "r");
		try {
			const header = Buffer.alloc(MAX_CUBE_HEADER_BYTES);
			const { bytesRead } = await handle.read(
				header,
				0,
				MAX_CUBE_HEADER_BYTES,
				0
			);
			return findTextCubeSize({ text: header.toString("utf8", 0, bytesRead) });
		} finally {
			await handle.close();
		}
	} catch {
		return null;
	}
}

export async function loadTextCubeFile({
	filePath,
}: {
	filePath: string;
}): Promise<FilterLabCube | null> {
	try {
		return decodeTextCube({ text: await readFile(filePath, "utf8") });
	} catch {
		return null;
	}
}
