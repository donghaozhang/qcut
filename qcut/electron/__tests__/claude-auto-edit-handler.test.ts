import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow } from "electron";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			if (name === "temp") return "/mock/temp";
			return "/mock/unknown";
		}),
		getVersion: vi.fn(() => "0.0.1-test"),
		isPackaged: false,
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: vi.fn(() => []),
		fromWebContents: vi.fn(() => null),
	},
}));

vi.mock("electron-log", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	log: vi.fn(),
}));

const { mockTranscribeMedia, mockAnalyzeFillers, mockExecuteBatchCuts } =
	vi.hoisted(() => ({
		mockTranscribeMedia: vi.fn(),
		mockAnalyzeFillers: vi.fn(),
		mockExecuteBatchCuts: vi.fn(),
	}));

vi.mock("../claude/handlers/claude-transcribe-handler", () => ({
	transcribeMedia: mockTranscribeMedia,
}));

vi.mock("../claude/handlers/claude-filler-handler", () => ({
	analyzeFillers: mockAnalyzeFillers,
}));

vi.mock("../claude/handlers/claude-cuts-handler", () => ({
	executeBatchCuts: mockExecuteBatchCuts,
	validateBatchCutRequest: vi.fn(),
}));

vi.mock("../claude/handlers/claude-timeline-handler", () => ({
	requestTimelineFromRenderer: vi.fn().mockRejectedValue(new Error("no win")),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
	autoEdit,
	mergeCutIntervals,
	startAutoEditJob,
	getAutoEditJobStatus,
	listAutoEditJobs,
	cancelAutoEditJob,
	_clearAutoEditJobs,
} from "../claude/handlers/claude-auto-edit-handler";
import { HttpError } from "../claude/utils/http-router";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const makeTranscriptionResult = () => ({
	words: [
		{ text: "Hello", start: 0.0, end: 0.5, type: "word" as const },
		{ text: " ", start: 0.5, end: 0.6, type: "spacing" as const },
		{ text: "um", start: 0.6, end: 0.9, type: "word" as const },
		{ text: " ", start: 0.9, end: 1.0, type: "spacing" as const },
		{ text: "world", start: 1.0, end: 1.5, type: "word" as const },
		{ text: " ", start: 1.5, end: 3.5, type: "spacing" as const },
		{ text: "thanks", start: 3.5, end: 4.0, type: "word" as const },
	],
	segments: [],
	language: "en",
	duration: 4.0,
});

const makeFillerResult = () => ({
	fillers: [{ word: "um", start: 0.6, end: 0.9, reason: "filler word" }],
	silences: [{ start: 1.5, end: 3.5, duration: 2.0 }],
	totalFillerTime: 0.3,
	totalSilenceTime: 2.0,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("claude-auto-edit-handler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTranscribeMedia.mockResolvedValue(makeTranscriptionResult());
		mockAnalyzeFillers.mockResolvedValue(makeFillerResult());
		mockExecuteBatchCuts.mockResolvedValue({
			cutsApplied: 2,
			elementsRemoved: 2,
			remainingElements: [],
			totalRemovedDuration: 2.0,
		});
	});

	describe("mergeCutIntervals", () => {
		it("returns empty array for empty input", () => {
			expect(mergeCutIntervals([])).toEqual([]);
		});

		it("returns single element unchanged", () => {
			const cuts = [{ start: 1, end: 3, reason: "test" }];
			expect(mergeCutIntervals(cuts)).toEqual(cuts);
		});

		it("merges overlapping intervals", () => {
			const cuts = [
				{ start: 1, end: 4, reason: "a" },
				{ start: 3, end: 6, reason: "b" },
			];
			const merged = mergeCutIntervals(cuts);
			expect(merged).toHaveLength(1);
			expect(merged[0].start).toBe(1);
			expect(merged[0].end).toBe(6);
		});

		it("merges adjacent intervals", () => {
			const cuts = [
				{ start: 1, end: 3, reason: "a" },
				{ start: 3, end: 5, reason: "b" },
			];
			const merged = mergeCutIntervals(cuts);
			expect(merged).toHaveLength(1);
			expect(merged[0].start).toBe(1);
			expect(merged[0].end).toBe(5);
		});

		it("does not merge non-overlapping intervals", () => {
			const cuts = [
				{ start: 1, end: 3, reason: "a" },
				{ start: 5, end: 7, reason: "b" },
			];
			const merged = mergeCutIntervals(cuts);
			expect(merged).toHaveLength(2);
		});

		it("sorts unsorted input before merging", () => {
			const cuts = [
				{ start: 5, end: 7, reason: "b" },
				{ start: 1, end: 6, reason: "a" },
			];
			const merged = mergeCutIntervals(cuts);
			expect(merged).toHaveLength(1);
			expect(merged[0].start).toBe(1);
			expect(merged[0].end).toBe(7);
		});
	});

	describe("autoEdit", () => {
		it("rejects missing elementId", async () => {
			await expect(
				autoEdit("proj_1", { elementId: "", mediaId: "m1" })
			).rejects.toThrow("Missing 'elementId'");
		});

		it("rejects missing mediaId", async () => {
			await expect(
				autoEdit("proj_1", { elementId: "e1", mediaId: "" })
			).rejects.toThrow("Missing 'mediaId'");
		});

		it("returns dry run results without executing cuts", async () => {
			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				dryRun: true,
			});

			expect(result.applied).toBe(false);
			expect(result.result).toBeUndefined();
			expect(result.cuts.length).toBeGreaterThan(0);
			expect(result.transcription.wordCount).toBe(7);
			expect(result.transcription.duration).toBe(4.0);
			expect(result.analysis.fillerCount).toBe(1);
			expect(result.analysis.silenceCount).toBe(1);
			expect(mockExecuteBatchCuts).not.toHaveBeenCalled();
		});

		it("builds cuts from fillers", async () => {
			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				removeFillers: true,
				removeSilences: false,
				dryRun: true,
			});

			// Should have one filler cut
			expect(result.cuts.some((c) => c.reason.includes("filler"))).toBe(true);
			expect(result.cuts.every((c) => !c.reason.includes("silence"))).toBe(
				true
			);
		});

		it("builds cuts from silences with padding", async () => {
			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				removeFillers: false,
				removeSilences: true,
				keepSilencePadding: 0.3,
				dryRun: true,
			});

			expect(result.cuts.some((c) => c.reason.includes("silence"))).toBe(true);
			// Silence is 1.5-3.5, with 0.3 padding: 1.8-3.2
			const silenceCut = result.cuts.find((c) => c.reason.includes("silence"));
			expect(silenceCut).toBeDefined();
			expect(silenceCut!.start).toBeCloseTo(1.8, 1);
			expect(silenceCut!.end).toBeCloseTo(3.2, 1);
		});

		it("skips silences below threshold", async () => {
			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				removeFillers: false,
				removeSilences: true,
				silenceThreshold: 5.0, // Higher than the 2s silence
				dryRun: true,
			});

			expect(result.cuts).toHaveLength(0);
		});

		it("does not execute when no cuts are generated", async () => {
			mockAnalyzeFillers.mockResolvedValue({
				fillers: [],
				silences: [],
				totalFillerTime: 0,
				totalSilenceTime: 0,
			});

			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				dryRun: false,
			});

			expect(result.applied).toBe(false);
			expect(mockExecuteBatchCuts).not.toHaveBeenCalled();
		});

		it("rejects when editor window is not ready for cut execution", async () => {
			const mockWindow = {
				isDestroyed: () => false,
				webContents: {
					send: vi.fn(),
					isDestroyed: () => true,
				},
			} as unknown as BrowserWindow;

			await expect(
				autoEdit(
					"proj_1",
					{
						elementId: "el_1",
						mediaId: "media_1",
						dryRun: false,
					},
					mockWindow
				)
			).rejects.toThrow("Editor window not ready");
			expect(mockExecuteBatchCuts).not.toHaveBeenCalled();
		});

		it("calls transcribeMedia with correct parameters", async () => {
			await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				provider: "gemini",
				language: "en",
				dryRun: true,
			});

			expect(mockTranscribeMedia).toHaveBeenCalledWith("proj_1", {
				mediaId: "media_1",
				provider: "gemini",
				language: "en",
			});
		});

		it("returns analysis summary even on dry run", async () => {
			const result = await autoEdit("proj_1", {
				elementId: "el_1",
				mediaId: "media_1",
				dryRun: true,
			});

			expect(result.analysis.totalFillerTime).toBe(0.3);
			expect(result.analysis.totalSilenceTime).toBe(2.0);
		});
	});
});

