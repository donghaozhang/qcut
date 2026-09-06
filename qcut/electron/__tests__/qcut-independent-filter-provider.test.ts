// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIndependentFilterProvider } from "../qcut-independent-filter/provider.js";
import {
	createIndependentFilterSession,
	createIndependentFrameRequest,
} from "../qcut-independent-filter/session.js";

vi.mock("../qcut-independent-filter/assets.js", () => ({
	resolveIndependentFogLut: vi.fn(async () => "/local/filter.png"),
}));
vi.mock("../qcut-independent-filter/session.js", async (original) => ({
	...(await original<typeof import("../qcut-independent-filter/session.js")>()),
	createIndependentFilterSession: vi.fn(),
}));

const request = createIndependentFrameRequest({
	rgba: new Uint8Array(4),
	width: 1,
	height: 1,
	intensity: 50,
});
const result = {
	provider: "qcut-metal-fog-v1" as const,
	resourceId: request.resourceId,
	width: 1,
	height: 1,
	rgba: request.rgba,
};
const render = vi.fn(async () => result);
const dispose = vi.fn(async () => {});
beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	render.mockResolvedValue(result);
	vi.mocked(createIndependentFilterSession).mockResolvedValue({
		render,
		dispose,
	});
});
afterEach(() => {
	vi.useRealTimers();
});

describe("independent preview provider lifecycle", () => {
	it("shares one host across frames and releases it after idle", async () => {
		const provider = createIndependentFilterProvider();
		await provider.load();
		await provider.render(request);
		await provider.render(request);
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(dispose).toHaveBeenCalledTimes(1);
		await provider.load();
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(2);
		await provider.dispose();
	});
	it("does not idle-kill a render in flight", async () => {
		let complete: (value: typeof result) => void = () => {};
		render.mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			})
		);
		const provider = createIndependentFilterProvider();
		await provider.load();
		const frame = provider.render(request);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(dispose).not.toHaveBeenCalled();
		complete(result);
		await frame;
		await provider.dispose();
	});
	it("restarts after a failed stream and propagates the failure", async () => {
		const provider = createIndependentFilterProvider();
		render.mockRejectedValueOnce(new Error("GPU failed"));
		await expect(provider.render(request)).rejects.toThrow("GPU failed");
		expect(dispose).toHaveBeenCalledTimes(1);
		await provider.render(request);
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(2);
		await provider.dispose();
		await expect(provider.load()).rejects.toThrow("disposed");
	});
	it("bounds the queue without creating extra hosts", async () => {
		let complete: (value: typeof result) => void = () => {};
		render.mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			})
		);
		const provider = createIndependentFilterProvider();
		await provider.load();
		const pending = Array.from({ length: 8 }, () => provider.render(request));
		await expect(provider.render(request)).rejects.toThrow("busy");
		complete(result);
		await Promise.all(pending);
		expect(createIndependentFilterSession).toHaveBeenCalledTimes(1);
		await provider.dispose();
	});
});
