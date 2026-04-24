import { ipcMain, safeStorage, app, IpcMainInvokeEvent } from "electron";
import path from "path";
import fs from "fs";
import {
	setKey as persistToQcutEnv,
	deleteKey as removeFromQcutEnv,
	getKeyFromFile as readFromQcutEnvFile,
} from "./native-pipeline/infra/key-manager.js";
import { computeKeyStatus, KEY_SOURCE_PRECEDENCE } from "./api-key-status.js";
import type { KeyStatus, KeySource } from "./api-key-status.js";
import {
	AICP_ENV_MAP,
	AICP_ENV_READ_MAP,
	QCUT_ENV_MAP,
	QCUT_ENV_READ_MAP,
	type ApiKeys,
} from "./api-key-vocabulary.js";

interface ApiKeyData {
	falApiKey?: string;
	freesoundApiKey?: string;
	geminiApiKey?: string;
	openRouterApiKey?: string;
	anthropicApiKey?: string;
	elevenLabsApiKey?: string;
	gmiApiKey?: string;
	runwayApiKey?: string;
}

interface EncryptedApiKeyData {
	[key: string]: string;
}

interface ApiKeysStatus {
	anthropicApiKey: KeyStatus;
	elevenLabsApiKey: KeyStatus;
	freesoundApiKey: KeyStatus;
	falApiKey: KeyStatus;
	geminiApiKey: KeyStatus;
	gmiApiKey: KeyStatus;
	openRouterApiKey: KeyStatus;
	runwayApiKey: KeyStatus;
}

interface ApiKeyHandlers {
	"api-keys:get": () => Promise<ApiKeys>;
	"api-keys:set": (keys: ApiKeyData) => Promise<boolean>;
	"api-keys:clear": () => Promise<boolean>;
	"api-keys:status": () => Promise<ApiKeysStatus>;
}

// Backwards-compatible aliases for the vocabulary module. Existing call sites
// use these names; the tables themselves now live in api-key-vocabulary.ts so
// the spawn env builder, migration routine, and tests share a single source.
const AICP_KEY_MAP = AICP_ENV_READ_MAP;
const AICP_REVERSE_MAP = AICP_ENV_MAP;

const EMPTY_API_KEYS: ApiKeys = {
	falApiKey: "",
	freesoundApiKey: "",
	geminiApiKey: "",
	openRouterApiKey: "",
	anthropicApiKey: "",
	elevenLabsApiKey: "",
	gmiApiKey: "",
	runwayApiKey: "",
};

/** Return a fresh ApiKeys object with all fields empty. */
function getEmptyApiKeys(): ApiKeys {
	return { ...EMPTY_API_KEYS };
}

/** Resolve the path to the encrypted API keys JSON file in userData. */
function getApiKeysFilePath(): string {
	try {
		const userDataPath = app.getPath("userData");
		return path.join(userDataPath, "api-keys.json");
	} catch (error) {
		console.error("[API Keys] Failed to resolve userData path:", error);
		return path.join(process.cwd(), "api-keys.json");
	}
}

/** Decrypt a single base64-encoded safeStorage value, returning empty string on failure. */
function decryptStoredValue({
	encryptedValue,
}: {
	encryptedValue?: string;
}): string {
	if (!encryptedValue) {
		return "";
	}

	if (!safeStorage.isEncryptionAvailable()) {
		return encryptedValue;
	}

	try {
		return safeStorage.decryptString(Buffer.from(encryptedValue, "base64"));
	} catch {
		return encryptedValue;
	}
}

/** Decrypt all API keys from the encrypted storage format. */
function decryptStoredApiKeys({
	encryptedData,
}: {
	encryptedData: EncryptedApiKeyData;
}): ApiKeys {
	try {
		const result = getEmptyApiKeys();
		const apiKeyFields = [
			"falApiKey",
			"freesoundApiKey",
			"geminiApiKey",
			"openRouterApiKey",
			"anthropicApiKey",
			"elevenLabsApiKey",
			"gmiApiKey",
			"runwayApiKey",
		] as const;
		for (const field of apiKeyFields) {
			result[field] = decryptStoredValue({
				encryptedValue: encryptedData[field],
			});
		}
		return result;
	} catch (error) {
		console.error("[API Keys] Failed to decrypt API keys:", error);
		return getEmptyApiKeys();
	}
}

