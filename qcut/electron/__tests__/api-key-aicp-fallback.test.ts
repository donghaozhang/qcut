import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";

/**
 * Tests for AICP credential file parsing and 3-tier key fallback.
 *
 * These tests validate the credential parsing logic directly without
 * importing the Electron-dependent api-key-handler module.
 */

// ---------------------------------------------------------------------------
// Replicate the parsing logic under test (same as api-key-handler.ts)
// ---------------------------------------------------------------------------

interface ApiKeys {
	falApiKey: string;
	freesoundApiKey: string;
	geminiApiKey: string;
	openRouterApiKey: string;
	anthropicApiKey: string;
}

const AICP_KEY_MAP: Record<string, keyof ApiKeys> = {
	FAL_KEY: "falApiKey",
	GEMINI_API_KEY: "geminiApiKey",
	OPENROUTER_API_KEY: "openRouterApiKey",
};

function getAicpCredentialsPath(): string {
	const home = os.homedir();
	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(home, "AppData", "Roaming");
		return path.join(appData, "video-ai-studio", "credentials.env");
	}
	return path.join(home, ".config", "video-ai-studio", "credentials.env");
}

function parseAicpCredentials(content: string): Partial<ApiKeys> {
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
}

function mergeKeys(electronKeys: ApiKeys, aicpKeys: Partial<ApiKeys>): ApiKeys {
	return {
		falApiKey: electronKeys.falApiKey || aicpKeys.falApiKey || "",
		freesoundApiKey: electronKeys.freesoundApiKey || "",
		geminiApiKey: electronKeys.geminiApiKey || aicpKeys.geminiApiKey || "",
		openRouterApiKey:
			electronKeys.openRouterApiKey || aicpKeys.openRouterApiKey || "",
		anthropicApiKey: electronKeys.anthropicApiKey || "",
	};
}

function resolveKeySource(
	envValue: string | undefined,
	electronValue: string,
	fileValue: string | undefined
): { set: boolean; source: string } {
	if (envValue) return { set: true, source: "environment" };
	if (electronValue) return { set: true, source: "electron" };
	if (fileValue) return { set: true, source: "file" };
	return { set: false, source: "not-set" };
}

const EMPTY_KEYS: ApiKeys = {
	falApiKey: "",
	freesoundApiKey: "",
	geminiApiKey: "",
	openRouterApiKey: "",
	anthropicApiKey: "",
};

// ---------------------------------------------------------------------------
// Tests: AICP credential parsing
// ---------------------------------------------------------------------------

describe("parseAicpCredentials", () => {
	it("returns empty when content is empty", () => {
		expect(parseAicpCredentials("")).toEqual({});
	});

	it("parses FAL_KEY", () => {
		const result = parseAicpCredentials("FAL_KEY=fal_test_123");
		expect(result.falApiKey).toBe("fal_test_123");
	});

	it("parses multiple keys", () => {
		const content =
			"FAL_KEY=fal_abc\nGEMINI_API_KEY=gemini_xyz\nOPENROUTER_API_KEY=or_123";
		const result = parseAicpCredentials(content);
		expect(result.falApiKey).toBe("fal_abc");
		expect(result.geminiApiKey).toBe("gemini_xyz");
		expect(result.openRouterApiKey).toBe("or_123");
	});

	it("ignores comments and blank lines", () => {
		const content =
			"# This is a comment\n\nFAL_KEY=fal_valid\n# Another comment\n";
		const result = parseAicpCredentials(content);
		expect(result.falApiKey).toBe("fal_valid");
		expect(Object.keys(result)).toHaveLength(1);
	});

	it("handles malformed lines gracefully", () => {
		const content = "no_equals_sign\nFAL_KEY=valid_key\nbadline";
		const result = parseAicpCredentials(content);
		expect(result.falApiKey).toBe("valid_key");
	});

	it("handles values with = signs in them", () => {
		const result = parseAicpCredentials("FAL_KEY=fal_key_with=equals=signs");
		expect(result.falApiKey).toBe("fal_key_with=equals=signs");
	});

	it("ignores unknown keys", () => {
		const result = parseAicpCredentials("FAL_KEY=valid\nUNKNOWN_KEY=ignored");
		expect(result.falApiKey).toBe("valid");
		expect(Object.keys(result)).toHaveLength(1);
	});

	it("ignores keys with empty values", () => {
		const result = parseAicpCredentials("FAL_KEY=\nGEMINI_API_KEY=valid");
		expect(result.falApiKey).toBeUndefined();
		expect(result.geminiApiKey).toBe("valid");
	});
});

