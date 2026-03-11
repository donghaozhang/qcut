/**
 * Tests for editor:search:* CLI handler logic.
 * Tests the handleSearchCommand dispatch without requiring a running editor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock EditorApiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockClient = {
	get: mockGet,
	post: mockPost,
	checkHealth: vi.fn().mockResolvedValue(true),
};

// Import after mock setup
import { handleSearchCommand } from "../native-pipeline/editor/editor-handlers-search.js";
import type { CLIRunOptions, CLIResult } from "../native-pipeline/cli/cli-runner/types.js";

const noopProgress = vi.fn();

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "editor:search:query",
		json: true,
		...overrides,
	} as CLIRunOptions;
}

describe("handleSearchCommand", () => {
	beforeEach(() => {
		mockGet.mockReset();
		mockPost.mockReset();
	});

	it("returns error for unknown action", async () => {
		const result = await handleSearchCommand(
			mockClient as any,
			makeOptions({ command: "editor:search:unknown" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown search action");
	});

	describe("editor:search:query", () => {
		it("requires --project-id", async () => {
			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({ command: "editor:search:query" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing --project-id");
		});

		it("requires --query", async () => {
			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({
					command: "editor:search:query",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing --query");
		});

		it("calls correct API endpoint with query params", async () => {
			mockGet.mockResolvedValue({ results: [] });

			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({
					command: "editor:search:query",
					projectId: "p1",
					query: "hello world",
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(mockGet).toHaveBeenCalledTimes(1);
			const url = mockGet.mock.calls[0][0] as string;
			expect(url).toContain("/api/claude/search/p1");
			expect(url).toContain("q=hello+world");
		});

		it("passes optional params", async () => {
			mockGet.mockResolvedValue({ results: [] });

			await handleSearchCommand(
				mockClient as any,
				makeOptions({
					command: "editor:search:query",
					projectId: "p1",
					query: "test",
					caseSensitive: true,
					wholeWord: true,
					maxResults: 10,
					mediaId: "m1",
				} as any),
				noopProgress
			);

			const url = mockGet.mock.calls[0][0] as string;
			expect(url).toContain("caseSensitive=true");
			expect(url).toContain("wholeWord=true");
			expect(url).toContain("maxResults=10");
			expect(url).toContain("mediaId=m1");
		});
	});

	describe("editor:search:status", () => {
		it("requires --project-id", async () => {
			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({ command: "editor:search:status" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing --project-id");
		});

		it("calls correct API endpoint", async () => {
			mockGet.mockResolvedValue({ media: {} });

			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({
					command: "editor:search:status",
					projectId: "p1",
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(mockGet).toHaveBeenCalledWith("/api/claude/search/p1/status");
		});
	});

	describe("editor:search:index", () => {
		it("requires --project-id", async () => {
			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({ command: "editor:search:index" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing --project-id");
		});

		it("calls correct API endpoint", async () => {
			mockPost.mockResolvedValue({ alreadyTranscribed: 0 });

			const result = await handleSearchCommand(
				mockClient as any,
				makeOptions({
					command: "editor:search:index",
					projectId: "p1",
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(mockPost).toHaveBeenCalledWith(
				"/api/claude/search/p1/index",
				{}
			);
		});
	});
});
