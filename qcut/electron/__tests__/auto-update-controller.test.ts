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

	constructor({ info }: { info: UpdateInfoLike }) {
		super();
		this.info = info;
	}

	async checkForUpdates(): Promise<unknown> {
		this.checkCount += 1;
		this.emit("checking-for-update");
		this.emit("update-available", this.info);
		return { updateInfo: this.info };
	}

	async downloadUpdate(): Promise<string[]> {
		this.downloadCount += 1;
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
