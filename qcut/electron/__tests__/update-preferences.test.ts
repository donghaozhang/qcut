import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
	DEFAULT_UPDATE_PREFERENCES,
	MAX_AUTOMATIC_UPDATE_BYTES,
	readUpdatePreferences,
	writeUpdatePreferences,
} from "../update-preferences";

const temporaryDirectories: string[] = [];

function createUserDataPath(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-updates-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("update preferences", () => {
	it("enables bounded automatic updates by default", () => {
		const preferences = readUpdatePreferences({
			userDataPath: createUserDataPath(),
		});
		expect(preferences).toEqual(DEFAULT_UPDATE_PREFERENCES);
		expect(preferences.maxAutomaticDownloadBytes).toBe(
			MAX_AUTOMATIC_UPDATE_BYTES
		);
	});

	it("persists the user toggle without accepting a forged size threshold", () => {
		const userDataPath = createUserDataPath();
		writeUpdatePreferences({
			userDataPath,
			preferences: {
				automaticUpdates: false,
				maxAutomaticDownloadBytes: 1,
			},
		});

		expect(readUpdatePreferences({ userDataPath })).toEqual({
			automaticUpdates: false,
			maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
		});
	});

	it("falls back safely when the preferences file is corrupt", () => {
		const userDataPath = createUserDataPath();
		fs.writeFileSync(
			path.join(userDataPath, "update-preferences.json"),
			"not-json"
		);
		expect(readUpdatePreferences({ userDataPath })).toEqual(
			DEFAULT_UPDATE_PREFERENCES
		);
	});
});