/**
 * Returns the platform-correct path to AICP's credential store.
 * macOS/Linux: ~/.config/video-ai-studio/credentials.env
 * Windows: %APPDATA%/video-ai-studio/credentials.env
 */
function getAicpCredentialsPath(): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(home, "AppData", "Roaming");
		return path.join(appData, "video-ai-studio", "credentials.env");
	}
	return path.join(home, ".config", "video-ai-studio", "credentials.env");
}

/**
 * Read AICP CLI credential store (Tier 3 fallback).
 * Parses ~/.config/video-ai-studio/credentials.env as KEY=VALUE lines.
 */
function loadAicpCredentials(): Partial<ApiKeys> {
	try {
		const credPath = getAicpCredentialsPath();
		if (!fs.existsSync(credPath)) return {};

		const content = fs.readFileSync(credPath, "utf-8");
		const keys: Partial<ApiKeys> = {};

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const name = trimmed.slice(0, eqIdx);
			const value = trimmed.slice(eqIdx + 1);
			const field = AICP_KEY_MAP[name];
			if (field && value) {
				keys[field] = value;
			}
		}
		return keys;
	} catch (error) {
		console.warn("[API Keys] Failed to read AICP credentials:", error);
		return {};
	}
}

/**
 * Sync AICP-compatible keys to the CLI credential store so external tools
 * (Claude Code, aicp CLI) can read them without Electron's safeStorage.
 * Preserves any existing keys in the file that QCut doesn't manage.
 */
