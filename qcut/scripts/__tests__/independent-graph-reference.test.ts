// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderStableGraphReference } from "../jianying-filter-parity/stable-reference.js";

describe("static native graph reference", () => {
	it("requires three identical samples", async () => {
		const render = vi.fn(async () => new Uint8Array([4, 8, 12, 255]));
		const result = await renderStableGraphReference({ render });
		expect(render).toHaveBeenCalledTimes(3);
		expect(new Set(result.hashes).size).toBe(1);
	});
	it("records and discards transient initialization frames", async () => {
		const render = vi.fn(async () => new Uint8Array([4, 8, 12, 255]));
		render.mockResolvedValueOnce(new Uint8Array([0, 0, 0, 255]));
		const result = await renderStableGraphReference({ render });
		expect(render).toHaveBeenCalledTimes(4);
		expect(new Set(result.hashes).size).toBe(2);
		expect(result.rgba).toEqual(new Uint8Array([4, 8, 12, 255]));
	});
	it("fails on an unstable oracle instead of choosing the nearest output", async () => {
		let value = 0;
		const render = vi.fn(async () => new Uint8Array([++value, 0, 0, 255]));
		await expect(renderStableGraphReference({ render })).rejects.toThrow(
			"Native reference did not stabilize"
		);
		expect(render).toHaveBeenCalledTimes(6);
	});
	it("rejects empty frames and propagates render failures", async () => {
		await expect(
			renderStableGraphReference({ render: async () => new Uint8Array() })
		).rejects.toThrow("Empty native reference frame");
		await expect(
			renderStableGraphReference({
				render: async () => {
					throw new Error("host unavailable");
				},
			})
		).rejects.toThrow("host unavailable");
	});
});
