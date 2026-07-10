import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildFFmpegArgs,
	type BuildFFmpegArgsOptions,
} from "../ffmpeg-args-builder";

const { existsSyncMock, writeFileSyncMock } = vi.hoisted(() => {
	return {
		existsSyncMock: vi.fn(() => true),
		writeFileSyncMock: vi.fn(),
	};
});

vi.mock("fs", () => ({
	default: {
		existsSync: existsSyncMock,
		writeFileSync: writeFileSyncMock,
	},
	existsSync: existsSyncMock,
	writeFileSync: writeFileSyncMock,
}));

vi.mock("electron", () => ({
	app: { getPath: vi.fn(() => "/tmp") },
}));

function createBaseOptions(
	overrides: Partial<BuildFFmpegArgsOptions> = {}
): BuildFFmpegArgsOptions {
	return {
		inputDir: "/frames",
		outputFile: "/output.mp4",
		width: 1920,
		height: 1080,
		fps: 30,
		quality: "medium",
		duration: 10,
		audioFiles: [],
		...overrides,
	};
}

describe("buildFFmpegArgs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		existsSyncMock.mockReturnValue(true);
	});

	describe("Composite Mode", () => {
		it("builds args for direct video input with effects filters", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					filterChain: "eq=brightness=0.1",
				})
			);

			expect(args).toContain("-i");
			expect(args).toContain("/input.mp4");
			expect(args).toContain("-filter_complex");
			expect(args.join(" ")).toContain("eq=brightness=0.1");
			expect(args).toContain("-map");
			expect(args).toContain("-c:v");
			expect(args).toContain("libx264");
			expect(args).toContain("/output.mp4");
		});

		it("includes trim start and duration in video input mode", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					trimStart: 2.5,
				})
			);

			const trimStartIndex = args.indexOf("-ss");
			expect(trimStartIndex).toBeGreaterThan(-1);
			expect(args[trimStartIndex + 1]).toBe("2.5");

			const durationIndex = args.indexOf("-t");
			expect(durationIndex).toBeGreaterThan(-1);
			expect(args[durationIndex + 1]).toBe("10");
		});

		it("builds mixed video + image overlays on top of the video input", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					imageSources: [
						{
							path: "/image-1.png",
							startTime: 1,
							duration: 3,
							trimStart: 0,
							trimEnd: 0,
							elementId: "img-1",
						},
					],
				})
			);

			expect(args).toContain("-loop");
			expect(args).toContain("/image-1.png");
			expect(args).toContain("-filter_complex");
			expect(args.join(" ")).toContain("overlay=x=0:y=0");
			expect(args).toContain("-map");
			expect(args).toContain("0:a?");
		});

		it("supports image-only timelines using a lavfi color base", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					imageSources: [
						{
							path: "/image-only.png",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							elementId: "img-only",
						},
					],
				})
			);

			expect(args).toContain("lavfi");
			expect(args.join(" ")).toContain("color=c=black");
			expect(args).toContain("/image-only.png");
			expect(args).not.toContain("0:a?");
		});

		it("mixes delayed audio with filter_complex in composite mode", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					audioFiles: [{ path: "/audio.mp3", startTime: 2, volume: 0.8 }],
				})
			);

			expect(args).toContain("-filter_complex");
			expect(args.join(" ")).toContain("adelay=2000|2000");
			expect(args.join(" ")).toContain("volume=0.8");
			expect(args).toContain("[a_0]");
		});

		it("renders an ASS text document after drawtext filters", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					textFilterChain: "drawtext=text='Markdown'",
					textAssPath: "/tmp/text-overlays.ass",
				})
			);

			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter).toContain("drawtext=text='Markdown'");
			expect(filter).toContain("ass=filename='/tmp/text-overlays.ass'");
			expect(filter.indexOf("drawtext=")).toBeLessThan(
				filter.indexOf("ass=filename=")
			);
		});

		it("builds alpha-masked ASS blend mode layers", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					textAssLayers: [{ path: "/tmp/multiply.ass", blendMode: "multiply" }],
				})
			);

			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter).toContain("ass=filename='/tmp/multiply.ass':alpha=1");
			expect(filter).toContain("blend=all_mode=multiply");
			expect(filter).toContain("alphaextract");
			expect(filter).toContain("alphamerge");
		});
	});

	describe("Direct Copy Mode", () => {
		it("builds args for single video direct copy", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useDirectCopy: true,
					videoSources: [{ path: "/video.mp4", startTime: 0, duration: 10 }],
				})
			);

			expect(args).toContain("-i");
			expect(args).toContain("/video.mp4");
			expect(args).toContain("-c:v");
			expect(args).toContain("copy");
			expect(args).toContain("/output.mp4");
		});

		it("normalizes Windows paths in concat list content", () => {
			buildFFmpegArgs(
				createBaseOptions({
					useDirectCopy: true,
					videoSources: [
						{
							path: "C:\\clips\\video1.mp4",
							startTime: 0,
							duration: 5,
						},
						{
							path: "C:\\clips\\video2.mp4",
							startTime: 5,
							duration: 5,
						},
					],
				})
			);

			expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
			const concatContent = String(writeFileSyncMock.mock.calls[0][1]);
			expect(concatContent).toContain("C:/clips/video1.mp4");
			expect(concatContent).toContain("C:/clips/video2.mp4");
		});

		it("throws for multi-video with trim values", () => {
			expect(() =>
				buildFFmpegArgs(
					createBaseOptions({
						useDirectCopy: true,
						videoSources: [
							{
								path: "/video1.mp4",
								startTime: 0,
								duration: 5,
								trimStart: 1,
							},
							{
								path: "/video2.mp4",
								startTime: 5,
								duration: 5,
							},
						],
					})
				)
			).toThrow("trim values");
		});
	});

	describe("Error Handling", () => {
		it("throws for invalid configuration with no export mode", () => {
			expect(() => buildFFmpegArgs(createBaseOptions())).toThrow(
				"Invalid export configuration"
			);
		});

		it("throws when declared video input path does not exist", () => {
			existsSyncMock.mockImplementation((filePath: string) => {
				if (filePath === "/missing.mp4") {
					return false;
				}
				return true;
			});

			expect(() =>
				buildFFmpegArgs(
					createBaseOptions({
						useVideoInput: true,
						videoInputPath: "/missing.mp4",
					})
				)
			).toThrow("Video source not found");
		});
	});
});
