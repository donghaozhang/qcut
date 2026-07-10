import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleGenerateExportCommand } from "../native-pipeline/editor/editor-handlers-generate.js";
import { handleAnalysisCommand } from "../native-pipeline/editor/editor-handlers-analysis.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import {
	mockRoute,
	clearRoutes,
	installFetchMock,
	makeOpts,
	noopProgress,
	originalFetch,
	BASE_URL,
	lastCapturedBody,
} from "./editor-cli-test-setup";

// ---------------------------------------------------------------------------
// Generate handlers — uncovered actions
// ---------------------------------------------------------------------------

describe("Generate handlers — uncovered actions", () => {
	let client: EditorApiClient;

	beforeAll(() => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	describe("generate:list-jobs", () => {
		it("requires project-id", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:generate:list-jobs" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("calls GET on jobs endpoint", async () => {
			mockRoute("GET", "/api/claude/generate/p1/jobs", {
				success: true,
				data: { jobs: [{ jobId: "gj1", status: "completed" }] },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:list-jobs",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("generate:start sends all optional fields", () => {
		it("includes imageUrl, duration, aspectRatio in body", async () => {
			mockRoute("POST", "/api/claude/generate/p1/start", {
				success: true,
				data: { jobId: "gj3" },
			});
			await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:start",
					projectId: "p1",
					model: "kling_pro",
					text: "A sunset",
					imageUrl: "https://example.com/ref.jpg",
					duration: "5",
					aspectRatio: "16:9",
				}),
				noopProgress
			);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.model).toBe("kling_pro");
			expect(body.prompt).toBe("A sunset");
			expect(body.imageUrl).toBe("https://example.com/ref.jpg");
			expect(body.duration).toBe(5);
			expect(body.aspectRatio).toBe("16:9");
		});
	});

	describe("generate:start requires prompt or text", () => {
		it("fails when neither --prompt nor --text provided", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:start",
					projectId: "p1",
					model: "flux_dev",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--prompt");
		});
	});

	describe("export:status requires job-id", () => {
		it("requires job-id", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:status",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--job-id");
		});
	});

	describe("export:start video frame rate", () => {
		it("forwards a supported --fps value", async () => {
			mockRoute("POST", "/api/claude/export/p1/start", {
				success: true,
				data: { jobId: "ej1" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:start",
					projectId: "p1",
					fps: 24,
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(JSON.parse(lastCapturedBody!).fps).toBe(24);
		});

		it("rejects unsupported frame rates", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:start",
					projectId: "p1",
					fps: 29,
				}),
				noopProgress
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("24, 25, 30, 50, 60");
		});
	});

	describe("standalone export commands", () => {
		it("configures an MP3 job with bitrate and sample rate", async () => {
			mockRoute("POST", "/api/claude/export/p1/start", {
				success: true,
				data: { jobId: "audio1" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:audio",
					projectId: "p1",
					bitrate: 320,
					sampleRate: 48_000,
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.format).toBe("mp3");
			expect(body.audioExportConfig).toEqual({
				bitrate: 320,
				sampleRate: 48_000,
				channels: 2,
			});
		});
	});

	describe("unknown generate/export/diagnostics/mcp action", () => {
		it("unknown generate action", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:generate:nonexistent" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown generate action");
		});

		it("unknown export action", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:export:nonexistent" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown export action");
		});

		it("unknown diagnostics action", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:diagnostics:nonexistent" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown diagnostics action");
		});

		it("unknown mcp action", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:mcp:nonexistent" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown mcp action");
		});

		it("unknown module falls through", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:unknown:action" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown module");
		});
	});
});

// ---------------------------------------------------------------------------
// Analysis handlers — edge cases
// ---------------------------------------------------------------------------

describe("Analysis handlers — edge cases", () => {
	let client: EditorApiClient;

	beforeAll(() => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	describe("analyze:video requires source", () => {
		it("fails when source is missing", async () => {
			const result = await handleAnalysisCommand(
				client,
				makeOpts({
					command: "editor:analyze:video",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--source");
		});
	});

	describe("analyze:frames requires media-id", () => {
		it("fails without media-id", async () => {
			const result = await handleAnalysisCommand(
				client,
				makeOpts({
					command: "editor:analyze:frames",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--media-id");
		});
	});

	describe("unknown analyze action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleAnalysisCommand(
				client,
				makeOpts({
					command: "editor:analyze:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown analyze action");
		});
	});

	describe("unknown transcribe action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleAnalysisCommand(
				client,
				makeOpts({
					command: "editor:transcribe:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown transcribe action");
		});
	});

	describe("unknown module in analysis handler", () => {
		it("returns error for unknown module", async () => {
			const result = await handleAnalysisCommand(
				client,
				makeOpts({ command: "editor:unknown:action" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown module");
		});
	});
});
