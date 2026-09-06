// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	createLocalSkinMaskSource,
	encodeSkinMask,
	type SkinMaskFrame,
} from "../qcut-independent-filter/skin-mask-source.js";
import { HYBRID_DUAL_PROFILES } from "../qcut-independent-filter/graph-profiles-dual.js";
import type { JianyingFilterLocalRuntimeInspection } from "../jianying-filter-local-runtime/runtime-discovery.js";

const mask: SkinMaskFrame = {
	width: 2,
	height: 2,
	orientation: "bottom-left",
	bytes: new Uint8Array([0, 64, 128, 255]),
};
const request = {
	...HYBRID_DUAL_PROFILES[0],
	rgba: new Uint8Array([70, 100, 120, 255]),
	width: 1,
	height: 1,
	intensity: 100,
	timestampSeconds: 1,
	sourceKey: "a",
};
function setup() {
	const render = vi.fn(async () => ({
		provider: "jianying-local-effect-v1" as const,
		resourceId: request.resourceId,
		width: 1,
		height: 1,
		rgba: new Uint8Array(4),
		mask,
	}));
	const dispose = vi.fn(async () => {});
	const createSession = vi.fn(async () => ({ processId: 42, render, dispose }));
	const source = createLocalSkinMaskSource({
		profile: HYBRID_DUAL_PROFILES[0],
		createSession,
		inspectRuntime: vi.fn(
			async () => ({}) as JianyingFilterLocalRuntimeInspection
		),
		resolvePackage: vi.fn(async () => "/private/verified-package"),
	});
	return { source, render, dispose, createSession };
}
describe("retained local skin model boundary", () => {
	it("normalizes orientation without mutating the caller", () => {
		expect([...encodeSkinMask({ mask }).subarray(8)]).toEqual([
			0, 64, 128, 255,
		]);
		expect([
			...encodeSkinMask({
				mask: { ...mask, orientation: "top-left" },
			}).subarray(8),
		]).toEqual([128, 255, 0, 64]);
		expect([...mask.bytes]).toEqual([0, 64, 128, 255]);
	});
	it("rejects malformed or oversized masks", () => {
		for (const patch of [
			{ width: 0 },
			{ width: 2049 },
			{ height: 1.5 },
			{ bytes: new Uint8Array(3) },
			{ orientation: "unknown" },
		])
			expect(() =>
				encodeSkinMask({ mask: { ...mask, ...patch } as SkinMaskFrame })
			).toThrow("Invalid local skin mask");
	});
	it("caches only the exact frame and copies returned mask bytes", async () => {
		const { source, render, createSession } = setup();
		const first = await source.render(request);
		first.bytes.fill(9);
		expect([
			...(await source.render({ ...request, intensity: 37 })).bytes,
		]).toEqual([...mask.bytes]);
		expect(render).toHaveBeenCalledTimes(1);
		await source.render({ ...request, timestampSeconds: 2 });
		expect(render).toHaveBeenCalledTimes(2);
		expect(createSession).toHaveBeenCalledTimes(1);
		await source.dispose();
	});
	it.each([
		"source",
		"backward",
		"same-time-content",
		"dimensions",
	])("restarts model history on %s", async (change) => {
		const { source, createSession, dispose } = setup();
		await source.render(request);
		const next = { ...request };
		if (change === "source") next.sourceKey = "b";
		if (change === "backward") next.timestampSeconds = 0;
		if (change === "same-time-content")
			next.rgba = new Uint8Array([80, 90, 100, 255]);
		if (change === "dimensions") {
			next.width = 2;
			next.rgba = new Uint8Array(8);
		}
		await source.render(next);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(createSession).toHaveBeenCalledTimes(2);
		await source.dispose();
	});
	it("fails closed and retries a fresh model after inference errors", async () => {
		const { source, render, createSession, dispose } = setup();
		render.mockRejectedValueOnce(new Error("model missing"));
		await expect(source.render(request)).rejects.toThrow("model missing");
		expect(dispose).toHaveBeenCalledTimes(1);
		await source.render(request);
		expect(createSession).toHaveBeenCalledTimes(2);
		await source.dispose();
		await expect(source.render(request)).rejects.toThrow("disposed");
	});
});
