import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter } from "../utils/http-router";
import { registerAnalysisRoutes } from "../http/claude-http-analysis-routes";

vi.mock("../handlers/claude-analyze-handler.js", () => ({
	analyzeVideo: vi.fn(async () => ({ success: true })),
	listAnalyzeModels: vi.fn(async () => []),
}));

vi.mock("../handlers/claude-transcribe-handler.js", () => ({
	transcribeMedia: vi.fn(async () => ({ words: [], duration: 0 })),
	startTranscribeJob: vi.fn(() => ({ jobId: "transcribe_job_1" })),
	getTranscribeJobStatus: vi.fn(() => null),
	listTranscribeJobs: vi.fn(() => []),
	cancelTranscribeJob: vi.fn(() => false),
}));

vi.mock("../handlers/claude-scene-handler.js", () => ({
	detectScenes: vi.fn(async () => ({ scenes: [] })),
}));

vi.mock("../handlers/claude-vision-handler.js", () => ({
	analyzeFrames: vi.fn(async () => ({ frames: [] })),
}));

vi.mock("../handlers/claude-filler-handler.js", () => ({
	analyzeFillers: vi.fn(async () => ({
		fillers: [],
		silences: [],
		totalFillerTime: 0,
		totalSilenceTime: 0,
	})),
}));

vi.mock("../handlers/claude-cuts-handler.js", () => ({
	executeBatchCuts: vi.fn(async () => ({
		cutsApplied: 0,
		elementsRemoved: 0,
		remainingElements: [],
		totalRemovedDuration: 0,
	})),
}));

vi.mock("../handlers/claude-range-handler.js", () => ({
	executeDeleteRange: vi.fn(async () => ({
		deletedElements: 0,
		splitElements: 0,
		totalRemovedDuration: 0,
	})),
}));

vi.mock("../handlers/claude-auto-edit-handler.js", () => ({
	autoEdit: vi.fn(async () => ({
		transcription: { wordCount: 0, duration: 0 },
		analysis: {
			fillerCount: 0,
			silenceCount: 0,
			totalFillerTime: 0,
			totalSilenceTime: 0,
		},
		cuts: [],
		applied: false,
	})),
	startAutoEditJob: vi.fn(() => ({ jobId: "local_job_1" })),
	getAutoEditJobStatus: vi.fn(() => null),
	listAutoEditJobs: vi.fn(() => []),
	cancelAutoEditJob: vi.fn(() => false),
}));

vi.mock("../handlers/claude-suggest-handler.js", () => ({
	suggestCuts: vi.fn(async () => ({ suggestions: [] })),
	startSuggestJob: vi.fn(() => ({ jobId: "suggest_job_1" })),
	getSuggestJobStatus: vi.fn(() => null),
	listSuggestJobs: vi.fn(() => []),
	cancelSuggestJob: vi.fn(() => false),
}));

vi.mock("../claude-operation-log.js", () => ({
	logOperation: vi.fn(),
}));

vi.mock("../handlers/claude-media-handler.js", () => ({
	getMediaInfo: vi.fn(async () => null),
}));

import * as autoEditHandler from "../handlers/claude-auto-edit-handler.js";
import * as cutsHandler from "../handlers/claude-cuts-handler.js";
import * as rangeHandler from "../handlers/claude-range-handler.js";

function createFetch({
	getPort,
}: {
	getPort: () => number;
}): (
	path: string,
	options?: {
		method?: string;
		body?: string;
		headers?: Record<string, string>;
	}
) => Promise<{
	status: number;
	body: unknown;
}> {
	return async (path, options) => {
		const requestOptions = options ?? {};
		return await new Promise((resolve, reject) => {
			const req = http.request(
				{
					hostname: "127.0.0.1",
					port: getPort(),
					path,
					method: requestOptions.method ?? "GET",
					headers: {
						"Content-Type": "application/json",
						...(requestOptions.body
							? {
									"Content-Length": Buffer.byteLength(requestOptions.body),
								}
							: {}),
						...(requestOptions.headers ?? {}),
					},
				},
				(res) => {
					let data = "";
					res.on("data", (chunk) => {
						data += chunk;
					});
					res.on("end", () => {
						try {
							resolve({
								status: res.statusCode ?? 0,
								body: JSON.parse(data),
							});
						} catch {
							resolve({
								status: res.statusCode ?? 0,
								body: data,
							});
						}
					});
				}
			);
			req.on("error", reject);
			if (requestOptions.body) {
				req.write(requestOptions.body);
			}
			req.end();
		});
	};
}

let server: http.Server | null = null;
let serverPort = 0;

afterEach(async () => {
	if (!server) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server?.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
	server = null;
	serverPort = 0;
	vi.clearAllMocks();
});

