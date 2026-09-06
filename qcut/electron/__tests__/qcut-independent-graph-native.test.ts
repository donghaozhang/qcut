// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";
import { parseAdobeThreeDl } from "../qcut-independent-filter/adobe-three-dl.js";
import type { IndependentGraphData } from "../qcut-independent-filter/graph-data.js";
import { INDEPENDENT_GRAPH_PROFILES } from "../qcut-independent-filter/graph-profiles.js";

const cube = parseAdobeThreeDl({
	text: [
		"0 1023",
		...Array.from({ length: 8 }, (_, i) =>
			[i >> 2, (i >> 1) & 1, i & 1].map((n) => n * 4095).join(" ")
		),
	].join("\n"),
});
const base = INDEPENDENT_GRAPH_PROFILES[0];

describe.skipIf(
	process.platform !== "darwin" ||
		process.env.QCUT_INDEPENDENT_METAL_TEST !== "1"
)("real independent graph Metal", () => {
	it.each([
		false,
		true,
	])("preserves direct sampler coordinates and alpha weight=%s", async (alphaWeighted) => {
		const graph: IndependentGraphData = {
			cube,
			profile: { ...base, kind: "direct", alphaWeighted },
		};
		const session = await createIndependentFilterSession({
			graph,
			identity: base,
		});
		try {
			const rgba = new Uint8Array([64, 128, 191, 128]);
			const result = await session.render({
				...base,
				width: 1,
				height: 1,
				rgba,
				intensity: 100,
			});
			const weight = alphaWeighted ? 128 / 255 : 1;
			const expected = [64, 128, 191].map((n) =>
				Math.round(
					n + (Math.min(1, Math.max(0, (n / 255) * 2 - 0.5)) * 255 - n) * weight
				)
			);
			for (let c = 0; c < 3; c++)
				expect(Math.abs(result.rgba[c] - expected[c])).toBeLessThanOrEqual(1);
			expect(result.rgba[3]).toBe(128);
			expect(result.provider).toBe("qcut-metal-graph-v1");
		} finally {
			await session.dispose();
		}
	}, 120_000);
	it.each([
		"sharpen",
		"vignette",
		"soften",
	] as const)("handles %s source switches and zero strength", async (kind) => {
		const graph: IndependentGraphData = {
			cube,
			profile: { ...base, kind, alphaWeighted: false },
			...(kind === "vignette"
				? {
						overlay: {
							width: 1,
							height: 1,
							rgba: new Uint8Array([0, 0, 0, 64]),
						},
					}
				: {}),
		};
		const session = await createIndependentFilterSession({
			graph,
			identity: base,
		});
		try {
			const rgba = new Uint8Array(17 * 9 * 4);
			for (let i = 0; i < rgba.length; i += 4)
				rgba.set([i % 256, 128, 220, 255], i);
			const request = { ...base, width: 17, height: 9, rgba, intensity: 100 };
			const a = await session.render(request);
			expect(a.rgba).not.toEqual(rgba);
			const transparent = new Uint8Array([20, 50, 80, 0]);
			expect(
				(
					await session.render({
						...request,
						width: 1,
						height: 1,
						rgba: transparent,
						intensity: 0,
					})
				).rgba
			).toEqual(transparent);
			expect((await session.render(request)).rgba).toEqual(a.rgba);
			await expect(
				session.render({ ...request, version: "wrong" })
			).rejects.toThrow();
		} finally {
			await session.dispose();
		}
	}, 120_000);
});
