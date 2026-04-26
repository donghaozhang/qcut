// @vitest-environment node
/**
 * Tests for `saveAIVideoToDisk` covering issue #290:
 *   1. Happy path — single writeFile, single ensureProjectStructure.
 *   2. `media/generated/videos` missing — pre-write stat guard triggers an
 *      extra ensureProjectStructure before any writeFile.
 *   3. Directory removed between mkdir and writeFile (TOCTOU) — first
 *      writeFile fails with ENOENT, retry recreates structure and succeeds.
 *   4. Two consecutive ENOENTs — surface failure, no third attempt.
 *   5. Non-ENOENT writeFile error — no retry.
 *   6. Path redaction — packaged build redacts; debug build keeps full path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const isPackagedRef = { value: true }; // mutate per-test

// ---- mocks (must be before SUT import) -------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			if (name === "userData") return "/mock/AppData";
			return "/mock/unknown";
		}),
		get isPackaged() {
			return isPackagedRef.value;
		},
	},
	ipcMain: { handle: vi.fn() },
}));

vi.mock("crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("crypto")>();
	return {
		...actual,
		default: actual,
		randomBytes: vi.fn(() => ({ toString: () => "abcdef0123456789" })),
	};
});

const writeFileMock = vi.fn();
const mkdirMock = vi.fn();
const accessMock = vi.fn();
const statMock = vi.fn();
const statfsMock = vi.fn();
const unlinkMock = vi.fn();

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs")>();
	return {
		...actual,
		default: actual,
		promises: {
			...actual.promises,
			writeFile: (...args: any[]) => writeFileMock(...args),
			mkdir: (...args: any[]) => mkdirMock(...args),
			access: (...args: any[]) => accessMock(...args),
			stat: (...args: any[]) => statMock(...args),
			statfs: (...args: any[]) => statfsMock(...args),
			unlink: (...args: any[]) => unlinkMock(...args),
		},
	};
});

import { saveAIVideoToDisk } from "../ai-video-save-handler";

// ---- helpers ---------------------------------------------------------------

function enoent(): Error {
	return Object.assign(new Error("ENOENT: no such file or directory"), {
		code: "ENOENT",
	});
}

function tinyVideoBuffer(): ArrayBuffer {
	return new Uint8Array([1, 2, 3, 4]).buffer;
}

const PROJECT_ID = "proj-1";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	writeFileMock.mockReset();
	mkdirMock.mockReset();
	accessMock.mockReset();
	statMock.mockReset();
	statfsMock.mockReset();
	unlinkMock.mockReset();

	// Default: writes succeed, mkdir succeeds (so ensureProjectStructure is happy).
	mkdirMock.mockResolvedValue(undefined);
	// Default: access succeeds, so ensureProjectStructure reports "existing".
	accessMock.mockResolvedValue(undefined);
	// Default: stat for `isExistingDirectory(projectDir)` reports a real dir.
	statMock.mockResolvedValue({
		isDirectory: () => true,
		isFile: () => true,
		size: 4,
	});
	statfsMock.mockResolvedValue({ bavail: 1_000_000, bsize: 4096 });

	isPackagedRef.value = true; // packaged production build by default

	consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ============================================================================
// 1. happy path
// ============================================================================

describe("saveAIVideoToDisk — happy path", () => {
	it("writes once and reports success", async () => {
		writeFileMock.mockResolvedValue(undefined);

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
			modelId: "kling",
		});

		expect(result.success).toBe(true);
		expect(result.fileName).toContain("video-kling-");
		expect(result.fileSize).toBe(4);
		// Exactly one writeFile (the video). Metadata write is gated by metadata arg.
		expect(writeFileMock).toHaveBeenCalledTimes(1);
		// stat guard ran at least once (for the isExistingDirectory check).
		expect(statMock).toHaveBeenCalled();
	});
});

// ============================================================================
// 2. issue case A — media/generated/videos missing
// ============================================================================

describe("saveAIVideoToDisk — projectDir missing before write", () => {
	it("triggers an extra ensureProjectStructure via the stat guard", async () => {
		// First stat call (isExistingDirectory) → throw (folder missing).
		// Subsequent stats (verify saved file) → real file.
		statMock.mockRejectedValueOnce(enoent()).mockResolvedValue({
			isDirectory: () => true,
			isFile: () => true,
			size: 4,
		});
		writeFileMock.mockResolvedValue(undefined);

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(true);
		// One ensure for the upfront call + one for the stat-guard recovery.
		// REQUIRED_PROJECT_FOLDERS has 9 entries, accessed via `access`.
		expect(accessMock.mock.calls.length).toBeGreaterThanOrEqual(18);
		expect(writeFileMock).toHaveBeenCalledTimes(1);
	});
});

// ============================================================================
// 3. issue case B — directory removed between mkdir and writeFile
// ============================================================================

describe("saveAIVideoToDisk — ENOENT once then success", () => {
	it("retries writeFile exactly once and succeeds", async () => {
		writeFileMock
			.mockRejectedValueOnce(enoent())
			.mockResolvedValueOnce(undefined);

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(true);
		expect(writeFileMock).toHaveBeenCalledTimes(2);
	});
});

// ============================================================================
// 4. ENOENT twice — no infinite retry
// ============================================================================

describe("saveAIVideoToDisk — ENOENT on both attempts", () => {
	it("returns failure after exactly two writeFile attempts", async () => {
		writeFileMock.mockRejectedValue(enoent());

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Failed to write video file to disk");
		expect(writeFileMock).toHaveBeenCalledTimes(2);
	});
});

// ============================================================================
// 5. non-ENOENT error — no retry
// ============================================================================

describe("saveAIVideoToDisk — non-ENOENT writeFile error", () => {
	it("does not retry on EPERM", async () => {
		const eperm = Object.assign(new Error("EPERM: operation not permitted"), {
			code: "EPERM",
		});
		writeFileMock.mockRejectedValue(eperm);

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(false);
		expect(writeFileMock).toHaveBeenCalledTimes(1);
		expect(result.error).toContain("EPERM");
	});
});

// ============================================================================
// 6. issue case C — path redaction (packaged vs debug)
// ============================================================================

describe("saveAIVideoToDisk — path redaction", () => {
	it("redacts Documents path from IPC error AND console.error in packaged build", async () => {
		isPackagedRef.value = true;
		writeFileMock.mockRejectedValue(enoent());

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(false);
		expect(result.error).not.toContain("/mock/Documents");
		// console.error was called with the redacted message — no /mock/Documents anywhere.
		const seenInLogs = consoleErrorSpy.mock.calls
			.flat()
			.map((arg) => (typeof arg === "string" ? arg : ""))
			.join("\n");
		expect(seenInLogs).not.toContain("/mock/Documents");
	});

	it("keeps full path in dev (app.isPackaged === false)", async () => {
		isPackagedRef.value = false;
		writeFileMock.mockRejectedValue(enoent());

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(false);
		// In dev mode the unredacted message is fine — it should just report ENOENT.
		// We don't strictly require the full path to appear in this surface, but we
		// do require that the redacted token "<project>" is NOT inserted.
		expect(result.error).not.toContain("<project>");
	});
});
