import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { PlatformUpdateState } from "@qcut/platform-core";
import { useLocaleStore } from "@/stores/locale-store";

const mocks = vi.hoisted(() => {
	const baseState: PlatformUpdateState = {
		phase: "idle",
		currentVersion: "2026.07.20.1",
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
	};
	return {
		baseState,
		hasCapability: true,
		platformThrows: false,
		listener: undefined as ((state: PlatformUpdateState) => void) | undefined,
		unsubscribe: vi.fn(),
		toastError: vi.fn(),
		updates: {
			downloadUpdate: vi.fn(async () => baseState),
			installUpdate: vi.fn(async () => undefined),
			getState: vi.fn(async () => baseState),
			getReleaseNotes: vi.fn(async (): Promise<unknown> => null),
			onStateChanged: vi.fn(
				(listener: (state: PlatformUpdateState) => void) => {
					mocks.listener = listener;
					return mocks.unsubscribe;
				}
			),
		},
	};
});

vi.mock("@qcut/platform-core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@qcut/platform-core")>();
	return {
		...actual,
		platform: () => {
			if (mocks.platformThrows) {
				throw new Error("platform not initialized");
			}
			return {
				hasCapability: () => mocks.hasCapability,
				updates: mocks.updates,
			};
		},
	};
});

vi.mock("sonner", () => ({
	toast: { error: mocks.toastError, success: vi.fn() },
	Toaster: () => null,
}));

import { UpdateNotification } from "../update-notification";

const DISMISSED_VERSION_KEY = "qcut-update-dismissed-version";

function renderWithState(overrides: Partial<PlatformUpdateState>) {
	mocks.updates.getState.mockResolvedValue({
		...mocks.baseState,
		...overrides,
	});
	return render(<UpdateNotification />);
}

function queryNotification() {
	return screen.queryByRole("alert") ?? screen.queryByRole("status");
}

