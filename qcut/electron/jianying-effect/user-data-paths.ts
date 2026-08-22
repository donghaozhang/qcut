import os from "node:os";
import path from "node:path";

interface QCutUserDataPathOptions {
	homeDirectory?: string;
	platform?: NodeJS.Platform;
	environment?: NodeJS.ProcessEnv;
}

/** Resolves Electron's QCut user-data directory from a standalone Node CLI. */
export function qcutStandaloneUserDataRoot({
	homeDirectory = os.homedir(),
	platform = process.platform,
	environment = process.env,
}: QCutUserDataPathOptions = {}): string {
	const override = environment.QCUT_USER_DATA_DIR?.trim();
	if (override) return path.resolve(override);

	if (platform === "darwin") {
		return path.join(homeDirectory, "Library", "Application Support", "QCut");
	}
	if (platform === "win32") {
		return path.join(
			environment.APPDATA ?? path.join(homeDirectory, "AppData", "Roaming"),
			"QCut"
		);
	}
	return path.join(
		environment.XDG_CONFIG_HOME ?? path.join(homeDirectory, ".config"),
		"QCut"
	);
}
