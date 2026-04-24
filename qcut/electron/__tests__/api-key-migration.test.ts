import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Resolve the real tmp root BEFORE any vi.mock kicks in. Read env vars
// directly rather than going through os.tmpdir() so the subsequent
// vi.mock(import("node:os")) cannot interfere.
const REAL_TMP_ROOT =
	process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp";

/**
 * ST-3 migration routine — copies AICP-vocab keys from the legacy
 * `credentials.env` into `~/.qcut/.env` on first launch of the unified-file
 * build.
 *
 * Uses a temp HOME per test so the real user's credentials are never touched.
 *
 * ## Safety
 *
 * `rmSync` in afterEach is guarded by `assertSafeTempPath()` — we throw
 * before deleting anything outside `os.tmpdir()`. A previous iteration of
 * this test used `path.dirname(tempDirs.home)` unguarded; if vi.mock
 * replaced `os.tmpdir` with `undefined`, mkdtempSync would silently build
 * relative paths and rmSync would wipe the cwd. The guard below makes that
 * failure mode impossible.
 */

const tempDirs = {
	base: "",
	home: "",
	userData: "",
};

function assertSafeTempPath(p: string): void {
	const resolved = path.resolve(p);
	const normalizedRoot = path.resolve(REAL_TMP_ROOT);
	if (!resolved.startsWith(normalizedRoot + path.sep)) {
		throw new Error(
			`[api-key-migration.test] refusing to rm unsafe path: ${resolved} (expected under ${normalizedRoot})`
		);
	}
	if (resolved === "/" || resolved === path.sep || resolved === normalizedRoot) {
		throw new Error("[api-key-migration.test] refusing to rm filesystem root");
	}
}

vi.mock("electron", () => ({
	app: {
		getPath: (_name: string) => tempDirs.userData,
		getVersion: () => "0.0.0-test",
		isPackaged: false,
	},
	ipcMain: { handle: vi.fn() },
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: vi.fn(),
		decryptString: vi.fn(),
	},
}));

vi.mock("os", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("os");
	return {
		...actual,
		homedir: () => tempDirs.home,
		default: { ...actual, homedir: () => tempDirs.home },
	};
});

vi.mock("node:os", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("node:os");
	return {
		...actual,
		homedir: () => tempDirs.home,
		default: { ...actual, homedir: () => tempDirs.home },
	};
});

let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
	tempDirs.base = fs.mkdtempSync(path.join(REAL_TMP_ROOT, "qcut-migration-"));
	tempDirs.home = path.join(tempDirs.base, "home");
	tempDirs.userData = path.join(tempDirs.base, "userData");
	fs.mkdirSync(tempDirs.home, { recursive: true });
	fs.mkdirSync(tempDirs.userData, { recursive: true });

	originalHome = process.env.HOME;
	originalUserProfile = process.env.USERPROFILE;
	process.env.HOME = tempDirs.home;
	process.env.USERPROFILE = tempDirs.home;
});

afterEach(() => {
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	if (originalUserProfile === undefined) delete process.env.USERPROFILE;
	else process.env.USERPROFILE = originalUserProfile;

	if (tempDirs.base) {
		try {
			assertSafeTempPath(tempDirs.base);
			fs.rmSync(tempDirs.base, { recursive: true, force: true });
		} catch (error) {
			console.error("[api-key-migration.test] cleanup aborted:", error);
			throw error;
		}
	}
	tempDirs.base = "";
	tempDirs.home = "";
	tempDirs.userData = "";
});

import { migrateToSingleEnvFile } from "../api-key-handler";

function writeAicpCredentials(content: string): void {
	const aicpDir = path.join(tempDirs.home, ".config", "video-ai-studio");
	fs.mkdirSync(aicpDir, { recursive: true });
	fs.writeFileSync(path.join(aicpDir, "credentials.env"), content);
}

function writeQcutEnv(content: string): void {
	const qcutDir = path.join(tempDirs.home, ".qcut");
	fs.mkdirSync(qcutDir, { recursive: true });
	fs.writeFileSync(path.join(qcutDir, ".env"), content);
}

function readQcutEnv(): string {
	const p = path.join(tempDirs.home, ".qcut", ".env");
	return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

function markerPath(): string {
	return path.join(tempDirs.userData, ".env-file-unified");
}

describe("migrateToSingleEnvFile", () => {
	it("copies AICP-vocab keys into ~/.qcut/.env on first run and writes marker", () => {
		writeAicpCredentials(
			"FAL_KEY=abc\nGEMINI_API_KEY=xyz\nOPENROUTER_API_KEY=def\n"
		);

		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		const qcutEnv = readQcutEnv();
		expect(qcutEnv).toContain("FAL_KEY=abc");
		expect(qcutEnv).toContain("GEMINI_API_KEY=xyz");
		expect(qcutEnv).toContain("OPENROUTER_API_KEY=def");
		expect(fs.existsSync(markerPath())).toBe(true);
	});

	it("is idempotent — second call is a no-op (marker contents unchanged)", async () => {
		writeAicpCredentials("FAL_KEY=first\n");

		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });
		const firstMarker = fs.readFileSync(markerPath(), "utf-8");
		const firstContents = readQcutEnv();

		await new Promise((r) => setTimeout(r, 10));

		// Even if credentials.env changes, the marker prevents re-migration.
		writeAicpCredentials("FAL_KEY=second\n");
		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		expect(fs.readFileSync(markerPath(), "utf-8")).toBe(firstMarker);
		expect(readQcutEnv()).toBe(firstContents);
	});

	it("never overwrites an existing ~/.qcut/.env value", () => {
		writeQcutEnv("FAL_KEY=preexisting\n");
		writeAicpCredentials("FAL_KEY=from-aicp\n");

		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		const qcutEnv = readQcutEnv();
		expect(qcutEnv).toContain("FAL_KEY=preexisting");
		expect(qcutEnv).not.toContain("from-aicp");
	});

	it("only copies keys in the AICP vocabulary (non-AICP keys are ignored)", () => {
		writeAicpCredentials(
			"FAL_KEY=fal\nGEMINI_API_KEY=gem\nCUSTOM_USER_KEY=ignored\nELEVENLABS_API_KEY=also-ignored\n"
		);

		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		const qcutEnv = readQcutEnv();
		expect(qcutEnv).toContain("FAL_KEY=fal");
		expect(qcutEnv).toContain("GEMINI_API_KEY=gem");
		// Non-AICP-vocab keys found in credentials.env must NOT cross over.
		expect(qcutEnv).not.toContain("CUSTOM_USER_KEY");
		expect(qcutEnv).not.toContain("also-ignored");
	});

	it("still writes the marker when credentials.env is missing", () => {
		// Fresh install with neither file — marker should still be written so
		// subsequent launches skip the migration check.
		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		expect(fs.existsSync(markerPath())).toBe(true);
		expect(readQcutEnv()).toBe("");
	});

	it("creates the userData dir if missing (first-launch edge case)", () => {
		fs.rmSync(tempDirs.userData, { recursive: true });
		writeAicpCredentials("FAL_KEY=fresh\n");

		migrateToSingleEnvFile({ userDataDir: tempDirs.userData });

		expect(fs.existsSync(markerPath())).toBe(true);
		expect(readQcutEnv()).toContain("FAL_KEY=fresh");
	});

	it("skips migration and does not throw when userDataDir is empty", () => {
		writeAicpCredentials("FAL_KEY=will-not-migrate\n");

		expect(() =>
			migrateToSingleEnvFile({ userDataDir: "" })
		).not.toThrow();
		expect(readQcutEnv()).toBe("");
	});
});
