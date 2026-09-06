// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as bridge from "../qcut-independent-filter/bridge.js";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";
import { encodeIndependentGraph } from "../qcut-independent-filter/graph-data.js";
import { HYBRID_DUAL_PROFILES } from "../qcut-independent-filter/graph-profiles-dual.js";
import type { IndependentGraphProfile } from "../qcut-independent-filter/graph-profiles.js";

const profile = HYBRID_DUAL_PROFILES.find((p) => p.dualLut?.sharpen)!;
const cube = {
	size: 2,
	domainMin: [0, 0, 0] as [number, number, number],
	domainMax: [1, 1, 1] as [number, number, number],
	values: Float32Array.from(
		Array.from({ length: 8 }, (_, i) => [
			i & 1,
			(i >> 1) & 1,
			(i >> 2) & 1,
		]).flat()
	),
};

describe("hybrid sharpen protocol", () => {
	it("pins 31 two-pass cards and serializes bounded sharpness", () => {
		expect(HYBRID_DUAL_PROFILES.filter((p) => p.dualLut?.sharpen)).toHaveLength(
			31
		);
		const graph = { profile, cube, skinCube: cube };
		const encoded = encodeIndependentGraph({ graph });
		expect(encoded.length).toBe(24 + 2 * 8 * 16 + 24);
		expect(encoded.readFloatLE(24 + 8 * 16 + 16)).toBeCloseTo(0.6);
		expect(encoded.readUInt32LE(24 + 8 * 16 + 20)).toBe(2);
		for (const sharpen of [-1, 1.01, NaN, Infinity]) {
			expect(() =>
				encodeIndependentGraph({
					graph: {
						...graph,
						profile: { ...profile, dualLut: { ...profile.dualLut!, sharpen } },
					},
				})
			).toThrow("configuration");
		}
	});
});

describe.skipIf(
	process.platform !== "darwin" ||
		process.env.QCUT_INDEPENDENT_METAL_TEST !== "1"
)("real hybrid sharpen frames", () => {
	it("rejects a stale dual LUT host before reading any frame", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-stale-metal-"));
		const file = join(root, "old-host");
		await writeFile(
			file,
			"#!/bin/sh\nprintf '\\061\\115\\106\\121'\ncat >/dev/null\n"
		);
		await chmod(file, 0o700);
		const resolver = vi
			.spyOn(bridge, "resolveIndependentFilterHost")
			.mockResolvedValue(file);
		try {
			await expect(
				createIndependentFilterSession({
					identity: profile,
					graph: { profile, cube, skinCube: cube },
				})
			).rejects.toThrow("Unsupported Metal host protocol");
		} finally {
			resolver.mockRestore();
			await rm(root, { recursive: true, force: true });
		}
	});
	it("matches the established two-pass RGBA8 sharpen graph across strengths, alpha and resize", async () => {
		const baseline: IndependentGraphProfile = {
			...profile,
			kind: "mask-invariant-sharpen",
			dualLut: undefined,
			maskInvariant: "tiled",
			alphaWeighted: false,
		};
		const reference = await createIndependentFilterSession({
			identity: profile,
			graph: { profile: baseline, cube },
		});
		const hybrid = await createIndependentFilterSession({
			identity: profile,
			graph: { profile, cube, skinCube: cube },
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
			for (const [width, height] of [
				[8, 5],
				[13, 7],
			]) {
				const rgba = Uint8Array.from({ length: width * height * 4 }, (_, i) =>
					i % 4 === 3
						? Math.floor(i / 4) % 3 === 0
							? 128
							: 255
						: (Math.floor(i / 4) * 31 + (i % 4) * 9) % 120
				);
				for (const intensity of [0, 37, 100]) {
					const request = { ...profile, width, height, rgba, intensity };
					const a = await reference.render(request);
					const b = await hybrid.render(request);
					expect(b.rgba).toEqual(a.rgba);
					if (intensity === 0) expect(b.rgba).toEqual(rgba);
					else expect(b.rgba).not.toEqual(rgba);
					for (let i = 3; i < rgba.length; i += 4)
						expect(b.rgba[i]).toBe(rgba[i]);
				}
			}
		} finally {
			await Promise.all([reference.dispose(), hybrid.dispose()]);
		}
	}, 120_000);
});
