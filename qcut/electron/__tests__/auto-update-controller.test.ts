import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAutoUpdateController,
	resolveAutomaticUpdateDecision,
	resolveUpdateDownloadSize,
	type AutoUpdaterLike,
	type UpdateInfoLike,
} from "../auto-update-controller";
import {
	MAX_AUTOMATIC_UPDATE_BYTES,
	writeUpdatePreferences,
} from "../update-preferences";

class FakeUpdater extends EventEmitter implements AutoUpdaterLike {
	autoDownload = true;
	autoInstallOnAppQuit = false;
	allowPrerelease = false;
	channel = "";
	checkCount = 0;
	downloadCount = 0;
	installCount = 0;
	info: UpdateInfoLike;
	nextCheckError: Error | undefined;
	nextCheckOutcome: "available" | "not-available" = "available";

	constructor({ info }: { info: UpdateInfoLike }) {
		super();
		this.info = info;
	}

	async checkForUpdates(): Promise<unknown> {
		this.checkCount += 1;
		this.emit("checking-for-update");
		if (this.nextCheckError) {
			const error = this.nextCheckError;
			this.nextCheckError = undefined;
			this.emit("error", error);
			throw error;
		}
		if (this.nextCheckOutcome === "not-available") {
			this.emit("update-not-available", this.info);
			return { updateInfo: this.info };
		}
		this.emit("update-available", this.info);
		return { updateInfo: this.info };
	}

	nextDownloadError: Error | undefined;

	async downloadUpdate(): Promise<string[]> {
		this.downloadCount += 1;
		if (this.nextDownloadError) {
			const error = this.nextDownloadError;
			this.nextDownloadError = undefined;
			this.emit("error", error);
			throw error;
		}
		this.emit("download-progress", {
			percent: 50,
			transferred: 50,
			total: 100,
		});
		this.emit("update-downloaded", this.info);
		return ["/tmp/update.zip"];
	}

	quitAndInstall(): void {
		this.installCount += 1;
	}
}

const temporaryDirectories: string[] = [];

