import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `buildSpawnEnvironment` + AICP vocabulary centralisation.
 * Verifies the env-injection contract implemented for ST-2 of the
 * ONE-ENV-FILE plan.
 */

const mocks = vi.hoisted(() => {
	return {
		decryptedKeys: {
			falApiKey: "",
			freesoundApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
			anthropicApiKey: "",
			elevenLabsApiKey: "",
			gmiApiKey: "",
			runwayApiKey: "",
		} as Record<string, string>,
		mockGetDecryptedApiKeys: vi.fn(),
	};
});

mocks.mockGetDecryptedApiKeys.mockImplementation(
	async () => mocks.decryptedKeys
);

vi.mock("electron", () => ({
	app: {
		getPath: () => "/tmp",
		getVersion: () => "0.0.0-test",
		isPackaged: false,
	},
}));

vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: mocks.mockGetDecryptedApiKeys,
}));

import {
	buildSpawnEnvironment,
	commandRequiresFalKey,
	commandSupportsOutputDir,
} from "../ai-pipeline-handler/command-builder";
import {
	AICP_ENV_MAP,
	QCUT_ENV_MAP,
	getAicpKeyNames,
	getQcutEnvKeyNames,
} from "../api-key-vocabulary";

function resetStoredKeys() {
	for (const field of Object.keys(mocks.decryptedKeys)) {
		mocks.decryptedKeys[field] = "";
	}
}

const ENV_KEYS_TO_CLEAN = [...Object.values(QCUT_ENV_MAP), "FAL_API_KEY"];

function snapshotEnv(): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const key of ENV_KEYS_TO_CLEAN) {
		out[key] = process.env[key];
	}
	return out;
}

function restoreEnv(snap: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(snap)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
	envSnapshot = snapshotEnv();
	for (const key of ENV_KEYS_TO_CLEAN) {
		delete process.env[key];
	}
	resetStoredKeys();
	mocks.mockGetDecryptedApiKeys.mockClear();
});

afterEach(() => {
	restoreEnv(envSnapshot);
});

describe("api-key-vocabulary", () => {
	it("AICP vocabulary is the 3-key subset of the full vocab", () => {
		expect(getAicpKeyNames()).toEqual(
			expect.arrayContaining([
				"FAL_KEY",
				"GEMINI_API_KEY",
				"OPENROUTER_API_KEY",
			])
		);
		expect(getAicpKeyNames()).toHaveLength(3);
		for (const name of getAicpKeyNames()) {
			expect(getQcutEnvKeyNames()).toContain(name);
		}
	});

	it("full vocabulary covers every GUI-managed field", () => {
		// 9 keys: original 8 + IMAROUTER_API_KEY added when the IMA Router
		// provider was wired in. Bump again whenever a new field lands in
		// `ApiKeys` / `QCUT_ENV_MAP`.
		expect(getQcutEnvKeyNames()).toHaveLength(9);
		expect(Object.keys(QCUT_ENV_MAP)).toHaveLength(9);
	});

	it("AICP vocabulary stays a strict subset (adding keys should not accidentally promote to AICP)", () => {
		for (const field of Object.keys(AICP_ENV_MAP)) {
			expect(AICP_ENV_MAP[field as keyof typeof AICP_ENV_MAP]).toBe(
				QCUT_ENV_MAP[field as keyof typeof QCUT_ENV_MAP]
			);
		}
	});
});

describe("buildSpawnEnvironment", () => {
	it("injects every stored key into spawn env", async () => {
		mocks.decryptedKeys.falApiKey = "fal-value";
		mocks.decryptedKeys.geminiApiKey = "gemini-value";
		mocks.decryptedKeys.openRouterApiKey = "openrouter-value";
		mocks.decryptedKeys.anthropicApiKey = "anthropic-value";
		mocks.decryptedKeys.elevenLabsApiKey = "elevenlabs-value";
		mocks.decryptedKeys.gmiApiKey = "gmi-value";
		mocks.decryptedKeys.runwayApiKey = "runway-value";
		mocks.decryptedKeys.freesoundApiKey = "freesound-value";

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("fal-value");
		expect(env.GEMINI_API_KEY).toBe("gemini-value");
		expect(env.OPENROUTER_API_KEY).toBe("openrouter-value");
		expect(env.ANTHROPIC_API_KEY).toBe("anthropic-value");
		expect(env.ELEVENLABS_API_KEY).toBe("elevenlabs-value");
		expect(env.GMI_API_KEY).toBe("gmi-value");
		expect(env.RUNWAY_API_KEY).toBe("runway-value");
		expect(env.FREESOUND_API_KEY).toBe("freesound-value");
	});

	it("sets FAL_API_KEY sibling alongside FAL_KEY", async () => {
		mocks.decryptedKeys.falApiKey = "fal-with-sibling";

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("fal-with-sibling");
		expect(env.FAL_API_KEY).toBe("fal-with-sibling");
	});

	it("does not overwrite process.env values (process.env wins)", async () => {
		process.env.FAL_KEY = "from-shell";
		process.env.GEMINI_API_KEY = "shell-gemini";
		mocks.decryptedKeys.falApiKey = "from-stored";
		mocks.decryptedKeys.geminiApiKey = "stored-gemini";

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("from-shell");
		expect(env.GEMINI_API_KEY).toBe("shell-gemini");
	});

	it("mirrors shell FAL_KEY to FAL_API_KEY sibling (never emits conflicting pair)", async () => {
		// Preserves the sibling contract even when the primary came from the
		// shell — AICP binaries that read FAL_API_KEY still find the value.
		process.env.FAL_KEY = "from-shell";
		mocks.decryptedKeys.falApiKey = "from-stored";

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("from-shell");
		// Sibling populated from the same shell value, NOT from stored.
		expect(env.FAL_API_KEY).toBe("from-shell");
	});

	it("leaves an already-set FAL_API_KEY sibling alone", async () => {
		process.env.FAL_KEY = "from-shell";
		process.env.FAL_API_KEY = "sibling-already-set";
		mocks.decryptedKeys.falApiKey = "from-stored";

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("from-shell");
		expect(env.FAL_API_KEY).toBe("sibling-already-set");
	});

	it("leaves unset keys absent when stored values are empty", async () => {
		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBeUndefined();
		expect(env.GEMINI_API_KEY).toBeUndefined();
		expect(env.OPENROUTER_API_KEY).toBeUndefined();
	});

	it("survives getDecryptedApiKeys throwing (console.warn, falls back to plain process.env)", async () => {
		process.env.FAL_KEY = "shell-fallback";
		mocks.mockGetDecryptedApiKeys.mockRejectedValueOnce(new Error("boom"));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const env = await buildSpawnEnvironment();

		expect(env.FAL_KEY).toBe("shell-fallback");
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("inherits arbitrary process.env values untouched", async () => {
		process.env.UNRELATED_VAR = "unrelated-value";

		const env = await buildSpawnEnvironment();

		expect(env.UNRELATED_VAR).toBe("unrelated-value");
		delete process.env.UNRELATED_VAR;
	});
});

describe("speech pipeline command support", () => {
	it("gives generated speech an output directory and FAL credentials", () => {
		expect(commandSupportsOutputDir({ command: "generate-speech" })).toBe(true);
		expect(commandRequiresFalKey({ command: "generate-speech" })).toBe(true);
	});
});
