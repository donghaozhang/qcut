// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSoftGlowProvider } from "../qcut-independent-filter/soft-glow-provider.js";
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
const identity = { resourceId: SOFT_GLOW_RESOURCE, version: SOFT_GLOW_VERSION };
const frame = {
	...identity,
	width: 1,
	height: 1,
	intensity: 37,
	rgba: new Uint8Array([10, 20, 30, 255]),
};
const render = vi.fn(async () => ({
	provider: "qcut-cpu-soft-glow-ui-snapshot-v1" as const,
	resourceId: SOFT_GLOW_RESOURCE,
	width: 1,
	height: 1,
	rgba: frame.rgba,
}));
const dispose = vi.fn(async () => {});
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createSoftGlowSession).mockResolvedValue({ render, dispose });
});
describe("soft glow provider lifetime", () => {
	it("loads the exact card and reuses a process across source/time changes", async () => {
		const provider = createSoftGlowProvider();
		expect((await provider.load(identity)).nativeEffect?.provider).toBe(
			"qcut-cpu-soft-glow-ui-snapshot-v1"
		);
		expect((await provider.load(identity)).presetId).toBe(
			"qcut-independent-soft-glow-ui-snapshot-v1"
		);
		await provider.render({ ...frame, sourceKey: "a", timestampSeconds: 10 });
		await provider.render({ ...frame, sourceKey: "b", timestampSeconds: 0 });
		expect(createSoftGlowSession).toHaveBeenCalledTimes(1);
		expect(resolveSoftGlowLut).toHaveBeenCalledTimes(1);
		await provider.dispose();
	});
	it("restarts only when dimensions or intensity change", async () => {
		const provider = createSoftGlowProvider();
		await provider.render(frame);
		await provider.render({ ...frame, intensity: 100 });
		await provider.render({
			...frame,
			width: 2,
			rgba: new Uint8Array(8).fill(255),
		});
		expect(createSoftGlowSession).toHaveBeenCalledTimes(3);
		expect(dispose).toHaveBeenCalledTimes(2);
		await provider.dispose();
	});
	it("evicts a failed stream instead of falling back", async () => {
		const provider = createSoftGlowProvider();
		render.mockRejectedValueOnce(new Error("broken stream"));
		await expect(provider.render(frame)).rejects.toThrow("broken stream");
		await provider.render(frame);
		expect(createSoftGlowSession).toHaveBeenCalledTimes(2);
		await provider.dispose();
	});
	it("rejects a changed version before loading local files", async () => {
		const provider = createSoftGlowProvider();
		await expect(
			provider.load({ ...identity, version: "0".repeat(32) })
		).rejects.toThrow("exact");
		expect(resolveSoftGlowLut).not.toHaveBeenCalled();
		await provider.dispose();
	});
	it("disposes a session finishing startup after provider disposal", async () => {
		let ready!: (
			session: Awaited<ReturnType<typeof createSoftGlowSession>>
		) => void;
		vi.mocked(createSoftGlowSession).mockReturnValueOnce(
			new Promise((resolve) => {
				ready = resolve;
			})
		);
		const provider = createSoftGlowProvider();
		const result = provider.render(frame).catch((error: unknown) => error);
		await vi.waitFor(() => expect(createSoftGlowSession).toHaveBeenCalled());
		const cleanup = provider.dispose();
		ready({ render, dispose });
		expect(await result).toBeInstanceOf(Error);
		await cleanup;
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(render).not.toHaveBeenCalled();
	});
});
