// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import { selectIndependentCatalog } from "../qcut-independent-filter/lut-catalog.js";
import { resolveIndependentFilterPlan } from "../native-pipeline/cli/cli-handlers-filter-lab-independent.js";
import { createFilterLabNativeFrameRenderer } from "../native-pipeline/filters/filter-lab-native-frame-renderer.js";
import { createSoftGlowSession } from "../qcut-independent-filter/soft-glow-session.js";
import { resolveSoftGlowLut } from "../qcut-independent-filter/soft-glow-assets.js";
import {
	SOFT_GLOW_RESOURCE,
	SOFT_GLOW_VERSION,
} from "../qcut-independent-filter/soft-glow-contract.js";

vi.mock("../qcut-independent-filter/soft-glow-assets.js", () => ({
	resolveSoftGlowLut: vi.fn(async () => new Uint8Array(512 * 512 * 4)),
}));
vi.mock("../qcut-independent-filter/soft-glow-bridge.js", () => ({
	resolveSoftGlowHost: vi.fn(async () => "/owned/helper"),
}));
vi.mock("../qcut-independent-filter/soft-glow-session.js", () => ({
	createSoftGlowSession: vi.fn(),
}));
const card: JianyingFilterCatalogCard = {
	resourceId: SOFT_GLOW_RESOURCE,
	version: SOFT_GLOW_VERSION,
	title: "电影柔光",
	categories: [],
	implementation: "shader",
	cacheStatus: "cached",
	available: false,
	verification: "verified",
	lutCount: 2,
};
const render = vi.fn(async () => ({
	provider: "qcut-cpu-soft-glow-ui-snapshot-v1" as const,
	resourceId: SOFT_GLOW_RESOURCE,
	width: 1,
	height: 1,
	rgba: new Uint8Array([90, 80, 70, 255]),
}));
const dispose = vi.fn(async () => {});
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createSoftGlowSession).mockResolvedValue({ render, dispose });
});
describe("cinematic soft glow product routing", () => {
	it("exposes only the exact cached version without inheriting native verification", () => {
		const result = selectIndependentCatalog({
			catalog: { count: 1, cards: [card] },
		});
		expect(
			result.cards.find((value) => value.resourceId === SOFT_GLOW_RESOURCE)
		).toMatchObject({
			available: true,
			verification: "unverified",
			independentKind: "cinematic-soft-glow",
		});
		for (const patch of [
			{ version: "0".repeat(32) },
			{ cacheStatus: "partial" as const },
		]) {
			const unavailable = selectIndependentCatalog({
				catalog: { count: 1, cards: [{ ...card, ...patch }] },
			});
			expect(
				unavailable.cards.some(
					(value) => value.resourceId === SOFT_GLOW_RESOURCE
				)
			).toBe(false);
		}
	});
	it.each([
		0, 37,
	])("creates a CPU export session at %s with UI snapshot intensity applied only in C++", async (intensity) => {
		const plan = await resolveIndependentFilterPlan({ card, intensity });
		if (plan.kind !== "native") throw new Error("Expected native frame plan");
		expect(plan.evidence).toMatchObject({
			backend: "qcut-cpu-soft-glow",
			verification: "unverified",
			intensity,
			intensityMode: "ui-snapshot",
		});
		expect(plan.editorColor?.multiPass?.nativeEffect?.provider).toBe(
			"qcut-cpu-soft-glow-ui-snapshot-v1"
		);
		const signal = new AbortController().signal;
		const frames = createFilterLabNativeFrameRenderer({
			plans: [plan],
			isImage: false,
			media: {
				width: 1,
				height: 1,
				frameRate: 30,
				duration: 1,
				hasAudio: false,
			},
			signal,
		});
		try {
			const first = await frames.renderFrame({
				rgba: Buffer.from([10, 20, 30, 255]),
				index: 0,
			});
			await frames.renderFrame({
				rgba: Buffer.from([40, 50, 60, 255]),
				index: 1,
			});
			expect(Array.from(first)).toEqual([90, 80, 70, 255]);
			expect(createSoftGlowSession).toHaveBeenCalledTimes(1);
			expect(createSoftGlowSession).toHaveBeenCalledWith(
				expect.objectContaining({ width: 1, height: 1, intensity, signal })
			);
			expect(render).toHaveBeenLastCalledWith(
				expect.objectContaining({
					intensity,
					timestampSeconds: 1 / 30,
					version: SOFT_GLOW_VERSION,
				})
			);
		} finally {
			await frames.dispose();
		}
		expect(dispose).toHaveBeenCalledTimes(1);
	});
	it("refuses a changed package and propagates missing LUT failures", async () => {
		await expect(
			resolveIndependentFilterPlan({
				card: { ...card, version: "0".repeat(32) },
				intensity: 100,
			})
		).rejects.toThrow("exact");
		expect(resolveSoftGlowLut).not.toHaveBeenCalled();
		vi.mocked(resolveSoftGlowLut).mockRejectedValueOnce(
			new Error("missing verified LUT")
		);
		await expect(
			resolveIndependentFilterPlan({ card, intensity: 100 })
		).rejects.toThrow("missing verified LUT");
	});
});