function createUserDataPath(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-controller-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createLogger() {
	return {
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	};
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("auto update controller", () => {
	it("registers listeners before checking and automatically downloads bounded updates", async () => {
		const updater = new FakeUpdater({
			info: {
				version: "2026.7.1201",
				files: [{ size: 400 * 1024 * 1024 }],
			},
		});
		const sent: Array<{ channel: string; data: unknown }> = [];
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: (message) => sent.push(message),
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));

		expect(updater.autoDownload).toBe(false);
		expect(updater.autoInstallOnAppQuit).toBe(true);
		expect(updater.channel).toBe("latest");
		expect(updater.downloadCount).toBe(1);
		expect(controller.getState().version).toBe("2026.07.12.1");
		expect(sent.some(({ channel }) => channel === "update-available")).toBe(
			true
		);
		expect(controller.installUpdate().success).toBe(true);
		expect(updater.installCount).toBe(1);
		controller.stop();
	});

	it("waits for explicit consent when automatic updates are disabled", async () => {
		const userDataPath = createUserDataPath();
		writeUpdatePreferences({
			userDataPath,
			preferences: {
				automaticUpdates: false,
				maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
			},
		});
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath,
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() =>
			expect(controller.getState().phase).toBe("available")
		);
		expect(controller.getState().decision).toBe("disabled");
		expect(updater.downloadCount).toBe(0);

		controller.setPreferences({ preferences: { automaticUpdates: true } });
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		expect(updater.downloadCount).toBe(1);
		controller.stop();
	});

	it("requires confirmation for large updates but permits manual download", async () => {
		const updater = new FakeUpdater({
			info: {
				version: "2026.7.1201",
				files: [{ size: MAX_AUTOMATIC_UPDATE_BYTES + 1 }],
			},
		});
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() =>
			expect(controller.getState().decision).toBe("too-large")
		);
		expect(updater.downloadCount).toBe(0);
		await controller.downloadUpdate();
		expect(controller.getState().phase).toBe("ready");
		expect(updater.downloadCount).toBe(1);
		controller.stop();
	});

	it("keeps a staged update installable when later checks fail", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const stagedVersions: string[] = [];
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			onUpdateStaged: ({ staged }) => stagedVersions.push(staged.version),
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		expect(stagedVersions).toEqual(["2026.07.12.1"]);
		// Drain the initial check chain so the failing check below starts fresh
		// instead of coalescing onto the still-settling first check.
		await controller.checkForUpdates();

		updater.nextCheckError = new Error("net::ERR_NAME_NOT_RESOLVED");
		await controller.checkForUpdates();

		const state = controller.getState();
		expect(state.phase).toBe("ready");
		expect(state.version).toBe("2026.07.12.1");
		expect(state.staged?.version).toBe("2026.07.12.1");
		expect(state.lastCheckError).toContain("ERR_NAME_NOT_RESOLVED");

		// A later successful check clears the stale failure.
		await controller.checkForUpdates();
		expect(controller.getState().phase).toBe("ready");
		expect(controller.getState().lastCheckError).toBeUndefined();

		expect(controller.installUpdate().success).toBe(true);
		controller.stop();
	});

	it("does not re-download a version that is already staged", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const stagedVersions: string[] = [];
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			onUpdateStaged: ({ staged }) => stagedVersions.push(staged.version),
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		expect(updater.downloadCount).toBe(1);
		// Drain the initial check chain, then re-check twice for real.
		await controller.checkForUpdates();

		// The hourly re-check reports the same version again.
		await controller.checkForUpdates();
		await controller.checkForUpdates();

		expect(updater.downloadCount).toBe(1);
		expect(stagedVersions).toEqual(["2026.07.12.1"]);
		expect(controller.getState().phase).toBe("ready");
		controller.stop();
	});

	it("downloads a genuinely newer version over an older staged one", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const stagedVersions: string[] = [];
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			onUpdateStaged: ({ staged }) => stagedVersions.push(staged.version),
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		// Drain the initial check chain so the newer-version check runs fresh.
		await controller.checkForUpdates();

		updater.info = { version: "2026.7.1301", files: [{ size: 1_000 }] };
		await controller.checkForUpdates();
		await vi.waitFor(() =>
			expect(controller.getState().version).toBe("2026.07.13.1")
		);
		expect(updater.downloadCount).toBe(2);
		expect(controller.getState().phase).toBe("ready");
		expect(controller.getState().staged?.version).toBe("2026.07.13.1");
		// The staging hook must fire again for the second version — it drives
		// the macOS dock badge and notification for long-running sessions.
		expect(stagedVersions).toEqual(["2026.07.12.1", "2026.07.13.1"]);
		controller.stop();
	});

	it("keeps a newer available offer through a failed check", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		// Drain the initial check chain so the next checks run fresh.
		await controller.checkForUpdates();

		// A newer, too-large build appears: phase "available", waiting for a
		// manual download.
		updater.info = {
			version: "2026.7.1301",
			files: [{ size: MAX_AUTOMATIC_UPDATE_BYTES + 1 }],
		};
		await controller.checkForUpdates();
		expect(controller.getState().phase).toBe("available");
		expect(controller.getState().version).toBe("2026.07.13.1");

		// A failed background check must not rewind to the older staged build.
		updater.nextCheckError = new Error("offline");
		await controller.checkForUpdates();
		expect(controller.getState().phase).toBe("available");
		expect(controller.getState().version).toBe("2026.07.13.1");
		expect(controller.getState().lastCheckError).toBe("offline");

		// The manual download for the newer version still works immediately.
		await controller.downloadUpdate();
		expect(updater.downloadCount).toBe(2);
		expect(controller.getState().phase).toBe("ready");
		expect(controller.getState().staged?.version).toBe("2026.07.13.1");
		expect(controller.getState().lastCheckError).toBeUndefined();
		controller.stop();
	});

	it("falls back to the staged build when a newer download fails", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		await controller.checkForUpdates();

		updater.info = { version: "2026.7.1301", files: [{ size: 1_000 }] };
		updater.nextDownloadError = new Error("connection reset");
		await controller.checkForUpdates();
		await vi.waitFor(() =>
			expect(controller.getState().lastCheckError).toBe("connection reset")
		);

		// The older staged build stays installable after the failed download.
		expect(controller.getState().phase).toBe("ready");
		expect(controller.getState().version).toBe("2026.07.12.1");
		expect(controller.installUpdate().success).toBe(true);
		controller.stop();
	});

	it("disarms close interception before quitAndInstall", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const order: string[] = [];
		updater.quitAndInstall = () => {
			order.push("quit-and-install");
		};
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			onBeforeQuitAndInstall: () => order.push("disarm"),
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		expect(controller.installUpdate().success).toBe(true);
		expect(order).toEqual(["disarm", "quit-and-install"]);
		controller.stop();
	});

	it("keeps the staged build when the feed stops offering it", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		controller.start();
		await vi.waitFor(() => expect(controller.getState().phase).toBe("ready"));
		// Drain the initial check chain so the not-available check runs fresh.
		await controller.checkForUpdates();

		updater.nextCheckOutcome = "not-available";
		await controller.checkForUpdates();

		expect(controller.getState().phase).toBe("ready");
		expect(controller.getState().staged?.version).toBe("2026.07.12.1");
		controller.stop();
	});

	it("still reports errors normally when nothing is staged", async () => {
		const updater = new FakeUpdater({
			info: { version: "2026.7.1201", files: [{ size: 1_000 }] },
		});
		updater.nextCheckError = new Error("offline");
		const controller = createAutoUpdateController({
			updater,
			currentVersion: "2026.7.1101",
			userDataPath: createUserDataPath(),
			logger: createLogger(),
			sendToRenderer: () => undefined,
			checkIntervalMs: 60_000,
		});

		await controller.checkForUpdates();
		expect(controller.getState().phase).toBe("error");
		expect(controller.getState().error).toBe("offline");
	});

	it("selects the largest alternative artifact and handles unknown sizes", () => {
		expect(
			resolveUpdateDownloadSize({
				info: { version: "1.0.0", files: [{ size: 20 }, { size: 50 }] },
			})
		).toBe(50);
		expect(
			resolveAutomaticUpdateDecision({
				preferences: {
					automaticUpdates: true,
					maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
				},
			})
		).toBe("automatic");
	});
});
