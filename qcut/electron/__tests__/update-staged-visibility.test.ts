import { describe, expect, it, vi } from "vitest";
import type { StagedUpdateInfo } from "../auto-update-controller";
import { createStagedUpdateVisibility } from "../update-staged-visibility";

const STAGED: StagedUpdateInfo = {
	version: "2026.07.12.1",
	internalVersion: "2026.7.1201",
};

function createHarness({
	platform = "darwin" as NodeJS.Platform,
	choice = "close" as "install" | "close",
} = {}) {
	const setDockBadge = vi.fn();
	const showNotification = vi.fn();
	const promptQuitAndInstall = vi.fn().mockResolvedValue(choice);
	const visibility = createStagedUpdateVisibility({
		platform,
		setDockBadge,
		showNotification,
		promptQuitAndInstall,
		logger: { log: vi.fn(), warn: vi.fn() },
	});
	return { visibility, setDockBadge, showNotification, promptQuitAndInstall };
}

describe("staged update visibility", () => {
	it("badges the dock and notifies once per staged version", () => {
		const { visibility, setDockBadge, showNotification } = createHarness();

		visibility.onUpdateStaged({ staged: STAGED });
		visibility.onUpdateStaged({ staged: STAGED });

		expect(setDockBadge).toHaveBeenCalledTimes(1);
		expect(setDockBadge).toHaveBeenCalledWith({ text: "1" });
		expect(showNotification).toHaveBeenCalledTimes(1);
		expect(showNotification.mock.calls[0][0].body).toContain("2026.07.12.1");

		visibility.onUpdateStaged({
			staged: { version: "2026.07.13.1", internalVersion: "2026.7.1301" },
		});
		expect(showNotification).toHaveBeenCalledTimes(2);
	});

	it("skips the dock badge off macOS and never intercepts close there", () => {
		const { visibility, setDockBadge } = createHarness({ platform: "win32" });

		visibility.onUpdateStaged({ staged: STAGED });
		expect(setDockBadge).not.toHaveBeenCalled();
		expect(visibility.shouldInterceptClose()).toBe(false);
	});

	it("prompts at most once per staged version on close", async () => {
		const { visibility, promptQuitAndInstall } = createHarness();

		expect(visibility.shouldInterceptClose()).toBe(false);
		visibility.onUpdateStaged({ staged: STAGED });
		expect(visibility.shouldInterceptClose()).toBe(true);

		await expect(visibility.resolveClose()).resolves.toBe("close");
		expect(promptQuitAndInstall).toHaveBeenCalledWith({
			version: "2026.07.12.1",
		});
		// The user chose to keep running; closing again must not nag.
		expect(visibility.shouldInterceptClose()).toBe(false);

		// A newer staged version may prompt again.
		visibility.onUpdateStaged({
			staged: { version: "2026.07.13.1", internalVersion: "2026.7.1301" },
		});
		expect(visibility.shouldInterceptClose()).toBe(true);
	});

	it("returns the install choice and suppresses prompts while quitting", async () => {
		const { visibility } = createHarness({ choice: "install" });

		visibility.onUpdateStaged({ staged: STAGED });
		expect(visibility.shouldInterceptClose()).toBe(true);
		await expect(visibility.resolveClose()).resolves.toBe("install");

		const { visibility: quitting } = createHarness();
		quitting.onUpdateStaged({ staged: STAGED });
		quitting.setQuitting();
		expect(quitting.shouldInterceptClose()).toBe(false);
	});

	it("treats a failed prompt as a plain close", async () => {
		const { visibility, promptQuitAndInstall } = createHarness();
		promptQuitAndInstall.mockRejectedValueOnce(new Error("dialog failed"));

		visibility.onUpdateStaged({ staged: STAGED });
		await expect(visibility.resolveClose()).resolves.toBe("close");
		// The version must count as prompted even when the dialog throws;
		// otherwise main.ts's follow-up close() would be intercepted again,
		// looping forever on a repeatedly-failing dialog.
		expect(visibility.shouldInterceptClose()).toBe(false);
	});
});
