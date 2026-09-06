// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createFilterLabNativeFrameRenderer,
	type FilterLabNativeRenderPlan,
} from "../native-pipeline/filters/filter-lab-native-frame-renderer.js";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";
import {
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
} from "../qcut-independent-filter/contract.js";

vi.mock("../qcut-independent-filter/session.js", async (original) => ({
	...(await original<typeof import("../qcut-independent-filter/session.js")>()),
	createIndependentFilterSession: vi.fn(),
}));
const plan: FilterLabNativeRenderPlan = {
	kind: "native",
	mode: "qcut-metal",
	lutPath: "/local/filter.png",
	evidence: {
		resourceId: QCUT_FOG_RESOURCE,
		version: QCUT_FOG_VERSION,
		title: "Fog",
		implementation: "shader",
		verification: "unverified",
		intensity: 50,
		backend: "qcut-metal",
		fidelity: "native-local",
	},
};
const render = vi.fn(async () => ({
	provider: "qcut-metal-fog-v1" as const,
	resourceId: QCUT_FOG_RESOURCE,
	width: 1,
	height: 1,
	rgba: new Uint8Array([90, 80, 70, 255]),
}));
const dispose = vi.fn(async () => {});
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createIndependentFilterSession).mockResolvedValue({
		render,
		dispose,
	});
});
function renderer({
	signal = new AbortController().signal,
}: {
	signal?: AbortSignal;
} = {}) {
	return createFilterLabNativeFrameRenderer({
		plans: [plan],
		isImage: false,
		media: { width: 1, height: 1, frameRate: 30, duration: 1, hasAudio: false },
		signal,
	});
}
describe("independent CLI frame adapter", () => {
	it("applies intensity exactly once and preserves source alpha", async () => {
		const frames = renderer();
		const rgba = await frames.renderFrame({
			rgba: Buffer.from([10, 20, 30, 128]),
			index: 1,
		});
		expect(Array.from(rgba)).toEqual([90, 80, 70, 128]);
		expect(render).toHaveBeenCalledWith(
			expect.objectContaining({ intensity: 50, version: QCUT_FOG_VERSION })
		);
		await frames.dispose();
		await frames.dispose();
		expect(dispose).toHaveBeenCalledTimes(1);
		await expect(
			frames.renderFrame({ rgba: Buffer.alloc(4), index: 2 })
		).rejects.toThrow("disposed");
	});
	it("disposes a host that finishes starting after cancellation", async () => {
		let complete: (
			value: Awaited<ReturnType<typeof createIndependentFilterSession>>
		) => void = () => {};
		vi.mocked(createIndependentFilterSession).mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			})
		);
		const controller = new AbortController();
		const frames = renderer({ signal: controller.signal });
		const frame = frames.renderFrame({ rgba: Buffer.alloc(4), index: 0 });
		controller.abort();
		await frames.dispose();
		complete({ render, dispose });
		await expect(frame).rejects.toThrow();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(render).not.toHaveBeenCalled();
	});
});
