import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the runner and init before importing
const mockRun = vi.fn();

vi.mock("../../native-pipeline/init.js", () => ({
	initRegistry: vi.fn(),
}));

vi.mock("../../native-pipeline/cli/cli-runner/runner.js", () => {
	return {
		CLIPipelineRunner: class {
			run = mockRun;
		},
	};
});

// Import after mocks are set up
const { execCli, execCliJson } = await import("../cli-bridge.js");

describe("cli-bridge", () => {
	beforeEach(() => {
		mockRun.mockReset();
	});

	describe("execCli", () => {
		it("passes command and args to runner", async () => {
			mockRun.mockResolvedValue({ success: true, data: { clips: 3 } });

			const result = await execCli("editor:timeline-split", {
				time: "00:01:30.500",
				track: 0,
			});

			expect(result).toEqual({ success: true, data: { clips: 3 } });
			expect(mockRun).toHaveBeenCalledOnce();

			const [options] = mockRun.mock.calls[0];
			expect(options.command).toBe("editor:timeline-split");
			expect(options.json).toBe(true);
			expect(options.time).toBe("00:01:30.500");
			expect(options.track).toBe(0);
		});

		it("passes empty args when none provided", async () => {
			mockRun.mockResolvedValue({ success: true });

			await execCli("editor:media-list");

			const [options] = mockRun.mock.calls[0];
			expect(options.command).toBe("editor:media-list");
			expect(options.json).toBe(true);
		});

		it("returns error result when runner throws", async () => {
			mockRun.mockRejectedValue(new Error("Connection refused"));

			const result = await execCli("editor:state-snapshot");

			expect(result).toEqual({
				success: false,
				error: "Connection refused",
			});
		});

		it("returns error result for non-Error throws", async () => {
			mockRun.mockRejectedValue("something broke");

			const result = await execCli("bad-command");

			expect(result).toEqual({
				success: false,
				error: "something broke",
			});
		});

		it("times out when runner hangs", async () => {
			mockRun.mockImplementation(
				() => new Promise((resolve) => setTimeout(resolve, 10_000))
			);

			const result = await execCli("slow-command", {}, 50);

			expect(result.success).toBe(false);
			expect(result.error).toContain("timed out");
			expect(result.error).toContain("slow-command");
			expect(result.error).toContain("50ms");
		});

		it("uses default 60s timeout", async () => {
			mockRun.mockResolvedValue({ success: true });
			await execCli("fast-command");
			expect(mockRun).toHaveBeenCalledOnce();
		});

		it("resolves before timeout when runner is fast", async () => {
			mockRun.mockResolvedValue({ success: true, outputPath: "/out.mp4" });

			const result = await execCli("generate-image", { text: "cat" }, 5000);

			expect(result).toEqual({ success: true, outputPath: "/out.mp4" });
		});
	});

	describe("execCliJson", () => {
		it("returns JSON string of result", async () => {
			mockRun.mockResolvedValue({
				success: true,
				outputPath: "/output/image.png",
			});

			const json = await execCliJson("generate-image", { text: "hello" });
			const parsed = JSON.parse(json);

			expect(parsed.success).toBe(true);
			expect(parsed.outputPath).toBe("/output/image.png");
		});

		it("returns JSON string for error results", async () => {
			mockRun.mockRejectedValue(new Error("API key missing"));

			const json = await execCliJson("generate-image");
			const parsed = JSON.parse(json);

			expect(parsed.success).toBe(false);
			expect(parsed.error).toBe("API key missing");
		});
	});
});