// ---------------------------------------------------------------------------
// Tests: 3-tier key merging
// ---------------------------------------------------------------------------

describe("mergeKeys (Electron + AICP fallback)", () => {
	it("returns Electron key when both stores have the same key", () => {
		const electron = { ...EMPTY_KEYS, falApiKey: "electron_fal" };
		const aicp = { falApiKey: "aicp_fal" };
		const result = mergeKeys(electron, aicp);
		expect(result.falApiKey).toBe("electron_fal");
	});

	it("returns AICP key when Electron store is empty", () => {
		const result = mergeKeys(EMPTY_KEYS, { falApiKey: "aicp_fal_only" });
		expect(result.falApiKey).toBe("aicp_fal_only");
	});

	it("merges keys from both stores (different keys in each)", () => {
		const electron = { ...EMPTY_KEYS, falApiKey: "electron_fal" };
		const aicp = { geminiApiKey: "aicp_gemini" };
		const result = mergeKeys(electron, aicp);
		expect(result.falApiKey).toBe("electron_fal");
		expect(result.geminiApiKey).toBe("aicp_gemini");
	});

	it("returns empty when both stores are empty", () => {
		const result = mergeKeys(EMPTY_KEYS, {});
		expect(result.falApiKey).toBe("");
		expect(result.geminiApiKey).toBe("");
		expect(result.openRouterApiKey).toBe("");
	});

	it("freesound only comes from Electron (not in AICP map)", () => {
		const electron = { ...EMPTY_KEYS, freesoundApiKey: "fs_key" };
		const result = mergeKeys(electron, {});
		expect(result.freesoundApiKey).toBe("fs_key");
	});
});

// ---------------------------------------------------------------------------
// Tests: Key source resolution (for api-keys:status)
// ---------------------------------------------------------------------------

describe("resolveKeySource (3-tier priority)", () => {
	it("reports 'environment' when env var is set", () => {
		const status = resolveKeySource("env_val", "electron_val", "aicp_val");
		expect(status).toEqual({ set: true, source: "environment" });
	});

	it("reports 'electron' when only Electron store has key", () => {
		const status = resolveKeySource(undefined, "electron_val", undefined);
		expect(status).toEqual({ set: true, source: "electron" });
	});

	it("reports 'file' when only the file tier has a key (AICP or ~/.qcut/.env)", () => {
		const status = resolveKeySource(undefined, "", "aicp_val");
		expect(status).toEqual({ set: true, source: "file" });
	});

	it("reports 'not-set' when no key exists anywhere", () => {
		const status = resolveKeySource(undefined, "", undefined);
		expect(status).toEqual({ set: false, source: "not-set" });
	});

	it("env takes priority over electron and aicp", () => {
		const status = resolveKeySource("env", "electron", "aicp");
		expect(status.source).toBe("environment");
	});

	it("electron takes priority over aicp", () => {
		const status = resolveKeySource(undefined, "electron", "aicp");
		expect(status.source).toBe("electron");
	});
});

// ---------------------------------------------------------------------------
// Tests: AICP credentials path
// ---------------------------------------------------------------------------

describe("getAicpCredentialsPath", () => {
	it("returns path under ~/.config on non-Windows", () => {
		if (process.platform !== "win32") {
			const credPath = getAicpCredentialsPath();
			expect(credPath).toContain(".config");
			expect(credPath).toContain("video-ai-studio");
			expect(credPath).toMatch(/credentials\.env$/);
		}
	});

	it("returns a valid absolute path", () => {
		const credPath = getAicpCredentialsPath();
		expect(path.isAbsolute(credPath)).toBe(true);
	});
});
