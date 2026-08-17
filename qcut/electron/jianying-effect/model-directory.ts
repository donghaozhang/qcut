import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Kept free of `node:sqlite` (unlike catalog.ts) so the render path stays
 * importable from the bun CLI — a static import chain reaching that builtin
 * breaks every pipeline command.
 */

/**
 * Where JianYing keeps the CV model weights an effect's algorithm graph needs.
 * The download cache carries newer versions than the app bundle, so it wins.
 * Nothing here is ever copied or redistributed: the bridge reads the weights
 * from the user's own JianYing installation.
 */
export function jianyingModelDirectories(): string[] {
	const override = process.env.QCUT_JIANYING_EFFECT_MODEL_ROOT;
	if (override) return override.split(path.delimiter).filter(existsSync);

	const home = os.homedir();
	// Both roots are needed, not the first that exists: the download cache
	// carries newer versions of some models while the app bundle is the only
	// source of others (head segmentation, avatar drive, eye fitting…).
	return [
		path.join(
			home,
			"Movies",
			"JianyingPro",
			"User Data",
			"Cache",
			"effect",
			"model"
		),
		"/Applications/VideoFusion-macOS.app/Contents/Resources/models",
	].filter(existsSync);
}

/** The delimiter-separated list the native resource finder expects. */
export function jianyingModelDirectory(): string | null {
	const directories = jianyingModelDirectories();
	return directories.length > 0 ? directories.join(path.delimiter) : null;
}