// ---------------------------------------------------------------------------
// Async Job Tracking Tests
// ---------------------------------------------------------------------------

describe("auto-edit async jobs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		_clearAutoEditJobs();
		mockTranscribeMedia.mockResolvedValue(makeTranscriptionResult());
		mockAnalyzeFillers.mockResolvedValue(makeFillerResult());
		mockExecuteBatchCuts.mockResolvedValue({
			cutsApplied: 2,
			elementsRemoved: 2,
			remainingElements: [],
			totalRemovedDuration: 2.0,
		});
	});

	it("startAutoEditJob returns jobId immediately", () => {
		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});
		expect(jobId).toMatch(/^autoedit_/);
	});

	it("getAutoEditJobStatus returns job after creation", () => {
		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});
		const job = getAutoEditJobStatus(jobId);
		expect(job).not.toBeNull();
		expect(job!.projectId).toBe("proj_1");
		expect(job!.elementId).toBe("el_1");
	});

	it("getAutoEditJobStatus returns null for unknown job", () => {
		expect(getAutoEditJobStatus("nonexistent")).toBeNull();
	});

	it("job completes with result after processing", async () => {
		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});

		await vi.waitFor(() => {
			const job = getAutoEditJobStatus(jobId);
			expect(job!.status).toBe("completed");
		});

		const job = getAutoEditJobStatus(jobId);
		expect(job!.result).toBeDefined();
		expect(job!.result!.cuts.length).toBeGreaterThan(0);
		expect(job!.completedAt).toBeDefined();
	});

	it("job fails when pipeline errors", async () => {
		mockTranscribeMedia.mockRejectedValue(new Error("API error"));

		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});

		await vi.waitFor(() => {
			const job = getAutoEditJobStatus(jobId);
			expect(job?.status).toBe("failed");
		});

		const job = getAutoEditJobStatus(jobId);
		expect(job?.message).toBe("Auto-edit pipeline failed");
		expect(job?.errorDetails).toBeDefined();
		expect(job?.errorDetails?.stage).toBe("transcribe");
		expect(job?.errorDetails?.process).toBe("unknown");
		expect(job?.errorDetails?.cause).toBe("API error");
	});

	it("captures apply-cuts failure details for IPC errors", async () => {
		mockExecuteBatchCuts.mockRejectedValue(
			new HttpError(503, "IPC bridge unavailable for batch cut execution")
		);
		const mockWindow = {
			webContents: { send: vi.fn() },
			isDestroyed: vi.fn(() => false),
		} as unknown as BrowserWindow;

		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: false,
		}, mockWindow);

		await vi.waitFor(() => {
			const job = getAutoEditJobStatus(jobId);
			expect(job?.status).toBe("failed");
		});

		const job = getAutoEditJobStatus(jobId);
		expect(job?.message).toBe("IPC bridge unavailable for batch cut execution");
		expect(job?.errorDetails).toBeDefined();
		expect(job?.errorDetails?.stage).toBe("apply-cuts");
		expect(job?.errorDetails?.process).toBe("main");
		expect(job?.errorDetails?.statusCode).toBe(503);
	});

	it("cancelAutoEditJob marks job as cancelled", () => {
		const { jobId } = startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});
		const cancelled = cancelAutoEditJob(jobId);
		expect(cancelled).toBe(true);

		const job = getAutoEditJobStatus(jobId);
		expect(job!.status).toBe("cancelled");
	});

	it("cancelAutoEditJob returns false for unknown job", () => {
		expect(cancelAutoEditJob("nonexistent")).toBe(false);
	});

	it("listAutoEditJobs returns jobs sorted newest-first", () => {
		startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});
		startAutoEditJob("proj_2", {
			elementId: "el_2",
			mediaId: "media_2",
			dryRun: true,
		});

		const jobs = listAutoEditJobs();
		expect(jobs).toHaveLength(2);
		expect(jobs[0].createdAt).toBeGreaterThanOrEqual(jobs[1].createdAt);
	});

	it("_clearAutoEditJobs removes all jobs", () => {
		startAutoEditJob("proj_1", {
			elementId: "el_1",
			mediaId: "media_1",
			dryRun: true,
		});
		expect(listAutoEditJobs()).toHaveLength(1);

		_clearAutoEditJobs();
		expect(listAutoEditJobs()).toHaveLength(0);
	});
});
