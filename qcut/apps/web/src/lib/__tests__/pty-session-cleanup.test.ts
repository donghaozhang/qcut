import { beforeEach, describe, expect, it, vi } from "vitest";
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
		const onError = vi.fn();

		cleanupPtyOnEditorExit({ onError });

		expect(onError).not.toHaveBeenCalled();
	});
});