async function flushState() {
	await act(async () => {
		await Promise.resolve();
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasCapability = true;
	mocks.platformThrows = false;
	mocks.listener = undefined;
	mocks.updates.getReleaseNotes.mockResolvedValue(null);
	vi.mocked(window.localStorage.getItem).mockReturnValue(null);
	useLocaleStore.getState().setLocale({ locale: "en" });
});

describe("UpdateNotification", () => {
	it("stays hidden while idle and unsubscribes on unmount", async () => {
		const { unmount } = renderWithState({});

		await waitFor(() =>
			expect(mocks.updates.getState).toHaveBeenCalledTimes(1)
		);
		expect(mocks.updates.onStateChanged).toHaveBeenCalledTimes(1);
		expect(queryNotification()).not.toBeInTheDocument();

		unmount();
		expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("does not subscribe when the platform lacks update support", () => {
		mocks.hasCapability = false;
		render(<UpdateNotification />);

		expect(mocks.updates.getState).not.toHaveBeenCalled();
		expect(mocks.updates.onStateChanged).not.toHaveBeenCalled();
		expect(queryNotification()).not.toBeInTheDocument();
	});

	it("treats a throwing platform as lacking update support", () => {
		mocks.platformThrows = true;
		render(<UpdateNotification />);

		expect(mocks.updates.onStateChanged).not.toHaveBeenCalled();
		expect(queryNotification()).not.toBeInTheDocument();
	});

	it("offers to download an available update with its size", async () => {
		renderWithState({
			phase: "available",
			version: "2026.07.21.1",
			downloadSize: 50 * 1024 * 1024,
		});

		expect(
			await screen.findByText("QCut v2026.07.21.1 is available")
		).toBeInTheDocument();
		expect(screen.getByText("Ready to download · 50 MB")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Download" }));
		expect(mocks.updates.downloadUpdate).toHaveBeenCalledTimes(1);
	});

	it("labels oversized updates and formats gigabyte sizes", async () => {
		renderWithState({
			phase: "available",
			version: "2026.07.21.1",
			decision: "too-large",
			downloadSize: 2 * 1024 * 1024 * 1024,
		});

		expect(
			await screen.findByText("Large update · 2.0 GB")
		).toBeInTheDocument();
	});

	it("toasts when the download fails", async () => {
		mocks.updates.downloadUpdate.mockRejectedValueOnce(
			new Error("network down")
		);
		renderWithState({ phase: "available", version: "2026.07.21.1" });

		fireEvent.click(await screen.findByRole("button", { name: "Download" }));
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith("Failed to download update")
		);
	});

	it("dismisses an available update and keeps it hidden once dismissed", async () => {
		const { unmount } = renderWithState({
			phase: "available",
			version: "2026.07.21.1",
		});

		fireEvent.click(await screen.findByRole("button", { name: "Later" }));
		expect(window.localStorage.setItem).toHaveBeenCalledWith(
			DISMISSED_VERSION_KEY,
			"2026.07.21.1"
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();

		unmount();
		vi.mocked(window.localStorage.getItem).mockReturnValue("2026.07.21.1");
		renderWithState({ phase: "available", version: "2026.07.21.1" });
		await flushState();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("stays hidden while an automatic download is pending", async () => {
		renderWithState({
			phase: "available",
			version: "2026.07.21.1",
			automaticDownload: true,
		});

		await flushState();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("shows download progress pushed through the state listener", async () => {
		renderWithState({});
		await flushState();

		act(() => {
			mocks.listener?.({
				...mocks.baseState,
				phase: "downloading",
				version: "2026.07.21.1",
				percent: 42,
			});
		});

		const status = screen.getByRole("status");
		expect(status).toHaveTextContent("Downloading v2026.07.21.1 · 42%");
		const bar = status.querySelector<HTMLElement>(".bg-primary");
		expect(bar?.style.width).toBe("42%");
	});

	it("installs a ready update and lists local release highlights", async () => {
		mocks.updates.getReleaseNotes.mockResolvedValue({
			version: "2026.07.21.1",
			content: "## What's New\n- Faster exports\n- Smoother playback",
		});
		renderWithState({ phase: "ready", version: "2026.07.21.1" });

		expect(
			await screen.findByText("QCut v2026.07.21.1 is ready to install")
		).toBeInTheDocument();
		expect(await screen.findByText("- Faster exports")).toBeInTheDocument();
		expect(screen.getByText("- Smoother playback")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Restart" }));
		expect(mocks.updates.installUpdate).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "Later" }));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("falls back to plain release note lines when no highlights exist", async () => {
		renderWithState({
			phase: "ready",
			version: "2026.07.21.1",
			releaseNotes: "- Improved stability\n- Smaller installer",
		});

		expect(await screen.findByText("- Improved stability")).toBeInTheDocument();
		expect(screen.getByText("- Smaller installer")).toBeInTheDocument();
	});

	it("toasts when installing fails and dismisses the ready prompt", async () => {
		mocks.updates.installUpdate.mockRejectedValueOnce(new Error("locked"));
		renderWithState({ phase: "ready", version: "2026.07.21.1" });

		fireEvent.keyDown(await screen.findByRole("button", { name: "Restart" }), {
			key: "Enter",
		});
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith("Failed to install update")
		);

		fireEvent.keyDown(screen.getByRole("button", { name: "Later" }), {
			key: " ",
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("activates buttons with Enter and Space but ignores other keys", async () => {
		renderWithState({ phase: "available", version: "2026.07.21.1" });

		const download = await screen.findByRole("button", { name: "Download" });
		fireEvent.keyDown(download, { key: "Escape" });
		expect(mocks.updates.downloadUpdate).not.toHaveBeenCalled();

		fireEvent.keyDown(download, { key: "Enter" });
		expect(mocks.updates.downloadUpdate).toHaveBeenCalledTimes(1);

		fireEvent.keyDown(screen.getByRole("button", { name: "Later" }), {
			key: " ",
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
