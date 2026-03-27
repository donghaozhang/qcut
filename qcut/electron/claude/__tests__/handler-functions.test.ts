/**
 * Tests for extracted handler functions (used by both IPC and HTTP).
 * Validates the core logic without Electron IPC.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			return "/mock/unknown";
		}),
		getVersion: vi.fn(() => "0.0.1-test"),
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

// ---------------------------------------------------------------------------
// Export handler tests
// ---------------------------------------------------------------------------

import {
	PRESETS,
	getExportPresets,
	getExportRecommendation,
} from "../handlers/claude-export-handler";

describe("Export Handler Functions", () => {
	it("getExportPresets returns all presets", () => {
		const presets = getExportPresets();
		expect(Array.isArray(presets)).toBe(true);
		expect(presets.length).toBe(12);
		expect(presets).toBe(PRESETS);
	});

	it("PRESETS includes all expected platforms", () => {
		const platforms = [...new Set(PRESETS.map((p) => p.platform))];
		expect(platforms).toContain("youtube");
		expect(platforms).toContain("tiktok");
		expect(platforms).toContain("instagram");
		expect(platforms).toContain("twitter");
		expect(platforms).toContain("linkedin");
		expect(platforms).toContain("discord");
		expect(platforms).toContain("web");
	});

	it("getExportRecommendation returns matching preset for tiktok", () => {
		const result = getExportRecommendation({ target: "tiktok" });
		expect(result.preset.platform).toBe("tiktok");
		expect(result.preset.width).toBe(1080);
		expect(result.preset.height).toBe(1920);
		expect(result.suggestions.length).toBeGreaterThan(0);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("getExportRecommendation returns default for unknown platform", () => {
		const result = getExportRecommendation({ target: "unknown_platform" });
		// Falls back to PRESETS[1] (YouTube 1080p)
		expect(result.preset.id).toBe("youtube-1080p");
	});

	it("getExportRecommendation matches by preset id", () => {
		const result = getExportRecommendation({ target: "instagram-reel" });
		expect(result.preset.id).toBe("instagram-reel");
	});

	it("all presets have required fields", () => {
		for (const preset of PRESETS) {
			expect(preset.id).toBeTypeOf("string");
			expect(preset.name).toBeTypeOf("string");
			expect(preset.platform).toBeTypeOf("string");
			expect(preset.width).toBeGreaterThan(0);
			expect(preset.height).toBeGreaterThan(0);
			expect(preset.fps).toBeGreaterThan(0);
			expect(preset.bitrate).toBeTypeOf("string");
			expect(["mp4", "gif"]).toContain(preset.format);
		}
	});
});

// ---------------------------------------------------------------------------
// Diagnostics handler tests
// ---------------------------------------------------------------------------

import {
	analyzeError,
	getSystemInfo,
} from "../handlers/claude-diagnostics-handler";
import * as os from "node:os";

describe("Diagnostics Handler Functions", () => {
	const mockSystemInfo = {
		platform: "win32" as const,
		arch: "x64",
		osVersion: "10.0",
		appVersion: "0.0.1-test",
		nodeVersion: "20.0.0",
		electronVersion: "30.0.0",
		memory: {
			total: 16_000_000_000,
			free: 8_000_000_000,
			used: 8_000_000_000,
		},
		cpuCount: 8,
	};

	it("analyzeError detects file_not_found errors", () => {
		const result = analyzeError(
			{
				message: "ENOENT: no such file or directory",
				context: "media",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("file_not_found");
		expect(result.severity).toBe("medium");
		expect(result.suggestedFixes.length).toBeGreaterThan(0);
	});

	it("analyzeError detects permission_denied errors", () => {
		const result = analyzeError(
			{
				message: "EACCES: permission denied",
				context: "file write",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("permission_denied");
		expect(result.severity).toBe("high");
	});

	it("analyzeError detects out_of_memory errors", () => {
		const result = analyzeError(
			{
				message: "ENOMEM: not enough memory",
				context: "render",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("out_of_memory");
		expect(result.severity).toBe("critical");
	});

	it("analyzeError detects ffmpeg errors", () => {
		const result = analyzeError(
			{
				message: "FFmpeg failed to process video",
				context: "export",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("ffmpeg_error");
	});

	it("analyzeError detects network errors", () => {
		const result = analyzeError(
			{
				message: "fetch failed: ECONNREFUSED",
				context: "api call",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("network_error");
		expect(result.severity).toBe("low");
	});

	it("analyzeError detects storage errors", () => {
		const result = analyzeError(
			{
				message: "IndexedDB quota exceeded",
				context: "save",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("storage_error");
	});

	it("analyzeError returns unknown for unrecognized errors", () => {
		const result = analyzeError(
			{
				message: "Something completely unexpected",
				context: "unknown",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.errorType).toBe("unknown");
		expect(result.severity).toBe("medium");
	});

	it("analyzeError includes system info in result", () => {
		const result = analyzeError(
			{
				message: "test error",
				context: "test",
				timestamp: Date.now(),
			},
			mockSystemInfo
		);
		expect(result.systemInfo).toEqual(mockSystemInfo);
	});

	it("analyzeError uses default system info when not provided", () => {
		const result = analyzeError({
			message: "test error",
			context: "test",
			timestamp: Date.now(),
		});
		expect(result.systemInfo).toBeDefined();
		expect(result.systemInfo.platform).toBe(os.platform());
	});
});

// ---------------------------------------------------------------------------
// Timeline handler tests
// ---------------------------------------------------------------------------

import {
	timelineToMarkdown,
	markdownToTimeline,
	validateTimeline,
} from "../handlers/claude-timeline-handler";

describe("Timeline Handler Functions", () => {
	const validTimeline = {
		name: "Test Timeline",
		duration: 120,
		width: 1920,
		height: 1080,
		fps: 30,
		tracks: [
			{
				index: 0,
				name: "Video",
				type: "video",
				elements: [
					{
						id: "elem_001",
						trackIndex: 0,
						startTime: 0,
						endTime: 10,
						duration: 10,
						type: "video" as const,
						sourceName: "clip.mp4",
					},
				],
			},
		],
	};

	it("timelineToMarkdown produces valid markdown", () => {
		const md = timelineToMarkdown(validTimeline);
		expect(md).toContain("# Timeline: Test Timeline");
		expect(md).toContain("1920x1080");
		expect(md).toContain("30");
		expect(md).toContain("Track 1");
		expect(md).toContain("clip.mp4");
	});

	it("markdownToTimeline parses metadata", () => {
		const md = [
			"# Timeline: My Project",
			"",
			"## Project Info",
			"| Property | Value |",
			"|----------|-------|",
			"| Duration | 0:02:00 |",
			"| Resolution | 3840x2160 |",
			"| FPS | 60 |",
			"| Tracks | 1 |",
			"",
			"## Track 1: Main Track",
			"| ID | Start | End | Duration | Type | Source | Content |",
			"|----|-------|-----|----------|------|--------|--------|",
			"| `el_1` | 0:00:00 | 0:00:10 | 0:00:10 | video | clip.mp4 | clip.mp4 |",
		].join("\n");

		const timeline = markdownToTimeline(md);
		expect(timeline.name).toBe("My Project");
		expect(timeline.width).toBe(3840);
		expect(timeline.height).toBe(2160);
		expect(timeline.fps).toBe(60);
		expect(timeline.duration).toBe(120);
	});

	it("markdownToTimeline parses tracks and elements from markdown tables", () => {
		const md = [
			"# Timeline: Test",
			"",
			"## Project Info",
			"",
			"| Property | Value |",
			"|----------|-------|",
			"| Duration | 0:02:00 |",
			"| Resolution | 1920x1080 |",
			"| FPS | 30 |",
			"| Tracks | 2 |",
			"",
			"## Track 1: Main (media)",
			"",
			"| ID | Start | End | Duration | Type | Source | Content |",
			"|----|-------|-----|----------|------|--------|--------|",
			"| `el_1` | 0:00:00 | 0:00:05 | 0:00:05 | video | clip1.mp4 | - |",
			"",
			"## Track 2: Text (text)",
			"",
			"| ID | Start | End | Duration | Type | Source | Content |",
			"|----|-------|-----|----------|------|--------|--------|",
			"| `el_2` | 0:00:00 | 0:00:03 | 0:00:03 | text | - | Title |",
		].join("\n");

		const parsed = markdownToTimeline(md);
		expect(parsed.tracks.length).toBe(2);
		expect(parsed.tracks[0].type).toBe("media");
		expect(parsed.tracks[0].elements.length).toBe(1);
		expect(parsed.tracks[0].elements[0].sourceName).toBe("clip1.mp4");
		expect(parsed.tracks[1].type).toBe("text");
		expect(parsed.tracks[1].elements[0].content).toBe("Title");
	});

	it("markdownToTimeline rejects malformed rows", () => {
		const md = [
			"# Timeline: Test",
			"## Track 1: Broken",
			"| ID | Start | End | Duration | Type | Source | Content |",
			"|----|-------|-----|----------|------|--------|--------|",
			"| `el_1` | - | - | - | video | clip.mp4 | - |",
		].join("\n");
		expect(() => markdownToTimeline(md)).toThrow("Invalid timeline markdown");
	});

	it("markdownToTimeline rejects markdown with no tracks", () => {
		expect(() => markdownToTimeline("# Not a timeline\n\nSome text.")).toThrow(
			"No tracks found"
		);
	});

	it("markdownToTimeline rejects tracks with no elements", () => {
		const md = [
			"# Timeline: Empty",
			"## Track 1: Main Track",
			"*No elements in this track*",
		].join("\n");
		expect(() => markdownToTimeline(md)).toThrow("No elements found");
	});

	it("validateTimeline passes for valid timeline", () => {
		expect(() => validateTimeline(validTimeline)).not.toThrow();
	});

	it("validateTimeline rejects missing name", () => {
		expect(() => validateTimeline({ ...validTimeline, name: "" })).toThrow(
			"Timeline must have a name"
		);
	});

	it("validateTimeline rejects invalid dimensions", () => {
		expect(() => validateTimeline({ ...validTimeline, width: 0 })).toThrow(
			"Timeline must have valid dimensions"
		);
	});

	it("validateTimeline rejects invalid FPS", () => {
		expect(() => validateTimeline({ ...validTimeline, fps: -1 })).toThrow(
			"Timeline must have valid FPS"
		);
	});

	it("validateTimeline rejects missing tracks array", () => {
		expect(() =>
			validateTimeline({ ...validTimeline, tracks: null as any })
		).toThrow("Timeline must have tracks array");
	});

	it("validateTimeline rejects invalid element timing", () => {
		const bad = {
			...validTimeline,
			tracks: [
				{
					index: 0,
					name: "Video",
					type: "video",
					elements: [
						{
							id: "bad_elem",
							trackIndex: 0,
							startTime: 10,
							endTime: 5,
							duration: -5,
							type: "video" as const,
						},
					],
				},
			],
		};
		expect(() => validateTimeline(bad)).toThrow("Invalid element timing");
	});
});
