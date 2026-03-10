import { beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";
import { cleanupPtyOnEditorExit } from "@/lib/debug/pty-session-cleanup";

describe("cleanupPtyOnEditorExit", () => {
	const mockKillAll = vi.fn();

	beforeEach(() => {
		vi.restoreAllMocks();
		mockKillAll.mockReset();

		// Mock window.electronAPI.pty.killAll
		vi.stubGlobal("window", {
			...window,
			electronAPI: {
				pty: {
					killAll: mockKillAll,
				},
			},
		});
		initPlatform(createDesktopAdapter());
	});

	it("calls killAll to clean up PTY sessions", async () => {
		mockKillAll.mockResolvedValue(undefined);
		const onError = vi.fn();

		cleanupPtyOnEditorExit({ onError });
		await Promise.resolve();

		expect(mockKillAll).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});

	it("reports killAll failures via onError", async () => {
		const killError = new Error("kill failed");
		mockKillAll.mockRejectedValue(killError);
		const onError = vi.fn();

		cleanupPtyOnEditorExit({ onError });
		await Promise.resolve();

		expect(mockKillAll).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			"[Editor] Failed to kill all PTY sessions on exit",
			killError
		);
	});

	it("handles missing electronAPI gracefully", () => {
		vi.stubGlobal("window", {});
		initPlatform(createWebAdapter());
		const onError = vi.fn();

		cleanupPtyOnEditorExit({ onError });

		// With platform() abstraction, the web adapter's PTY stub throws
		// PlatformUnsupportedError, which is caught and reported via onError.
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			"[Editor] Unexpected PTY cleanup failure",
			expect.any(Error)
		);
	});
});
