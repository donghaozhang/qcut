// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	parseIndependentIdentity,
	selectIndependentCatalog,
	supportsIndependentLut,
} from "../qcut-independent-filter/lut-catalog.js";
import { encodeIndependentCube } from "../qcut-independent-filter/lut-data.js";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";

const card: JianyingFilterCatalogCard = {
	resourceId: "123",
	version: "a".repeat(32),
	title: "Local",
	categories: [],
	implementation: "single-lut",
	cacheStatus: "cached",
	available: true,
	verification: "verified",
	lutCount: 1,
};
const identity = { resourceId: card.resourceId, version: card.version! };
function identityCube({ size }: { size: number }) {
	const values = new Float64Array(size ** 3 * 3);
	for (let b = 0; b < size; b++)
		for (let g = 0; g < size; g++)
			for (let r = 0; r < size; r++) {
				values.set(
					[r / (size - 1), g / (size - 1), b / (size - 1)],
					((b * size + g) * size + r) * 3
				);
			}
	return { size, values };
}
describe("independent LUT eligibility and validation", () => {
	it("includes single cubes and proven tiled shaders, without inheriting old verification", () => {
		const tiled = {
			...card,
			resourceId: "456",
			implementation: "shader" as const,
			tiledRendererKind: "tiled-lut-8x8",
		};
		const result = selectIndependentCatalog({
			catalog: { count: 2, cards: [card, tiled] },
		});
		expect(result.count).toBe(3);
		expect(
			result.cards.every((entry) => entry.verification === "unverified")
		).toBe(true);
	});
	it.each([
		{ implementation: "dual-lut" },
		{ implementation: "face-ai" },
		{ implementation: "face-region-lut" },
		{ implementation: "shader", multiPassKind: "fog-lut" },
		{ requirements: ["skin_seg"] },
		{ sdkModel: "face" },
		{ available: false },
		{ version: undefined },
		{ lutCount: 2 },
		{ cacheStatus: "partial" },
	])("excludes non-independent cards: %o", (patch) => {
		expect(
			supportsIndependentLut({
				card: { ...card, ...patch } as JianyingFilterCatalogCard,
			})
		).toBe(false);
	});
	it.each([
		{ resourceId: "../123", version: "a".repeat(32) },
		{ resourceId: "123", version: "latest" },
		null,
	])("rejects invalid identities %o", (request) => {
		expect(() => parseIndependentIdentity({ request })).toThrow();
	});
	it("encodes red-fastest float32 RGBA without reordering", () => {
		const encoded = encodeIndependentCube({ cube: identityCube({ size: 2 }) });
		expect([...new Float32Array(encoded.buffer).slice(0, 8)]).toEqual([
			0, 0, 0, 1, 1, 0, 0, 1,
		]);
	});
	it("rejects incomplete cubes, unsafe sizes, non-finite data and unknown domains", () => {
		for (const cube of [
			{ size: 66, values: [] },
			{ size: 2, values: [1] },
			{ size: 2, values: new Array(24).fill(NaN) },
			{
				...identityCube({ size: 2 }),
				domainMin: [-1, 0, 0] as [number, number, number],
			},
		]) {
			expect(() => encodeIndependentCube({ cube })).toThrow();
		}
	});
});

describe.skipIf(
	process.platform !== "darwin" ||
		process.env.QCUT_INDEPENDENT_METAL_TEST !== "1"
)("real independent cube Metal", () => {
	it.each([
		2, 17, 33, 64, 65,
	])("renders identity size %i with alpha, orientation and endpoints intact", async (size) => {
		const session = await createIndependentFilterSession({
			identity,
			cube: identityCube({ size }),
		});
		try {
			const rgba = new Uint8Array(31 * 17 * 4);
			for (let index = 0; index < rgba.length; index++)
				rgba[index] = (index * 37) % 256;
			const result = await session.render({
				...identity,
				rgba,
				width: 31,
				height: 17,
				intensity: 100,
			});
			expect(result.provider).toBe("qcut-metal-lut-v1");
			expect(result.rgba).toEqual(rgba);
		} finally {
			await session.dispose();
		}
	}, 120_000);
	it("applies one strength blend and rejects another cube identity", async () => {
		const cube = identityCube({ size: 17 });
		cube.values = cube.values.map((value) => 1 - value);
		const session = await createIndependentFilterSession({ identity, cube });
		try {
			const request = {
				...identity,
				rgba: new Uint8Array([20, 90, 240, 71]),
				width: 1,
				height: 1,
				intensity: 100,
			};
			expect((await session.render(request)).rgba).toEqual(
				new Uint8Array([235, 165, 15, 71])
			);
			const half = (await session.render({ ...request, intensity: 50 })).rgba;
			expect(
				[...half.slice(0, 3)].every((value) => value >= 127 && value <= 128)
			).toBe(true);
			expect(half[3]).toBe(71);
			await expect(
				session.render({ ...request, resourceId: "999" })
			).rejects.toThrow("match");
		} finally {
			await session.dispose();
		}
	}, 120_000);
});
