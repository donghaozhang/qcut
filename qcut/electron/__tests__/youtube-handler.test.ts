import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CLIRunOptions, ProgressFn } from "../native-pipeline/cli/cli-runner/types.js";

// Mock fs module
vi.mock("fs", () => ({
	existsSync: vi.fn(),
	statSync: vi.fn(),
	openSync: vi.fn(),
	readSync: vi.fn(),
	closeSync: vi.fn(),
	readFileSync: vi.fn(),
}));

// Mock key-manager
vi.mock("../native-pipeline/infra/key-manager.js", () => ({
	getKey: vi.fn(),
}));

import * as fs from "fs";
import { getKey } from "../native-pipeline/infra/key-manager.js";
import { handleYouTubeUpload } from "../native-pipeline/cli/cli-handlers-youtube.js";

const mockProgress: ProgressFn = vi.fn();

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "youtube:upload",
		outputDir: "./output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...overrides,
	};
}

describe("handleYouTubeUpload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns error when --input is missing", async () => {
		const result = await handleYouTubeUpload(
			makeOptions({ title: "Test" }),
			mockProgress,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("returns error when --title is missing", async () => {
		const result = await handleYouTubeUpload(
			makeOptions({ input: "video.mp4" }),
			mockProgress,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--title");
	});

	it("returns error when file does not exist", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await handleYouTubeUpload(
			makeOptions({ input: "nonexistent.mp4", title: "Test" }),
			mockProgress,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("File not found");
	});

	it("returns error for unsupported format", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);

		const result = await handleYouTubeUpload(
			makeOptions({ input: "video.flv", title: "Test" }),
			mockProgress,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unsupported format");
	});

	it("returns error when not authenticated", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
		vi.mocked(getKey).mockReturnValue(undefined);
		// Clear env
		delete process.env.QCUT_AUTH_TOKEN;

		const result = await handleYouTubeUpload(
			makeOptions({ input: "video.mp4", title: "Test" }),
			mockProgress,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Not authenticated");
	});
});
