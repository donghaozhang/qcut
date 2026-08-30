// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { disposeHost, resolveHost, startHost } = vi.hoisted(() => ({
	disposeHost: vi.fn(),
	resolveHost: vi.fn(),
	startHost: vi.fn(),
}));

vi.mock("../jianying-portrait-adjustment-runtime/bridge-resolver.js", () => ({
	resolveJianyingPortraitAdjustmentHost: resolveHost,
}));

vi.mock("../jianying-portrait-adjustment-runtime/host-process.js", () => ({
	startJianyingPortraitHostProcess: startHost,
}));

import { resolveJianyingFilterSwingCompatibility } from "../jianying-filter-swing-runtime/compatibility.js";
import { createJianyingFilterSwingRenderSession } from "../jianying-filter-swing-runtime/render.js";

const SILKY_SKIN_ID = "7495673180904885516";
const SILKY_SKIN_VERSION = "c88f3eddf7620d4e0644075efcafd101";

function runtime() {
	return {
		status: {
			state: "ready" as const,
			message: "ready",
			provider: "jianying-local-effect-v1" as const,
			platform: "darwin",
			bridgeReady: true,
			runtimeReady: true,
			modelReady: true,
		},
		bridgePath: "/runtime/bridge",
		effectLibraryPath: "/runtime/Frameworks/libcccreator.dylib",
		frameworkDirectory: "/runtime/Frameworks",
		modelDirectory: "/runtime/Models",
	};
}

function sessionOptions({
	resourceId = SILKY_SKIN_ID,
	version = SILKY_SKIN_VERSION,
	intensity = 100,
}: {
	resourceId?: string;
	version?: string;
	intensity?: number;
} = {}) {
	return {
		resourceId,
		packagePath: `/runtime/Cache/artistEffect/${resourceId}/${version}`,
		width: 1,
		height: 1,
		runtime: runtime(),
		intensity,
	};
}

describe("Jianying Swing compatibility fallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveHost.mockResolvedValue("/runtime/host");
		disposeHost.mockResolvedValue(undefined);
		startHost.mockResolvedValue({
			pid: 42,
			render: vi.fn(),
			stroke: vi.fn(),
			detect: vi.fn(),
			dispose: disposeHost,
		});
	});

	it("matches only the measured resource and package version", () => {
		expect(
			resolveJianyingFilterSwingCompatibility({
				resourceId: SILKY_SKIN_ID,
				version: SILKY_SKIN_VERSION,
			})
		).toEqual({
			mode: "passthrough",
			reason: "missing-structxt-creator",
		});
		expect(
			resolveJianyingFilterSwingCompatibility({
				resourceId: SILKY_SKIN_ID,
				version: "different-version",
			})
		).toBeNull();
	});

	it("preserves the source without launching the broken native graph", async () => {
		const session = await createJianyingFilterSwingRenderSession(
			sessionOptions()
		);
		const input = new Uint8Array([10, 20, 30, 255]);
		const result = await session.render({ rgba: input });

		expect(session.processId).toBeNull();
		expect(result.rgba).toEqual(input);
		expect(result.rgba).not.toBe(input);
		expect(resolveHost).not.toHaveBeenCalled();
		expect(startHost).not.toHaveBeenCalled();

		await session.dispose();
		await expect(session.render({ rgba: input })).rejects.toThrow("closed");
	});

	it("keeps unrelated versions on the native host path", async () => {
		const session = await createJianyingFilterSwingRenderSession(
			sessionOptions({ version: "different-version" })
		);

		expect(session.processId).toBe(42);
		expect(resolveHost).toHaveBeenCalledOnce();
		expect(startHost).toHaveBeenCalledOnce();
		await session.dispose();
		expect(disposeHost).toHaveBeenCalledOnce();
	});
});
