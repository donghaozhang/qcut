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

vi.mock("../jianying-filter-local-runtime/render.js", () => ({
	createJianyingFilterLocalRenderSession: createSession,
}));

import { createJianyingFilterLocalProvider } from "../jianying-filter-local-runtime/provider.js";

function request({
	sourceKey,
	timestampSeconds,
	value = 10,
}: {
	sourceKey?: string;
	timestampSeconds?: number;
	value?: number;
} = {}) {
	return {
		resourceId: "7361792068475325735",
		packagePath: "/private/local/package",
		width: 1,
		height: 1,
		rgba: new Uint8Array([value, 20, 30, 255]),
		...(sourceKey ? { sourceKey } : {}),
		...(timestampSeconds === undefined ? {} : { timestampSeconds }),
	};
}

function result() {
	return {
		provider: "jianying-local-effect-v1" as const,
		resourceId: "7361792068475325735",
		width: 1,
		height: 1,
		rgba: new Uint8Array([40, 50, 60, 255]),
		mask: {
			width: 1,
			height: 1,
			bytes: new Uint8Array([255]),
			orientation: "bottom-left" as const,
		},
	};
}

describe("Jianying filter local provider", () => {
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

	it("deduplicates an active frame and reuses its completed render", async () => {
		const provider = createJianyingFilterLocalProvider();
		const first = provider.render(request());
		const second = provider.render(request());
		expect(await first).toEqual(result());
		expect(await second).toEqual(result());
		expect(createSession).toHaveBeenCalledOnce();
		expect(sessionRender).toHaveBeenCalledOnce();

		await expect(provider.render(request())).resolves.toEqual(result());
		expect(createSession).toHaveBeenCalledOnce();
		expect(sessionRender).toHaveBeenCalledOnce();
	});

	it("rejects competing frames instead of building an unbounded queue", async () => {
		let finish: ((value: ReturnType<typeof result>) => void) | undefined;
		sessionRender.mockImplementation(
			() =>
				new Promise<ReturnType<typeof result>>((resolve) => {
					finish = resolve;
				})
		);
		const provider = createJianyingFilterLocalProvider();
		const active = provider.render(request());
		await expect(provider.render(request({ value: 11 }))).rejects.toThrow(
			"正在处理另一帧"
		);
		finish?.(result());
		await expect(active).resolves.toEqual(result());
	});

	it("drops completed renders when the catalog changes", async () => {
		const provider = createJianyingFilterLocalProvider();
		await provider.render(request());
		provider.clear();
		await provider.render(request());
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});

	it("does not restore an active render after the catalog changes", async () => {
		let finish: ((value: ReturnType<typeof result>) => void) | undefined;
		sessionRender.mockImplementationOnce(
			() =>
				new Promise<ReturnType<typeof result>>((resolve) => {
					finish = resolve;
				})
		);
		const provider = createJianyingFilterLocalProvider();
		const active = provider.render(request());
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		provider.clear();
		finish?.(result());
		await expect(active).resolves.toEqual(result());

		await expect(provider.render(request())).resolves.toEqual(result());
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});

	it("reuses one native session for distinct sequential frames", async () => {
		const provider = createJianyingFilterLocalProvider();
		await provider.render(request({ value: 10 }));
		await provider.render(request({ value: 11 }));

		expect(createSession).toHaveBeenCalledOnce();
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});

	it("recreates the native session when dimensions change", async () => {
		const provider = createJianyingFilterLocalProvider();
		await provider.render(request());
		await provider.render({ ...request({ value: 11 }), width: 2 });

		expect(createSession).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(disposeSession).toHaveBeenCalledOnce());
	});

	it("recreates the native session when the source changes", async () => {
		const provider = createJianyingFilterLocalProvider();
		await provider.render(
			request({ sourceKey: "video:first", timestampSeconds: 1 })
		);
		await provider.render(
			request({ sourceKey: "video:second", timestampSeconds: 1, value: 11 })
		);

		expect(createSession).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(disposeSession).toHaveBeenCalledOnce());
	});

	it("recreates the native session after seeking backward", async () => {
		const provider = createJianyingFilterLocalProvider();
		await provider.render(
			request({ sourceKey: "video:first", timestampSeconds: 2 })
		);
		await provider.render(
			request({ sourceKey: "video:first", timestampSeconds: 1, value: 11 })
		);

		expect(createSession).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(disposeSession).toHaveBeenCalledOnce());
	});

	it("reuses a mask-free native session for sequential multi-pass frames", async () => {
		const effectResult = {
			provider: "jianying-local-effect-v1" as const,
			resourceId: "7403664041945681191",
			width: 1,
			height: 1,
			rgba: new Uint8Array([40, 50, 60, 255]),
		};
		sessionRender.mockResolvedValue(effectResult);
		const provider = createJianyingFilterLocalProvider();
		const effectRequest = {
			...request(),
			resourceId: effectResult.resourceId,
			intensity: 75,
		};

		await expect(provider.renderEffect(effectRequest)).resolves.toEqual(
			effectResult
		);
		await provider.renderEffect({
			...effectRequest,
			rgba: new Uint8Array([11, 20, 30, 255]),
		});

		expect(createSession).toHaveBeenCalledOnce();
		expect(createSession).toHaveBeenCalledWith(
			expect.objectContaining({ mode: "multi-pass", intensity: 75 })
		);
		expect(sessionRender).toHaveBeenCalledTimes(2);
	});
});
