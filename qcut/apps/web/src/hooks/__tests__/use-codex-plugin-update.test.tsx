import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	PlatformCodexPluginUpdatesAPI,
	PlatformCodexPluginUpdateState,
} from "@qcut/platform-core";
import { useCodexPluginUpdate } from "@/hooks/use-codex-plugin-update";

const mocks = vi.hoisted(() => ({
	platformImpl: undefined as (() => unknown) | undefined,
}));

vi.mock("@qcut/platform-core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@qcut/platform-core")>();
	return {
		...actual,
		platform: () => mocks.platformImpl?.(),
	};
});

const EMPTY_STATE: PlatformCodexPluginUpdateState = {
	phase: "idle",
	codexAvailable: false,
	installed: false,
};

const READY_STATE: PlatformCodexPluginUpdateState = {
	phase: "up-to-date",
	codexAvailable: true,
	installed: true,
	installedVersion: "1.1.0",
};

function createPlugin(
	overrides: Partial<PlatformCodexPluginUpdatesAPI> = {}
): PlatformCodexPluginUpdatesAPI {
	return {
		getState: vi.fn(async () => READY_STATE),
		checkForUpdates: vi.fn(async () => READY_STATE),
		installUpdate: vi.fn(async () => READY_STATE),
		onStateChanged: vi.fn(() => vi.fn()),
		...overrides,
	};
}

function mockPlatformWithPlugin(plugin: PlatformCodexPluginUpdatesAPI) {
	mocks.platformImpl = () => ({
		hasCapability: () => true,
		updates: { plugin },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.platformImpl = undefined;
});

describe("useCodexPluginUpdate", () => {
	it("reports unavailable when the platform lacks the Updates capability", async () => {
		mocks.platformImpl = () => ({ hasCapability: () => false });

		const { result } = renderHook(() => useCodexPluginUpdate());

		expect(result.current.available).toBe(false);
		expect(result.current.state).toEqual(EMPTY_STATE);
		await act(async () => {
			await expect(result.current.checkForUpdates()).resolves.toEqual(
				EMPTY_STATE
			);
		});
	});

	it("reports unavailable when resolving the platform throws", async () => {
		mocks.platformImpl = () => {
			throw new Error("platform not registered");
		};

		const { result } = renderHook(() => useCodexPluginUpdate());

		expect(result.current.available).toBe(false);
		await act(async () => {
			await expect(result.current.installUpdate()).resolves.toEqual(
				EMPTY_STATE
			);
		});
	});

	it("surfaces an initial getState failure as an error state", async () => {
		mockPlatformWithPlugin(
			createPlugin({
				getState: vi.fn(async () => {
					throw new Error("boom");
				}),
			})
		);

		const { result } = renderHook(() => useCodexPluginUpdate());

		expect(result.current.available).toBe(true);
		await waitFor(() => expect(result.current.state.phase).toBe("error"));
		expect(result.current.state).toEqual({
			phase: "error",
			codexAvailable: true,
			installed: false,
			message: "QCut Plugin update failed",
			error: "boom",
		});
	});

	it("ignores getState settlement after unmount and unsubscribes", async () => {
		let settleGetState:
			| {
					resolve: (state: PlatformCodexPluginUpdateState) => void;
					reject: (error: Error) => void;
			  }
			| undefined;
		const unsubscribe = vi.fn();
		mockPlatformWithPlugin(
			createPlugin({
				getState: vi.fn(
					() =>
						new Promise<PlatformCodexPluginUpdateState>((resolve, reject) => {
							settleGetState = { resolve, reject };
						})
				),
				onStateChanged: vi.fn(() => unsubscribe),
			})
		);

		const { result, unmount } = renderHook(() => useCodexPluginUpdate());
		unmount();
		expect(unsubscribe).toHaveBeenCalledTimes(1);

		await act(async () => {
			settleGetState?.resolve(READY_STATE);
		});
		expect(result.current.state).toEqual(EMPTY_STATE);
	});

	it("ignores a getState rejection after unmount", async () => {
		let rejectGetState: ((error: Error) => void) | undefined;
		mockPlatformWithPlugin(
			createPlugin({
				getState: vi.fn(
					() =>
						new Promise<PlatformCodexPluginUpdateState>((_resolve, reject) => {
							rejectGetState = reject;
						})
				),
			})
		);

		const { result, unmount } = renderHook(() => useCodexPluginUpdate());
		unmount();

		await act(async () => {
			rejectGetState?.(new Error("too late"));
		});
		expect(result.current.state).toEqual(EMPTY_STATE);
	});

	it("returns an error state when checkForUpdates rejects", async () => {
		const plugin = createPlugin({
			checkForUpdates: vi.fn(() => Promise.reject("network down")),
		});
		mockPlatformWithPlugin(plugin);

		const { result } = renderHook(() => useCodexPluginUpdate());
		await waitFor(() => expect(result.current.state.phase).toBe("up-to-date"));

		let nextState: PlatformCodexPluginUpdateState | undefined;
		await act(async () => {
			nextState = await result.current.checkForUpdates();
		});

		expect(plugin.checkForUpdates).toHaveBeenCalledTimes(1);
		expect(nextState).toMatchObject({ phase: "error", error: "network down" });
		expect(result.current.state.phase).toBe("error");
	});

	it("returns an error state when installUpdate rejects", async () => {
		const plugin = createPlugin({
			installUpdate: vi.fn(async () => {
				throw new Error("install failed");
			}),
		});
		mockPlatformWithPlugin(plugin);

		const { result } = renderHook(() => useCodexPluginUpdate());
		await waitFor(() => expect(result.current.state.phase).toBe("up-to-date"));

		let nextState: PlatformCodexPluginUpdateState | undefined;
		await act(async () => {
			nextState = await result.current.installUpdate();
		});

		expect(plugin.installUpdate).toHaveBeenCalledTimes(1);
		expect(nextState).toMatchObject({
			phase: "error",
			message: "QCut Plugin update failed",
			error: "install failed",
		});
		expect(result.current.state.error).toBe("install failed");
	});
});