function syncToAicpCredentials(keys: Partial<ApiKeys>): void {
	try {
		const credPath = getAicpCredentialsPath();

		// Read existing lines to preserve keys not managed by QCut
		const managedVars = new Set<string>(Object.values(AICP_REVERSE_MAP));
		const preserved: string[] = [];
		if (fs.existsSync(credPath)) {
			for (const line of fs.readFileSync(credPath, "utf-8").split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const eqIdx = trimmed.indexOf("=");
				const varName = eqIdx > 0 ? trimmed.slice(0, eqIdx) : "";
				if (!managedVars.has(varName)) {
					preserved.push(line);
				}
			}
		}

		// Build new lines for AICP-mapped keys
		const newLines: string[] = [];
		for (const [field, envName] of Object.entries(AICP_REVERSE_MAP)) {
			const value = keys[field as keyof ApiKeys];
			if (value) {
				newLines.push(`${envName}=${value}`);
			}
		}

		const content = [...preserved, ...newLines].join("\n") + "\n";

		const dir = path.dirname(credPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(credPath, content, { mode: 0o600 });
		console.log("[API Keys] Synced to AICP credential store:", credPath);
	} catch (error) {
		console.warn("[API Keys] Failed to sync to AICP credentials:", error);
	}
}

/**
 * Sync keys to ~/.qcut/.env so the native CLI can read them.
 * Only writes keys that have a value — never deletes keys that are
 * simply absent from the source (e.g. Electron store) so that keys
 * added directly to ~/.qcut/.env are preserved across restarts.
 */
function syncToQcutEnv(keys: Partial<ApiKeys>): void {
	try {
		for (const [field, envName] of Object.entries(QCUT_ENV_MAP)) {
			const value = keys[field as keyof ApiKeys];
			if (value) {
				persistToQcutEnv(envName, value);
			} else if (field in keys && value === "") {
				// Explicitly cleared — remove from env file
				removeFromQcutEnv(envName);
			}
			// If field is absent (undefined), preserve existing env value
		}
	} catch (error) {
		console.warn("[API Keys] Failed to sync to ~/.qcut/.env:", error);
	}
}

/**
 * Load keys from QCut's Electron safeStorage store (Tier 2).
 */
async function loadElectronStoredKeys(): Promise<ApiKeys> {
	const apiKeysFilePath = getApiKeysFilePath();
	try {
		if (!fs.existsSync(apiKeysFilePath)) {
			return getEmptyApiKeys();
		}
		const rawData = fs.readFileSync(apiKeysFilePath, "utf8");
		const encryptedData = JSON.parse(rawData) as EncryptedApiKeyData;
		return decryptStoredApiKeys({ encryptedData });
	} catch (error) {
		console.error("[API Keys] Failed to load Electron stored keys:", error);
		return getEmptyApiKeys();
	}
}

/**
 * Load keys from ~/.qcut/.env (Tier 3b — native CLI credential store).
 */
function loadQcutEnvKeys(): Partial<ApiKeys> {
	try {
		const home = process.env.HOME || process.env.USERPROFILE || "";
		const envPath = path.join(home, ".qcut", ".env");
		if (!fs.existsSync(envPath)) return {};
		const result: Partial<ApiKeys> = {};
		for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx <= 0) continue;
			const varName = trimmed.slice(0, eqIdx);
			const value = trimmed.slice(eqIdx + 1);
			const field = QCUT_ENV_READ_MAP[varName] || AICP_KEY_MAP[varName];
			if (field && value) {
				result[field] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
}

/**
 * Get decrypted API keys with 3-tier fallback (post ONE-ENV-FILE migration):
 *   1. Environment variables (`process.env`)
 *   2. QCut Electron safeStorage store
 *   3. File tier — `~/.qcut/.env` canonical, AICP's legacy `credentials.env`
 *      merged in as a fallback during the beta window
 *
 * The `aicpKeys` / `qcutEnvKeys` locals below are the two physical sources
 * that back the logical `file` tier. The public `ApiKeySource` contract and
 * the UI both describe these as a single tier; only the internal resolver
 * still distinguishes them so existing `aicp set-key`-only users continue
 * to resolve cleanly.
 */
export async function getDecryptedApiKeys(): Promise<ApiKeys> {
	const electronKeys = await loadElectronStoredKeys();
	const aicpKeys = loadAicpCredentials();
	const qcutEnvKeys = loadQcutEnvKeys();

	// Canonical file tier = ~/.qcut/.env (qcutEnvKeys). The legacy AICP
	// `credentials.env` (aicpKeys) is merged in only as a fallback so
	// historical `aicp set-key` users keep working during the beta. Order
	// matters: qcut-env must resolve BEFORE aicp-cli so a fresh value in
	// the canonical file is never shadowed by a stale copy in the legacy
	// file (see ONE-ENV-FILE-IMPLEMENTATION.md ST-4 "qcut-env wins").
	return {
		falApiKey:
			process.env.FAL_KEY ||
			process.env.FAL_API_KEY ||
			electronKeys.falApiKey ||
			qcutEnvKeys.falApiKey ||
			aicpKeys.falApiKey ||
			"",
		freesoundApiKey:
			process.env.FREESOUND_API_KEY ||
			electronKeys.freesoundApiKey ||
			qcutEnvKeys.freesoundApiKey ||
			"",
		geminiApiKey:
			process.env.GEMINI_API_KEY ||
			electronKeys.geminiApiKey ||
			qcutEnvKeys.geminiApiKey ||
			aicpKeys.geminiApiKey ||
			"",
		openRouterApiKey:
			process.env.OPENROUTER_API_KEY ||
			electronKeys.openRouterApiKey ||
			qcutEnvKeys.openRouterApiKey ||
			aicpKeys.openRouterApiKey ||
			"",
		anthropicApiKey:
			process.env.ANTHROPIC_API_KEY ||
			electronKeys.anthropicApiKey ||
			qcutEnvKeys.anthropicApiKey ||
			"",
		elevenLabsApiKey:
			process.env.ELEVENLABS_API_KEY ||
			electronKeys.elevenLabsApiKey ||
			qcutEnvKeys.elevenLabsApiKey ||
			"",
		gmiApiKey:
			process.env.GMI_API_KEY ||
			electronKeys.gmiApiKey ||
			qcutEnvKeys.gmiApiKey ||
			"",
		runwayApiKey:
			process.env.RUNWAY_API_KEY ||
			electronKeys.runwayApiKey ||
			qcutEnvKeys.runwayApiKey ||
			"",
	};
}

/** Marker filename written once migration has run; gates idempotence. */
const UNIFIED_ENV_MARKER_FILENAME = ".env-file-unified";

/**
 * Resolve the userData directory used by the marker file. Split out from
 * `migrateToSingleEnvFile` so tests can inject a temp dir without stubbing
 * `app.getPath`.
 */
function getUserDataDir(): string {
	try {
		return app.getPath("userData");
	} catch {
		return process.env.QCUT_USERDATA_DIR || "";
	}
}

/**
 * One-shot migration: copy AICP-vocabulary keys from the legacy
 * `credentials.env` file into `~/.qcut/.env` on first launch of the
 * unified-file build.
 *
 *   - Reads marker at `${userDataDir}/${UNIFIED_ENV_MARKER_FILENAME}`; skips
 *     entirely if present (idempotent across restarts).
 *   - For each key in the AICP vocabulary (FAL_KEY / GEMINI_API_KEY /
 *     OPENROUTER_API_KEY), if `~/.qcut/.env` has no value AND
 *     `credentials.env` does, copies the value over. Never overwrites
 *     existing native-CLI values.
 *   - Leaves the legacy `credentials.env` untouched — AICP's own
 *     `aicp set-key` CLI keeps writing there, and QCut's file reader
 *     continues to merge both at read time during the beta window.
 *   - Writes an ISO timestamp marker on success so subsequent launches
 *     no-op.
 *
 * Exported for the migration unit test; not part of the IPC surface.
 */
export function migrateToSingleEnvFile({
	userDataDir = getUserDataDir(),
}: {
	userDataDir?: string;
} = {}): void {
	if (!userDataDir) {
		console.warn("[API Keys] Migration skipped: no userData dir available");
		return;
	}

	const markerPath = path.join(userDataDir, UNIFIED_ENV_MARKER_FILENAME);

	try {
		if (fs.existsSync(markerPath)) {
			return;
		}

		const aicpKeys = loadAicpCredentials();
		let copied = 0;

		for (const [field, envName] of Object.entries(AICP_REVERSE_MAP)) {
			const aicpValue = aicpKeys[field as keyof ApiKeys];
			if (!aicpValue) continue;

			// Read the canonical file directly — `getKey()` would consult
			// `process.env` first, so a shell-exported key would suppress
			// the backfill and leave the file empty after the marker is
			// written.
			const existing = readFromQcutEnvFile(envName);
			if (existing) continue;

			persistToQcutEnv(envName, aicpValue);
			copied += 1;
		}

		if (!fs.existsSync(userDataDir)) {
			fs.mkdirSync(userDataDir, { recursive: true });
		}
		fs.writeFileSync(markerPath, new Date().toISOString(), { mode: 0o600 });

		if (copied > 0) {
			console.log(
				`[API Keys] Migration: copied ${copied} key(s) from credentials.env → ~/.qcut/.env`
			);
		}
	} catch (error) {
		console.warn("[API Keys] Migration failed:", error);
	}
}

/**
 * Setup API key-related IPC handlers for Electron
 * Uses Electron's safeStorage for encrypted key storage
 */
export function setupApiKeyIPC(): void {
	const apiKeysFilePath = getApiKeysFilePath();

	// One-shot migration from legacy credentials.env → ~/.qcut/.env before
	// the existing startup sync runs. Idempotent via marker file.
	migrateToSingleEnvFile();

	// Auto-sync existing encrypted keys to AICP credential store on startup
	// so CLI tools can access keys saved before syncToAicpCredentials was added.
	loadElectronStoredKeys()
		.then((keys) => {
			const hasKeys =
				keys.falApiKey || keys.geminiApiKey || keys.openRouterApiKey;
			if (hasKeys) {
				syncToAicpCredentials(keys);
				syncToQcutEnv(keys);
			}
		})
		.catch((error) => {
			console.warn("[API Keys] Startup sync failed:", error);
		});

	/**
	 * Get stored API keys (decrypted)
	 */
	ipcMain.handle("api-keys:get", async (): Promise<ApiKeys> => {
		return getDecryptedApiKeys();
	});

	/**
	 * Store API keys (encrypted)
	 */
	ipcMain.handle(
		"api-keys:set",
		async (_event: IpcMainInvokeEvent, keys: ApiKeyData): Promise<boolean> => {
			console.log("[API Keys] Save request received");

			try {
				const dataToStore: EncryptedApiKeyData = {};

				const encryptionAvailable = safeStorage.isEncryptionAvailable();
				console.log("[API Keys] Encryption available:", encryptionAvailable);

				const apiKeyFields = [
					"falApiKey",
					"freesoundApiKey",
					"geminiApiKey",
					"openRouterApiKey",
					"anthropicApiKey",
					"elevenLabsApiKey",
					"gmiApiKey",
					"runwayApiKey",
				] as const;

				if (encryptionAvailable) {
					for (const field of apiKeyFields) {
						const value = keys[field] || "";
						dataToStore[field] = value
							? safeStorage.encryptString(value).toString("base64")
							: "";
					}
				} else {
					console.log("[API Keys] Encryption unavailable, storing plain text");
					for (const field of apiKeyFields) {
						dataToStore[field] = keys[field] || "";
					}
				}

				const dir: string = path.dirname(apiKeysFilePath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				fs.writeFileSync(
					apiKeysFilePath,
					JSON.stringify(dataToStore, null, 2),
					{
						mode: 0o600,
					}
				);

				// Sync plaintext keys to AICP credential store so CLI tools can read them
				syncToAicpCredentials(keys);
				syncToQcutEnv(keys);

				return true;
			} catch (error: any) {
				console.error("[API Keys] Error saving:", error);
				throw new Error(`Failed to save API keys: ${error?.message || error}`);
			}
		}
	);

	/**
	 * Clear all stored API keys
	 */
	ipcMain.handle("api-keys:clear", async (): Promise<boolean> => {
		try {
			if (fs.existsSync(apiKeysFilePath)) {
				fs.unlinkSync(apiKeysFilePath);
			}
			return true;
		} catch (error: any) {
			throw new Error(`Failed to clear API keys: ${error?.message || error}`);
		}
	});

	/**
	 * Get key status with source info (env / electron / file / not-set)
	 *
	 * Post-ONE-ENV-FILE migration, the two legacy file-based tiers
	 * (`aicp-cli`, `qcut-env`) are unified under a single `file` tier.
	 * A key is `file`-present when *either* `~/.qcut/.env` or the legacy
	 * AICP `credentials.env` has a value — keeps AICP-CLI-only users
	 * working while canonical writes flow only to `~/.qcut/.env`.
	 */
	ipcMain.handle("api-keys:status", async (): Promise<ApiKeysStatus> => {
		const electronKeys = await loadElectronStoredKeys();
		const aicpKeys = loadAicpCredentials();
		const qcutEnvKeys = loadQcutEnvKeys();

		function resolveStatus({
			envName,
			field,
			altEnvName,
		}: {
			envName: string;
			field: keyof ApiKeys;
			altEnvName?: string;
		}): KeyStatus {
			return computeKeyStatus({
				env: Boolean(
					process.env[envName] || (altEnvName && process.env[altEnvName])
				),
				electron: Boolean(electronKeys[field]),
				file: Boolean(qcutEnvKeys[field] || aicpKeys[field]),
			});
		}

		return {
			anthropicApiKey: resolveStatus({
				envName: "ANTHROPIC_API_KEY",
				field: "anthropicApiKey",
			}),
			elevenLabsApiKey: resolveStatus({
				envName: "ELEVENLABS_API_KEY",
				field: "elevenLabsApiKey",
			}),
			falApiKey: resolveStatus({
				envName: "FAL_KEY",
				field: "falApiKey",
				altEnvName: "FAL_API_KEY",
			}),
			freesoundApiKey: resolveStatus({
				envName: "FREESOUND_API_KEY",
				field: "freesoundApiKey",
			}),
			geminiApiKey: resolveStatus({
				envName: "GEMINI_API_KEY",
				field: "geminiApiKey",
			}),
			gmiApiKey: resolveStatus({
				envName: "GMI_API_KEY",
				field: "gmiApiKey",
			}),
			openRouterApiKey: resolveStatus({
				envName: "OPENROUTER_API_KEY",
				field: "openRouterApiKey",
			}),
			runwayApiKey: resolveStatus({
				envName: "RUNWAY_API_KEY",
				field: "runwayApiKey",
			}),
		};
	});
}

// CommonJS export for backward compatibility with main.js
module.exports = {
	setupApiKeyIPC,
	getDecryptedApiKeys,
	loadAicpCredentials,
	getAicpCredentialsPath,
	KEY_SOURCE_PRECEDENCE,
	computeKeyStatus,
};

export { loadAicpCredentials, getAicpCredentialsPath, loadElectronStoredKeys };
export { KEY_SOURCE_PRECEDENCE, computeKeyStatus };
export type {
	ApiKeys,
	ApiKeyData,
	ApiKeyHandlers,
	KeySource,
	KeyStatus,
	ApiKeysStatus,
};
