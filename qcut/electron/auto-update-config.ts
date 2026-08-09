import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { dump, load } from "js-yaml";

export const OFFICIAL_AUTO_UPDATE_CONFIG = {
	owner: "Quriosity-agent",
	repo: "qcut",
	provider: "github",
	private: false,
	releaseType: "release",
	updaterCacheDirName: "qcut-updater",
} as const;

export type AutoUpdateConfigSource = "override" | "packaged" | "fallback";

export interface ResolvedAutoUpdateConfig {
	configPath: string;
	source: AutoUpdateConfigSource;
	packagedConfigError?: string;
}

function readConfigObject({ configPath }: { configPath: string }) {
	const parsed = load(readFileSync(configPath, "utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Packaged auto-update config is invalid: ${configPath}`);
	}
	return parsed as Record<string, unknown>;
}

export function verifyPackagedUpdateConfig({
	configPath,
}: {
	configPath: string;
}): void {
	if (!existsSync(configPath)) {
		throw new Error(`Packaged auto-update config is missing: ${configPath}`);
	}

	const config = readConfigObject({ configPath });
	for (const [field, expected] of Object.entries(OFFICIAL_AUTO_UPDATE_CONFIG)) {
		if (config[field] !== expected) {
			throw new Error(
				`Packaged auto-update config has invalid ${field}: expected ${expected}`
			);
		}
	}
}

function writeFallbackConfig({ configPath }: { configPath: string }): void {
	const contents = dump(OFFICIAL_AUTO_UPDATE_CONFIG, {
		lineWidth: -1,
		noRefs: true,
	});
	if (existsSync(configPath) && readFileSync(configPath, "utf8") === contents) {
		return;
	}

	mkdirSync(dirname(configPath), { recursive: true });
	const temporaryPath = `${configPath}.tmp-${process.pid}`;
	writeFileSync(temporaryPath, contents, { mode: 0o600 });
	renameSync(temporaryPath, configPath);
}

export function resolveAutoUpdateConfig({
	resourcesPath,
	userDataPath,
	overridePath,
}: {
	resourcesPath: string;
	userDataPath: string;
	overridePath?: string;
}): ResolvedAutoUpdateConfig {
	if (overridePath) {
		return { configPath: resolve(overridePath), source: "override" };
	}

	const packagedConfigPath = join(resourcesPath, "app-update.yml");
	try {
		verifyPackagedUpdateConfig({ configPath: packagedConfigPath });
		return { configPath: packagedConfigPath, source: "packaged" };
	} catch (error: unknown) {
		const packagedConfigError =
			error instanceof Error ? error.message : String(error);
		const fallbackConfigPath = join(userDataPath, "app-update-fallback.yml");
		writeFallbackConfig({ configPath: fallbackConfigPath });
		return {
			configPath: fallbackConfigPath,
			source: "fallback",
			packagedConfigError,
		};
	}
}
