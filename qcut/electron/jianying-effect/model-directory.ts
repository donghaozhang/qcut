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
export function jianyingModelDirectory(): string | null {
	const override = process.env.QCUT_JIANYING_EFFECT_MODEL_ROOT;
	if (override) return existsSync(override) ? override : null;

	const home = os.homedir();
	const candidates = [
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
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
