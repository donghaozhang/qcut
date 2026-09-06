// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";
import {
	encodeIndependentGraph,
	supportsIndependentGraph,
} from "../qcut-independent-filter/graph-data.js";
import { HYBRID_DUAL_PROFILES } from "../qcut-independent-filter/graph-profiles-dual.js";
import { selectIndependentCatalog } from "../qcut-independent-filter/lut-catalog.js";

const base = HYBRID_DUAL_PROFILES[0];
const cube = {
	size: 2,
	domainMin: [0, 0, 0] as [number, number, number],
	domainMax: [1, 1, 1] as [number, number, number],
	values: new Float32Array(24),
};
const skinCube = { ...cube, values: new Float32Array(24).fill(1) };
describe("hybrid dual catalog", () => {
	it("pins 117 variants, exposes model dependency and never inherits verified", () => {
		expect(HYBRID_DUAL_PROFILES).toHaveLength(117);
		const cards = HYBRID_DUAL_PROFILES.map((p) => ({
			...p,
			available: true,
			cacheStatus: "cached" as const,
			categories: [],
			implementation: "dual-lut" as const,
			verification: "verified" as const,
			lutCount: 2,
			requirements: ["skin_seg"],
		}));
		const listed = selectIndependentCatalog({
			catalog: { cards, count: cards.length },
		});
		for (const card of listed.cards.filter(
			(c) => c.independentKind === "skin-dual-lut"
		)) {
			expect(card.maskProvider).toBe("jianying-local-skin-v1");
			expect(card.verification).toBe("unverified");
		}
		expect(listed.count).toBe(118);
		expect(
			supportsIndependentGraph({
				card: { ...cards[0], version: "0".repeat(32) },
			})
		).toBe(false);
		expect(
			supportsIndependentGraph({
				card: { ...cards[0], requirements: ["matting"] },
			})
		).toBe(false);
	});
	it("keeps gray-frame parity failures out of the catalog", () => {
		for (const id of [
			"7131290518838938887",
			"7127655008715230495",
			"7127675183246200072",
		])
			expect(
				HYBRID_DUAL_PROFILES.some((profile) => profile.resourceId === id)
			).toBe(false);
	});
	it("encodes separate LUTs and rejects invalid strengths", () => {
		const graph = { profile: base, cube, skinCube };
		expect(encodeIndependentGraph({ graph }).readUInt32LE(0)).toBe(11);
		expect(() =>
			encodeIndependentGraph({ graph: { ...graph, skinCube: undefined } })
		).toThrow("both cubes");
		expect(() =>
			encodeIndependentGraph({
				graph: {
					...graph,
					profile: {
						...base,
						dualLut: { ...base.dualLut!, skinStrength: NaN },
					},
				},
			})
		).toThrow("configuration");
	});
	it.each([
		["vf", 0],
		["adobe-3dl", 0],
		["tiled", 1],
		["tiled-floor", 2],
	] as const)("keeps %s texture coordinate semantics", (format, sampling) => {
		const profile = {
			...base,
			dualLut: { ...base.dualLut!, format },
		};
		const bytes = encodeIndependentGraph({
			graph: { profile, cube, skinCube },
		});
		expect(bytes.readUInt32LE(24 + 8 * 16 + 8)).toBe(sampling);
	});
	it("encodes independent dimensions without resampling either cube", () => {
		const largerSkin = { ...skinCube, size: 3, values: new Float32Array(81) };
		const bytes = encodeIndependentGraph({
			graph: { profile: base, cube, skinCube: largerSkin },
		});
		expect(bytes.readUInt32LE(24 + 8 * 16 + 20)).toBe(3);
		expect(bytes.length).toBe(24 + 8 * 16 + 24 + 27 * 16);
		expect(() =>
			encodeIndependentGraph({
				graph: {
					profile: base,
					cube,
					skinCube: { ...largerSkin, size: 66 },
				},
			})
		).toThrow("2-65");
	});
});
describe.skipIf(
	process.platform !== "darwin" ||
		process.env.QCUT_INDEPENDENT_METAL_TEST !== "1"
)("real hybrid Metal composition", () => {
	it.each([
		3, 64,
	])("samples a %i-level skin cube independently of the background", async (size) => {
		const identitySkin = {
			...skinCube,
			size,
			values: Float32Array.from({ length: size ** 3 * 3 }, (_, i) => {
				const pixel = Math.floor(i / 3);
				return (Math.floor(pixel / size ** (i % 3)) % size) / (size - 1);
			}),
		};
		const profile = {
			...base,
			alphaWeighted: false,
			dualLut: {
				...base.dualLut!,
				format: "tiled" as const,
				backgroundStrength: 1,
				skinStrength: 1,
				clampAlpha: false,
			},
		};
		const session = await createIndependentFilterSession({
			identity: base,
			graph: { profile, cube, skinCube: identitySkin },
			maskSource: {
				render: async () => ({
					width: 2,
					height: 1,
					bytes: new Uint8Array([0, 255]),
					orientation: "bottom-left",
				}),
				dispose: async () => {},
			},
		});
		try {
			const rgba = new Uint8Array([40, 90, 160, 255, 40, 90, 160, 255]);
			const result = await session.render({
				...base,
				width: 2,
				height: 1,
				rgba,
				intensity: 100,
			});
			expect(result.rgba).toEqual(
				new Uint8Array([0, 0, 0, 255, 40, 90, 160, 255])
			);
		} finally {
			await session.dispose();
		}
	}, 120_000);
	it.each([
		"vf",
		"adobe-3dl",
		"tiled",
		"tiled-floor",
	] as const)("composes %s with mask orientation, strength and alpha", async (format) => {
		const profile = {
			...base,
			alphaWeighted: format !== "tiled",
			dualLut: {
				...base.dualLut!,
				format,
				backgroundStrength: 1,
				skinStrength: 1,
				clampAlpha: format === "tiled",
			},
		};
		const mask = {
			width: 1,
			height: 2,
			orientation: "bottom-left" as const,
			bytes: new Uint8Array([0, 255]),
		};
		const renderMask = vi.fn(async () => mask);
		const session = await createIndependentFilterSession({
			graph: { profile, cube, skinCube },
			identity: base,
			maskSource: { render: renderMask, dispose: async () => {} },
		});
		try {
			const rgba = new Uint8Array([80, 80, 80, 128, 80, 80, 80, 128]);
			const request = { ...base, width: 1, height: 2, rgba, intensity: 0 };
			expect((await session.render(request)).rgba).toEqual(rgba);
			expect(renderMask).not.toHaveBeenCalled();
			const result = await session.render({ ...request, intensity: 100 });
			const weight = format === "tiled" ? 1 : 128 / 255;
			const top =
				format === "tiled" ? 128 : Math.round(80 + (255 - 80) * weight);
			const bottom = Math.round(80 * (1 - weight));
			expect(Math.abs(result.rgba[0] - top)).toBeLessThanOrEqual(1);
			expect(Math.abs(result.rgba[4] - bottom)).toBeLessThanOrEqual(1);
			expect(result.rgba[3]).toBe(128);
			expect(result.rgba[7]).toBe(128);
			expect(result.maskProvider).toBe("jianying-local-skin-v1");
		} finally {
			await session.dispose();
		}
	}, 120_000);
	it("rejects missing masks rather than returning native RGB or passthrough", async () => {
		const session = await createIndependentFilterSession({
			graph: { profile: base, cube, skinCube },
			identity: base,
			maskSource: {
				render: async () => {
					throw new Error("no mask");
				},
				dispose: async () => {},
			},
		});
		try {
			await expect(
				session.render({
					...base,
					width: 1,
					height: 1,
					rgba: new Uint8Array([60, 70, 80, 255]),
					intensity: 100,
				})
			).rejects.toThrow("no mask");
		} finally {
			await session.dispose();
		}
	}, 120_000);
});