async function startRoutesServer({
	accessor,
}: {
	accessor: {
		getWindow: () => Electron.BrowserWindow;
		executeBatchCuts?: (request: {
			elementId: string;
			cuts: Array<{ start: number; end: number }>;
			ripple?: boolean;
		}) => Promise<unknown>;
		executeDeleteRange?: (request: {
			startTime: number;
			endTime: number;
			trackIds?: string[];
			ripple?: boolean;
			crossTrackRipple?: boolean;
		}) => Promise<unknown>;
		startAutoEditJob?: (
			projectId: string,
			request: {
				elementId: string;
				mediaId: string;
				removeFillers?: boolean;
				removeSilences?: boolean;
				silenceThreshold?: number;
				keepSilencePadding?: number;
				dryRun?: boolean;
				provider?: "elevenlabs" | "gemini";
				language?: string;
			}
		) => Promise<{ jobId: string }>;
		getAutoEditJobStatus?: (jobId: string) => Promise<unknown>;
		listAutoEditJobs?: () => Promise<unknown[]>;
		cancelAutoEditJob?: (jobId: string) => Promise<boolean>;
	};
}): Promise<{
	fetchJson: ReturnType<typeof createFetch>;
}> {
	const router = createRouter();
	registerAnalysisRoutes(router, accessor);

	server = http.createServer((req, res) => {
		router.handle(req, res);
	});
	serverPort = 20_000 + Math.floor(Math.random() * 1000);

	await new Promise<void>((resolve, reject) => {
		if (!server) {
			reject(new Error("Server was not initialized"));
			return;
		}

		const handleError = (error: Error) => {
			server?.off("error", handleError);
			reject(error);
		};
		server.once("error", handleError);
		server.listen(serverPort, "127.0.0.1", () => {
			server?.off("error", handleError);
			resolve();
		});
	});

	return {
		fetchJson: createFetch({
			getPort: () => serverPort,
		}),
	};
}

describe("registerAnalysisRoutes proxy hooks", () => {
	it("uses accessor.startAutoEditJob when provided", async () => {
		const mockWindow = {
			webContents: { send: vi.fn() },
		} as unknown as Electron.BrowserWindow;
		const startAutoEditJobProxy = vi.fn(async () => ({ jobId: "proxy_job_1" }));

		const { fetchJson } = await startRoutesServer({
			accessor: {
				getWindow: () => mockWindow,
				startAutoEditJob: startAutoEditJobProxy,
			},
		});

		const response = await fetchJson("/api/claude/timeline/proj_1/auto-edit/start", {
			method: "POST",
			body: JSON.stringify({
				elementId: "el_1",
				mediaId: "media_1",
				removeFillers: true,
			}),
		});

		expect(response.status).toBe(200);
		expect((response.body as { success: boolean }).success).toBe(true);
		expect(
			(response.body as { data: { jobId: string } }).data.jobId
		).toBe("proxy_job_1");
		expect(startAutoEditJobProxy).toHaveBeenCalledWith(
			"proj_1",
			expect.objectContaining({
				elementId: "el_1",
				mediaId: "media_1",
				removeFillers: true,
			})
		);
		expect(autoEditHandler.startAutoEditJob).not.toHaveBeenCalled();
	});

	it("uses accessor.executeBatchCuts when provided", async () => {
		const mockWindow = {
			webContents: { send: vi.fn() },
		} as unknown as Electron.BrowserWindow;
		const executeBatchCutsProxy = vi.fn(async () => ({
			cutsApplied: 1,
			elementsRemoved: 1,
			remainingElements: [],
			totalRemovedDuration: 1.2,
		}));

		const { fetchJson } = await startRoutesServer({
			accessor: {
				getWindow: () => mockWindow,
				executeBatchCuts: executeBatchCutsProxy,
			},
		});

		const response = await fetchJson("/api/claude/timeline/proj_1/cuts", {
			method: "POST",
			body: JSON.stringify({
				elementId: "el_1",
				cuts: [{ start: 1.0, end: 2.2 }],
				ripple: true,
			}),
		});

		expect(response.status).toBe(200);
		expect((response.body as { success: boolean }).success).toBe(true);
		expect(executeBatchCutsProxy).toHaveBeenCalledWith({
			elementId: "el_1",
			cuts: [{ start: 1.0, end: 2.2 }],
			ripple: true,
		});
		expect(cutsHandler.executeBatchCuts).not.toHaveBeenCalled();
	});

	it("uses accessor.executeDeleteRange when provided", async () => {
		const mockWindow = {
			webContents: { send: vi.fn() },
		} as unknown as Electron.BrowserWindow;
		const executeDeleteRangeProxy = vi.fn(async () => ({
			deletedElements: 2,
			splitElements: 1,
			totalRemovedDuration: 3.5,
		}));

		const { fetchJson } = await startRoutesServer({
			accessor: {
				getWindow: () => mockWindow,
				executeDeleteRange: executeDeleteRangeProxy,
			},
		});

		const response = await fetchJson("/api/claude/timeline/proj_1/range", {
			method: "DELETE",
			body: JSON.stringify({
				startTime: 4,
				endTime: 7.5,
				trackIds: ["track_1"],
			}),
		});

		expect(response.status).toBe(200);
		expect((response.body as { success: boolean }).success).toBe(true);
		expect(executeDeleteRangeProxy).toHaveBeenCalledWith({
			startTime: 4,
			endTime: 7.5,
			trackIds: ["track_1"],
			ripple: undefined,
			crossTrackRipple: undefined,
		});
		expect(rangeHandler.executeDeleteRange).not.toHaveBeenCalled();
	});
});
