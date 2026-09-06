// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIndependentLutProvider } from "../qcut-independent-filter/lut-provider.js";
import type { IndependentFilterRequest } from "../qcut-independent-filter/contract.js";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";
import { loadIndependentCube } from "../qcut-independent-filter/lut-catalog.js";

vi.mock("../qcut-independent-filter/lut-catalog.js", async (original) => ({
	...(await original<
		typeof import("../qcut-independent-filter/lut-catalog.js")
	>()),
	listIndependentFilters: vi.fn(async () => ({
		count: 5,
		cards: Array.from({ length: 5 }, (_, index) => ({
			resourceId: String(index + 1),
			version: "a".repeat(32),
			title: `Card ${index}`,
		})),
	})),
	loadIndependentCube: vi.fn(async () => ({
		size: 2,
		values: new Float64Array(24),
	})),
}));
vi.mock("../qcut-independent-filter/session.js", () => ({
	createIndependentFilterSession: vi.fn(),
}));
const dispose = vi.fn(async () => {});
const render = vi.fn(async (request: IndependentFilterRequest) => ({
	...request,
	provider: "qcut-metal-lut-v1" as const,
}));
const identity = { resourceId: "1", version: "a".repeat(32) };
beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	vi.mocked(createIndependentFilterSession).mockResolvedValue({
		render,
		dispose,
	});
});
afterEach(() => {
	vi.useRealTimers();
});

describe("independent LUT provider LRU and lifecycle", () => {
	it("reuses a loaded card and releases idle hosts", async () => {
		const provider = createIndependentLutProvider();
		await provider.load(identity);
		await provider.load(identity);
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(dispose).toHaveBeenCalledTimes(1);
		await provider.dispose();
	});
	it("bounds resident hosts and evicts the least recently used card", async () => {
		const provider = createIndependentLutProvider();
		await Promise.all(
			["1", "2", "3", "4"].map((resourceId) =>
				provider.load({ ...identity, resourceId })
			)
		);
		await provider.load(identity);
		await provider.load({ ...identity, resourceId: "5" });
		expect(dispose).toHaveBeenCalledTimes(1);
		await provider.load(identity);
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(5);
		await provider.load({ ...identity, resourceId: "2" });
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(6);
		await provider.dispose();
		expect(dispose).toHaveBeenCalledTimes(6);
	});
	it("rejects unknown versions before creating a host", async () => {
		const provider = createIndependentLutProvider();
		await expect(
			provider.load({ ...identity, version: "b".repeat(32) })
		).rejects.toThrow("unavailable");
		expect(createIndependentFilterSession).not.toHaveBeenCalled();
		await provider.dispose();
	});
	it("snapshots identities and frame bytes before queueing", async () => {
		const provider = createIndependentLutProvider();
		const input = { ...identity };
		const loaded = provider.load(input);
		input.resourceId = "2";
		expect((await loaded).resourceId).toBe("1");
		const request = {
			...identity,
			rgba: new Uint8Array([1, 2, 3, 255]),
			width: 1,
			height: 1,
			intensity: 70,
		};
		const frame = provider.render(request);
		request.rgba.fill(0);
		request.width = 2;
		expect((await frame).rgba).toEqual(new Uint8Array([1, 2, 3, 255]));
		expect(render.mock.calls[0][0].width).toBe(1);
		await provider.dispose();
	});
	it("propagates loading failure and recovers without poisoning the queue", async () => {
		const provider = createIndependentLutProvider();
		vi.mocked(loadIndependentCube).mockRejectedValueOnce(
			new Error("LUT missing")
		);
		await expect(provider.load(identity)).rejects.toThrow("LUT missing");
		await provider.load(identity);
		await provider.dispose();
		await expect(provider.load(identity)).rejects.toThrow("disposed");
	});
	it("caps queued requests and disposes a host finishing startup after shutdown", async () => {
		let finish: (value: {
			render: typeof render;
			dispose: typeof dispose;
		}) => void = () => {};
		vi.mocked(createIndependentFilterSession).mockReturnValueOnce(
			new Promise((resolve) => {
				finish = resolve;
			})
		);
		const provider = createIndependentLutProvider();
		const pending = Array.from({ length: 8 }, () => provider.load(identity));
		const settled = Promise.allSettled(pending);
		await expect(provider.load(identity)).rejects.toThrow("busy");
		await vi.advanceTimersByTimeAsync(0);
		const closing = provider.dispose();
		finish({ render, dispose });
		await closing;
		expect((await settled).every((entry) => entry.status === "rejected")).toBe(
			true
		);
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
