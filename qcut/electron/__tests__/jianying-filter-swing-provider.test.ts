// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSession, disposeSession, inspectRuntime, sessionRender } =
	vi.hoisted(() => ({
		createSession: vi.fn(),
		disposeSession: vi.fn(),
		inspectRuntime: vi.fn(),
		sessionRender: vi.fn(),
	}));

vi.mock("../jianying-filter-local-runtime/runtime-discovery.js", () => ({
	inspectJianyingFilterLocalRuntime: inspectRuntime,
}));

vi.mock("../jianying-filter-swing-runtime/render.js", () => ({
	createJianyingFilterSwingRenderSession: createSession,
}));

import { createJianyingFilterSwingProvider } from "../jianying-filter-swing-runtime/provider.js";

function request({
	height = 1,
	intensity = 75,
	sourceKey,
	timestampSeconds,
	value = 10,
	width = 1,
}: {
	height?: number;
	intensity?: number;
	sourceKey?: string;
	timestampSeconds?: number;
	value?: number;
	width?: number;
} = {}) {
	return {
		resourceId: "7451897248885099795",
		packagePath: "/private/local/swing-package",
		width,
		height,
		rgba: new Uint8Array(width * height * 4).fill(value),
		intensity,
		...(sourceKey ? { sourceKey } : {}),
		...(timestampSeconds === undefined ? {} : { timestampSeconds }),
	};
}

function result() {
	return {
		provider: "jianying-local-effect-v1" as const,
		resourceId: "7451897248885099795",
		width: 1,
		height: 1,
		rgba: new Uint8Array([40, 50, 60, 255]),
	};
}

describe("Jianying filter Swing provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		inspectRuntime.mockResolvedValue({ status: { state: "ready" } });
		sessionRender.mockResolvedValue(result());
		disposeSession.mockResolvedValue(undefined);
		createSession.mockImplementation(async () => ({
			processId: 100,
			render: sessionRender,
			dispose: disposeSession,
		}));
	});

	it("deduplicates an active frame and caches its result", async () => {
		const provider = createJianyingFilterSwingProvider();
		const first = provider.renderEffect(request());
		const second = provider.renderEffect(request());
		await expect(first).resolves.toEqual(result());
		await expect(second).resolves.toEqual(result());
		await expect(provider.renderEffect(request())).resolves.toEqual(result());
		expect(createSession).toHaveBeenCalledOnce();
		expect(sessionRender).toHaveBeenCalledOnce();
	});

	it("rejects a competing frame instead of growing a render queue", async () => {
		let finish: ((value: ReturnType<typeof result>) => void) | undefined;
		sessionRender.mockImplementation(
			() =>
				new Promise<ReturnType<typeof result>>((resolve) => {
					finish = resolve;
				})
		);
		const provider = createJianyingFilterSwingProvider();
		const active = provider.renderEffect(request());
		await expect(provider.renderEffect(request({ value: 11 }))).rejects.toThrow(
			"processing another frame"
		);
		finish?.(result());
		await expect(active).resolves.toEqual(result());
	});

	it("reuses one session for forward frames from the same source", async () => {
		const provider = createJianyingFilterSwingProvider();
		await provider.renderEffect(
			request({ sourceKey: "video:first", timestampSeconds: 0, value: 10 })
		);
		await provider.renderEffect(
			request({ sourceKey: "video:first", timestampSeconds: 1, value: 11 })
		);
		expect(createSession).toHaveBeenCalledOnce();
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});

	it.each([
		{
			name: "source",
			first: request({ sourceKey: "video:first", timestampSeconds: 1 }),
			second: request({
				sourceKey: "video:second",
				timestampSeconds: 1,
				value: 11,
			}),
		},
		{
			name: "backward seek",
			first: request({ sourceKey: "video:first", timestampSeconds: 2 }),
			second: request({
				sourceKey: "video:first",
				timestampSeconds: 1,
				value: 11,
			}),
		},
		{
			name: "intensity",
			first: request({ intensity: 50 }),
			second: request({ intensity: 80, value: 11 }),
		},
		{
			name: "dimensions",
			first: request(),
			second: request({ width: 2, value: 11 }),
		},
	])("recreates the session when $name changes", async ({ first, second }) => {
		const provider = createJianyingFilterSwingProvider();
		await provider.renderEffect(first);
		await provider.renderEffect(second);
		expect(createSession).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(disposeSession).toHaveBeenCalledOnce());
	});

	it("drops cached and in-flight results when cleared", async () => {
		let finish: ((value: ReturnType<typeof result>) => void) | undefined;
		sessionRender.mockImplementationOnce(
			() =>
				new Promise<ReturnType<typeof result>>((resolve) => {
					finish = resolve;
				})
		);
		const provider = createJianyingFilterSwingProvider();
		const active = provider.renderEffect(request());
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		provider.clear();
		finish?.(result());
		await expect(active).resolves.toEqual(result());
		await expect(provider.renderEffect(request())).resolves.toEqual(result());
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});
});
