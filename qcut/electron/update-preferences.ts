import fs from "fs";
import path from "path";

export const MAX_AUTOMATIC_UPDATE_BYTES = 1024 * 1024 * 1024;

export interface UpdatePreferences {
	automaticUpdates: boolean;
	maxAutomaticDownloadBytes: number;
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
	automaticUpdates: true,
	maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
};

function getPreferencesPath({
	userDataPath,
}: {
	userDataPath: string;
}): string {
	return path.join(userDataPath, "update-preferences.json");
}

export function readUpdatePreferences({
	userDataPath,
}: {
	userDataPath: string;
}): UpdatePreferences {
	try {
		const raw = fs.readFileSync(getPreferencesPath({ userDataPath }), "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			automaticUpdates:
				typeof parsed.automaticUpdates === "boolean"
					? parsed.automaticUpdates
					: DEFAULT_UPDATE_PREFERENCES.automaticUpdates,
			maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
		};
	} catch {
		return { ...DEFAULT_UPDATE_PREFERENCES };
	}
}

export function writeUpdatePreferences({
	userDataPath,
	preferences,
}: {
	userDataPath: string;
	preferences: UpdatePreferences;
}): UpdatePreferences {
	const normalized: UpdatePreferences = {
		automaticUpdates: preferences.automaticUpdates,
		maxAutomaticDownloadBytes: MAX_AUTOMATIC_UPDATE_BYTES,
	};
	const preferencesPath = getPreferencesPath({ userDataPath });
	const temporaryPath = `${preferencesPath}.tmp-${process.pid}`;

	fs.mkdirSync(userDataPath, { recursive: true });
	fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, {
		mode: 0o600,
	});
	fs.renameSync(temporaryPath, preferencesPath);
	return normalized;
}
