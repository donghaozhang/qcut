import type { IndependentCube } from "./lut-data.js";

/** Indexed Adobe and explicit 3DMESH dialects, with B advancing fastest. */
export function parseAdobeThreeDl({ text }: { text: string }): IndependentCube {
	if (text.length > 16 * 1024 * 1024)
		throw new Error("3DL file exceeds size limit.");
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/#.*$/, "").trim())
		.filter(Boolean);
	const mesh = lines[0] === "3DMESH";
	let outputMax = 4095;
	let meshSize: number | undefined;
	if (mesh) {
		lines.shift();
		const header = /^Mesh (\d+) (\d+)$/.exec(lines.shift() ?? "");
		if (
			!header ||
			![4, 5, 6].includes(Number(header[1])) ||
			![10, 12, 16].includes(Number(header[2]))
		)
			throw new Error("Unsupported 3DMESH precision.");
		meshSize = 2 ** Number(header[1]) + 1;
		outputMax = 2 ** Number(header[2]) - 1;
	}
	const knots = lines.shift()?.split(/\s+/).map(Number) ?? [];
	const size = knots.length;
	if (
		size < 2 ||
		size > 65 ||
		(mesh && size !== meshSize) ||
		knots.some(
			(n, i) =>
				!Number.isInteger(n) ||
				n !==
					(mesh
						? Math.min(1023, (i * 1024) / (size - 1))
						: Math.round((i * 1023) / (size - 1)))
		)
	)
		throw new Error("Unsupported Adobe 3DL input grid.");
	if (lines.length !== size ** 3) throw new Error("Incomplete Adobe 3DL grid.");
	const values = new Float32Array(size ** 3 * 3);
	for (const [index, line] of lines.entries()) {
		const row = line.split(/\s+/).map(Number);
		if (
			row.length !== 3 ||
			row.some((n) => !Number.isInteger(n) || n < 0 || n > outputMax)
		)
			throw new Error("Invalid 3DL output row.");
		const b = index % size;
		const g = Math.floor(index / size) % size;
		const r = Math.floor(index / (size * size));
		values.set(
			row.map((n) => n / outputMax),
			((b * size + g) * size + r) * 3
		);
	}
	return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], values };
}
