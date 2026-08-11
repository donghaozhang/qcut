import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	classifyJianyingLutRole,
	compareCubes,
	createJianyingLutId,
	decodeVfCube,
	gridColours,
	listJianyingLutReferences,
	loadJianyingLut,
	sampleCube,
	type FilterLabCube,
} from "../native-pipeline/filters/filter-lab-lut";

/** Builds a `.vf` buffer the way Jianying writes one. */
function encodeVf({
	size,
	values,
}: {
	size: number;
	values: number[];
}): Buffer {
	const header = Buffer.alloc(10);
	header.write("VF_V", 0, "ascii");
	header.writeUInt16LE(size, 4);
	header.writeUInt16LE(size, 6);
	header.writeUInt16LE(size, 8);
	const body = Buffer.alloc(values.length * 4);
	for (const [index, value] of values.entries()) {
		body.writeFloatLE(value, index * 4);
	}
	return Buffer.concat([header, body]);
}

function identityCube({ size }: { size: number }): FilterLabCube {
	const values = new Float64Array(size * size * size * 3);
	let index = 0;
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				values[index] = red / (size - 1);
				values[index + 1] = green / (size - 1);
				values[index + 2] = blue / (size - 1);
				index += 3;
			}
		}
	}
	return { size, values };
}

describe("filter lab LUT decoding", () => {
	it("decodes a VF cube and preserves the red-fastest ordering", () => {
		const size = 2;
		const cube = identityCube({ size });
		const decoded = decodeVfCube({
			data: encodeVf({ size, values: Array.from(cube.values) }),
		});
		expect(decoded).not.toBeNull();
		expect(decoded?.size).toBe(size);
		// Corner at red=1, green=0, blue=0 must come back as pure red.
		expect(sampleCube({ cube: decoded!, red: 1, green: 0, blue: 0 })).toEqual([
			1, 0, 0,
		]);
	});

	it("rejects buffers that are not a cube of the declared size", () => {
		const truncated = encodeVf({ size: 2, values: new Array(12).fill(0) });
		expect(decodeVfCube({ data: truncated })).toBeNull();
		expect(decodeVfCube({ data: Buffer.from("nope") })).toBeNull();
	});

	it("scores an identity cube against itself as zero", () => {
		const cube = identityCube({ size: 5 });
		const distance = compareCubes({
			left: cube,
			right: cube,
			colours: gridColours({ steps: 6 }),
		});
		expect(distance.rmse).toBeCloseTo(0, 10);
		expect(distance.maxDelta).toBeCloseTo(0, 10);
	});

	it("clamps samples to the cube domain", () => {
		const cube = identityCube({ size: 4 });
		expect(sampleCube({ cube, red: -2, green: 0.5, blue: 3 })).toEqual([
			0, 0.5, 1,
		]);
	});

	it("reports a known offset in 0-255 channel levels", () => {
		const base = identityCube({ size: 5 });
		const lifted: FilterLabCube = {
			size: base.size,
			// +0.1 on every channel is 25.5 levels, and clamping at the top of the
			// cube is what keeps maxDelta at exactly that rather than above it.
			values: base.values.map((value) => Math.min(1, value + 0.1)),
		};
		const distance = compareCubes({
			left: base,
			right: lifted,
			colours: gridColours({ steps: 5 }),
		});
		expect(distance.maxDelta).toBeCloseTo(25.5, 4);
		expect(distance.rmse).toBeGreaterThan(0);
		expect(distance.rmse).toBeLessThanOrEqual(25.5);
	});

	it("gives every cached version and LUT role an exact identity", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-filter-lab-"));
		const resourceId = "7127561047048850718";
		const versions = ["version-a", "version-b"];
		try {
			const writes = versions.flatMap((version) =>
				["filter_bg.3dl.vf", "filter_skin.3dl.vf"].map(async (fileName) => {
					const directory = join(
						root,
						resourceId,
						version,
						"AmazingFeature",
						"texture"
					);
					await mkdir(directory, { recursive: true });
					await writeFile(
						join(directory, fileName),
						encodeVf({
							size: 2,
							values: Array.from(identityCube({ size: 2 }).values),
						})
					);
				})
			);
			await Promise.all(writes);

			const references = await listJianyingLutReferences({ root });
			expect(references).toHaveLength(4);
			expect(new Set(references.map(({ lutId }) => lutId)).size).toBe(4);
			expect(references.map(({ role }) => role)).toEqual([
				"background",
				"skin",
				"background",
				"skin",
			]);
			expect(references[0]?.lutId).toBe(
				createJianyingLutId({
					resourceId,
					version: "version-a",
					fileName: "filter_bg.3dl.vf",
				})
			);
			const loaded = await loadJianyingLut({ reference: references[0]! });
			expect(loaded?.cube.size).toBe(2);
			expect(loaded?.cube.values).toHaveLength(24);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("classifies generic, background, and skin files without guessing", () => {
		expect(classifyJianyingLutRole({ fileName: "filter.cube.vf" })).toBe(
			"single"
		);
		expect(classifyJianyingLutRole({ fileName: "filter_BG.3dl.vf" })).toBe(
			"background"
		);
		expect(classifyJianyingLutRole({ fileName: "filter_skin.3dl.vf" })).toBe(
			"skin"
		);
	});
});
