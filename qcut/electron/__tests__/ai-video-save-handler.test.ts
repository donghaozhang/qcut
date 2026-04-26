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
			writeFile: (...args: unknown[]) => writeFileMock(...args),
			mkdir: (...args: unknown[]) => mkdirMock(...args),
			access: (...args: unknown[]) => accessMock(...args),
			stat: (...args: unknown[]) => statMock(...args),
			statfs: (...args: unknown[]) => statfsMock(...args),
			unlink: (...args: unknown[]) => unlinkMock(...args),
		},
	};
});

import { saveAIVideoToDisk } from "../ai-video-save-handler";
import { REQUIRED_PROJECT_FOLDERS } from "../lib/project-structure";

const REQUIRED_PROJECT_FOLDERS_LEN = REQUIRED_PROJECT_FOLDERS.length;

// ---- helpers ---------------------------------------------------------------

/**
 * Build a realistic ENOENT error whose `.message` includes a path under the
 * mocked `/mock/Documents` projects base. This is what node's fs throws — and
 * it's the actual surface that the redaction logic has to clean up. Tests
 * that mock a path-less ENOENT pass even when redaction is broken (CodeRabbit
 * #3143145185), so always pass a path.
 */
function enoent(
	filePath = "/mock/Documents/QCut/Projects/proj-1/media/generated/videos/video.mp4"
): NodeJS.ErrnoException {
	return Object.assign(
		new Error(`ENOENT: no such file or directory, open '${filePath}'`),
		{ code: "ENOENT", path: filePath }
	);
}

function tinyVideoBuffer(): ArrayBuffer {
	return new Uint8Array([1, 2, 3, 4]).buffer;
}

const PROJECT_ID = "proj-1";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
// Snapshot the inherited env var (if any) so we can restore it in afterEach.
// `isPathDebugEnabled()` checks `process.env.QCUT_DEBUG_PATHS === "1"` BEFORE
// `app.isPackaged`, so a developer running tests with this set in their shell
// would otherwise make every packaged-mode redaction test pass-through and
// silently lose coverage.
const originalQcutDebugPaths = process.env.QCUT_DEBUG_PATHS;

beforeEach(() => {
	// Force-clear so packaged-mode tests are deterministic regardless of
	// whatever the host shell / CI runner has in its environment.
	delete process.env.QCUT_DEBUG_PATHS;

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
	// Restore (or delete) so suite teardown matches the inherited shell env.
	if (originalQcutDebugPaths === undefined) {
		delete process.env.QCUT_DEBUG_PATHS;
	} else {
		process.env.QCUT_DEBUG_PATHS = originalQcutDebugPaths;
	}
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
		// `ensureProjectStructure` now calls `stat()` per required folder,
		// and the stat guard inside `writeFileWithStatGuard` calls `stat()`
		// once on `projectDir`. So total stats per save = 9 (upfront ensure)
		// + 1 (stat guard) + 1 (verify written file) = 11 minimum.
		//
		// In this scenario the projectDir's stat (the guard) reports missing,
		// triggering a SECOND ensureProjectStructure → 9 more stat calls.
		// Then the verify-written-file stat. Expected ≥ 19 stat calls.
		let statCallIndex = 0;
		statMock.mockImplementation(async () => {
			statCallIndex++;
			// Make the writeFileWithStatGuard stat (call ~10) report missing
			// so the recovery branch fires. Every other call reports a dir.
			if (statCallIndex === REQUIRED_PROJECT_FOLDERS_LEN + 1) {
				throw enoent();
			}
			return {
				isDirectory: () => true,
				isFile: () => true,
				size: 4,
			};
		});
		writeFileMock.mockResolvedValue(undefined);

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(true);
		expect(statMock.mock.calls.length).toBeGreaterThanOrEqual(
			REQUIRED_PROJECT_FOLDERS_LEN * 2 + 1
		);
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
		// Reject every writeFile attempt with an ENOENT whose message embeds
		// the full /mock/Documents path — proving the redaction path actually
		// strips it. (Without a real path in the error, the assertions below
		// pass even when redaction is broken.)
		writeFileMock.mockRejectedValue(enoent());

		const result = await saveAIVideoToDisk({
			fileName: "video.mp4",
			fileData: tinyVideoBuffer(),
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(false);
		// Sanity: the message we returned includes the path token (just
		// proves the test plumbing is wired up — without the next line, this
		// would still pass for a wholly empty error string).
		expect(result.error).toMatch(/Failed to write video file to disk/);
		expect(result.error).toContain("<project>");
		expect(result.error).not.toContain("/mock/Documents");

		// console.error was also called with the redacted message — no
		// /mock/Documents anywhere in production logs.
		const seenInLogs = consoleErrorSpy.mock.calls
			.flat()
			.map((arg) => (typeof arg === "string" ? arg : ""))
			.join("\n");
		expect(seenInLogs).toContain("<project>");
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
		// In dev mode the unredacted absolute path MUST appear so devs can
		// see exactly which path failed. The "<project>" token must NOT be
		// inserted (that's a packaged-build-only substitution).
		expect(result.error).toContain("/mock/Documents");
		expect(result.error).not.toContain("<project>");
	});
});
