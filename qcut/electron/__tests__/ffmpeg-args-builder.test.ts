import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSITION_PARITY_CASES } from "../../apps/web/src/components/editor/media-panel/views/transitions/transition-parity-ten";
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
			expect(args.join(" ")).toContain("adelay=2000:all=1");
			expect(args.join(" ")).toContain("volume=0.8");
			expect(args).toContain("[a_0]");
		});

		it("places person effect media before audio and assigns its filter input", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/person.mp4",
							startTime: 0,
							duration: 2,
							effectRenderProgram: {
								version: 1,
								stages: [
									{
										kind: "person-tracking",
										target: "person",
										treatment: "background-blur",
										fallback: "disable",
									},
								],
							},
							effectPersonSources: [
								{
									stageIndex: 0,
									path: "/person-alpha.webm",
									animated: true,
								},
							],
						},
					],
					audioFiles: [{ path: "/voice.wav", startTime: 0, volume: 1 }],
				})
			);
			expect(args.indexOf("/person.mp4")).toBeLessThan(
				args.indexOf("/person-alpha.webm")
			);
			expect(args.indexOf("/person-alpha.webm")).toBeLessThan(
				args.indexOf("/voice.wav")
			);
			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter).toContain("[1:v]trim=start=0:duration=2");
			expect(filter).toContain("gblur=sigma=12");
		});

		it("bounds effect overlays to the speed-aware source duration", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/source.mp4",
							startTime: 0,
							duration: 10,
							trimStart: 1,
							trimEnd: 1,
							playbackRate: 2,
							freezeFrameDuration: 1,
							effectOverlaySources: [
								{
									resourceId: "sparkle",
									stageIndex: 0,
									path: "/sparkle.png",
									animated: false,
								},
							],
						},
					],
				})
			);

			const overlayInput = args.indexOf("/sparkle.png");
			expect(args.slice(overlayInput - 5, overlayInput + 1)).toEqual([
				"-loop",
				"1",
				"-t",
				"5",
				"-i",
				"/sparkle.png",
			]);
		});

		it("adds motion-compensated interpolation for slowed video", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/source.mp4",
							startTime: 0,
							duration: 4,
							playbackRate: 0.5,
							frameInterpolation: "motion-compensated",
						},
					],
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter).toContain("minterpolate=fps=30");
			expect(filter).toContain("mi_mode=mci");
			expect(filter).toContain("me_mode=bidir");
		});

		it("feeds baked procedural sequences as image2 pattern inputs", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/source.mp4",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							playbackRate: 1,
							freezeFrameDuration: 0,
							effectOverlaySources: [
								{
									resourceId: "procedural:particles:snow",
									stageIndex: 0,
									path: "/frames/effect-sequences/el-s0/f_%05d.png",
									animated: true,
									sequence: { framerate: 30 },
								},
							],
						},
					],
				})
			);

			// Existence is checked against the first concrete frame, not the pattern.
			expect(existsSyncMock).toHaveBeenCalledWith(
				"/frames/effect-sequences/el-s0/f_00000.png"
			);
			const patternInput = args.indexOf(
				"/frames/effect-sequences/el-s0/f_%05d.png"
			);
			expect(args.slice(patternInput - 5, patternInput + 1)).toEqual([
				"-framerate",
				"30",
				"-start_number",
				"0",
				"-i",
				"/frames/effect-sequences/el-s0/f_%05d.png",
			]);
			// Sequence inputs must not loop or clamp with -t.
			expect(args.slice(patternInput - 7, patternInput - 5)).not.toContain(
				"-stream_loop"
			);
		});

		it("feeds baked distortion maps as xmap/ymap inputs", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/source.mp4",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							playbackRate: 1,
							freezeFrameDuration: 0,
							effectDistortionSources: [
								{
									stageIndex: 0,
									xmapPath: "/frames/effect-sequences/el-s0x/f_00000.pgm",
									ymapPath: "/frames/effect-sequences/el-s0y/f_00000.pgm",
									animated: false,
								},
							],
						},
					],
					audioFiles: [{ path: "/voice.wav", startTime: 0, volume: 1 }],
				})
			);

			// Static maps loop a single PGM bounded by the source duration.
			const xmapInput = args.indexOf(
				"/frames/effect-sequences/el-s0x/f_00000.pgm"
			);
			expect(args.slice(xmapInput - 5, xmapInput + 1)).toEqual([
				"-loop",
				"1",
				"-t",
				"10",
				"-i",
				"/frames/effect-sequences/el-s0x/f_00000.pgm",
			]);
			// ymap follows xmap, and audio inputs come after every map input.
			expect(xmapInput).toBeLessThan(
				args.indexOf("/frames/effect-sequences/el-s0y/f_00000.pgm")
			);
			expect(
				args.indexOf("/frames/effect-sequences/el-s0y/f_00000.pgm")
			).toBeLessThan(args.indexOf("/voice.wav"));
		});

		it("feeds animated distortion maps as image2 patterns", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/source.mp4",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							playbackRate: 1,
							freezeFrameDuration: 0,
							effectDistortionSources: [
								{
									stageIndex: 0,
									xmapPath: "/frames/effect-sequences/el-s0x/f_%05d.pgm",
									ymapPath: "/frames/effect-sequences/el-s0y/f_%05d.pgm",
									animated: true,
									sequence: { framerate: 30 },
								},
							],
						},
					],
				})
			);

			expect(existsSyncMock).toHaveBeenCalledWith(
				"/frames/effect-sequences/el-s0x/f_00000.pgm"
			);
			const xmapInput = args.indexOf(
				"/frames/effect-sequences/el-s0x/f_%05d.pgm"
			);
			expect(args.slice(xmapInput - 5, xmapInput + 1)).toEqual([
				"-framerate",
				"30",
				"-start_number",
				"0",
				"-i",
				"/frames/effect-sequences/el-s0x/f_%05d.pgm",
			]);
		});

		it("applies per-clip audio processing before mixing", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					audioFiles: [
						{
							path: "/audio.mp3",
							startTime: 1,
							volume: 0.7,
							trimStart: 0.5,
							trimEnd: 0.25,
							duration: 4,
							fadeIn: 0.4,
							fadeOut: 0.6,
							normalize: true,
							denoise: 100,
							pan: -0.25,
						},
					],
				})
			);

			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter).toContain("atrim=start=0.5:duration=3.25");
			expect(filter).toContain("afftdn=nf=-25");
			expect(filter).toContain("loudnorm=I=-16:LRA=11:TP=-1.5");
			expect(filter).toContain("stereotools=balance_out=-0.25");
			expect(filter).toContain("afade=t=in:st=0:d=0.4");
			expect(filter).toContain("afade=t=out:st=2.65:d=0.6");
			expect(filter).toContain("volume=0.7");
			expect(filter).toContain("adelay=1000:all=1");
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

		it("renders ASS layers from lower tracks before upper tracks", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					textAssLayers: [
						{
							path: "/tmp/top.ass",
							blendMode: "normal",
							trackOrder: 0,
							elementOrder: 0,
						},
						{
							path: "/tmp/bottom.ass",
							blendMode: "normal",
							trackOrder: 1,
							elementOrder: 0,
						},
					],
				})
			);

			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter.indexOf("bottom.ass")).toBeLessThan(
				filter.indexOf("top.ass")
			);
		});

		it("feeds transparent text raster frames as an ordered image2 layer", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					audioFiles: [
						{ path: "/voice.wav", startTime: 0, volume: 1, duration: 3 },
					],
					textRasterLayers: [
						{
							elementId: "animated-title",
							source: {
								kind: "image-sequence",
								path: "/tmp/text-animated-title/f_%05d.png",
								frameRate: 30,
							},
							startTime: 2,
							endTime: 5,
							blendMode: "normal",
							x: 48,
							y: 72,
							trackOrder: 0,
							elementOrder: 0,
						},
					],
				})
			);

			const sequenceInputIndex = args.indexOf(
				"/tmp/text-animated-title/f_%05d.png"
			);
			expect(
				args.slice(sequenceInputIndex - 5, sequenceInputIndex + 1)
			).toEqual([
				"-framerate",
				"30",
				"-start_number",
				"0",
				"-i",
				"/tmp/text-animated-title/f_%05d.png",
			]);
			expect(existsSyncMock).toHaveBeenCalledWith(
				"/tmp/text-animated-title/f_00000.png"
			);
			expect(sequenceInputIndex).toBeLessThan(args.indexOf("/voice.wav"));

			const filter = args[args.indexOf("-filter_complex") + 1];
			expect(filter).toContain(
				"[1:v]fps=30,setsar=1,format=rgba,trim=duration=3,settb=AVTB,setpts=PTS-STARTPTS+2/TB[visual_text_raster_0]"
			);
			expect(filter).toContain(
				"[0:v][visual_text_raster_0]overlay=x=48:y=72:eof_action=pass:repeatlast=0:shortest=0:format=auto:enable='between(t,2,5)'"
			);
			expect(filter).toContain("[2:a]");
		});

		it("positions cropped multiply and screen text before full-frame blending", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					textRasterLayers: [
						{
							elementId: "multiply-title",
							source: {
								kind: "image-sequence",
								path: "/tmp/multiply-title/f_%05d.png",
								frameRate: 30,
							},
							startTime: 1,
							endTime: 3,
							blendMode: "multiply",
							x: 48,
							y: 72,
							trackOrder: 0,
							elementOrder: 0,
						},
						{
							elementId: "screen-title",
							source: {
								kind: "image-sequence",
								path: "/tmp/screen-title/f_%05d.png",
								frameRate: 30,
							},
							startTime: 1,
							endTime: 3,
							blendMode: "screen",
							x: 180,
							y: 240,
							trackOrder: 0,
							elementOrder: 1,
						},
					],
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter).toContain(
				"[visual_text_raster_0]format=rgba,pad=1920:1080:48:72:color=black@0.0[visual_text_0_foreground_input]"
			);
			expect(filter).toContain("blend=all_mode=multiply");
			expect(filter).toContain(
				"[visual_text_0_base_original][visual_text_0_blended_alpha]overlay=x=0:y=0:"
			);
			expect(filter).toContain(
				"[visual_text_raster_1]format=rgba,pad=1920:1080:180:240:color=black@0.0[visual_text_1_foreground_input]"
			);
			expect(filter).toContain("blend=all_mode=screen");
			expect(filter).toContain(
				"[visual_text_1_base_original][visual_text_1_blended_alpha]overlay=x=0:y=0:"
			);
		});

		it("orders raster text with the same track ordering as other visuals", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/bottom.mp4",
							startTime: 0,
							duration: 10,
							trackOrder: 3,
							elementOrder: 0,
						},
					],
					stickerSources: [
						{
							id: "middle-sticker",
							path: "/sticker.png",
							x: 0,
							y: 0,
							width: 64,
							height: 64,
							startTime: 0,
							endTime: 10,
							zIndex: 1,
							trackOrder: 1,
							elementOrder: 0,
						},
					],
					textRasterLayers: [
						{
							elementId: "top-title",
							source: {
								kind: "image-sequence",
								path: "/tmp/top-title/f_%05d.png",
								frameRate: 30,
							},
							startTime: 0,
							endTime: 10,
							blendMode: "normal",
							x: 0,
							y: 0,
							trackOrder: 0,
							elementOrder: 0,
						},
					],
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter.indexOf("[video_0_layer]overlay")).toBeLessThan(
				filter.indexOf("[visual_sticker_0_scaled]overlay")
			);
			expect(filter.indexOf("[visual_sticker_0_scaled]overlay")).toBeLessThan(
				filter.indexOf("[visual_text_raster_0]overlay")
			);
		});

		it("composites video, image, sticker, and text by one track order", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					videoSources: [
						{
							path: "/bottom.mp4",
							startTime: 0,
							duration: 10,
							trackOrder: 3,
							elementOrder: 0,
						},
					],
					imageSources: [
						{
							path: "/middle.png",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 0,
							elementId: "image",
							trackOrder: 2,
							elementOrder: 0,
						},
					],
					stickerSources: [
						{
							id: "sticker",
							path: "/sticker.png",
							x: 10,
							y: 10,
							width: 64,
							height: 64,
							startTime: 0,
							endTime: 10,
							zIndex: 1,
							trackOrder: 1,
							elementOrder: 0,
						},
					],
					textAssLayers: [
						{
							path: "/top.ass",
							blendMode: "normal",
							trackOrder: 0,
							elementOrder: 0,
						},
					],
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter.indexOf("[video_0_layer]overlay")).toBeLessThan(
				filter.indexOf("[video_1_layer]overlay")
			);
			expect(filter.indexOf("[video_1_layer]overlay")).toBeLessThan(
				filter.indexOf("[visual_sticker_0_scaled]overlay")
			);
			expect(filter.indexOf("[visual_sticker_0_scaled]overlay")).toBeLessThan(
				filter.indexOf("[visual_text_ass_0]overlay")
			);
		});

		it("loops complete animated sticker streams", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useVideoInput: true,
					videoInputPath: "/input.mp4",
					stickerSources: [
						{
							id: "motion",
							animated: true,
							path: "/motion.png",
							x: 10,
							y: 10,
							width: 64,
							height: 64,
							startTime: 1,
							endTime: 4,
							zIndex: 1,
						},
					],
				})
			);

			const inputIndex = args.indexOf("/motion.png");
			expect(args.slice(inputIndex - 5, inputIndex + 1)).toEqual([
				"-stream_loop",
				"-1",
				"-t",
				"4",
				"-i",
				"/motion.png",
			]);
		});

		it("builds one transition run across image and video inputs", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					duration: 4,
					videoSources: [
						{
							elementId: "video",
							trackId: "main",
							trackOrder: 0,
							elementOrder: 1,
							path: "/video.mp4",
							startTime: 2,
							duration: 2,
						},
					],
					imageSources: [
						{
							elementId: "image",
							trackId: "main",
							trackOrder: 0,
							elementOrder: 0,
							path: "/image.png",
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
						},
					],
					videoTransitions: [
						{
							id: "image-to-video",
							trackId: "main",
							fromElementId: "image",
							toElementId: "video",
							presetId: "dissolve",
							type: "dissolve",
							easing: "linear",
							duration: 1,
						},
					],
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter).toContain("[1:v]trim=");
			expect(filter).toContain("[0:v]trim=");
			expect(filter.indexOf("[1:v]trim=")).toBeLessThan(
				filter.indexOf("[0:v]trim=")
			);
			expect(filter).toContain("xfade=transition=custom:duration=1:offset=1.5");
		});

		it("builds all exact-ten production transitions into one graph", () => {
			const videoSources = Array.from(
				{ length: TRANSITION_PARITY_CASES.length + 1 },
				(_, index) => ({
					elementId: `clip-${index}`,
					trackId: "main",
					trackOrder: 0,
					elementOrder: index,
					path: `/clip-${index}.mp4`,
					startTime: index * 2,
					duration: 2,
				})
			);
			const videoTransitions = TRANSITION_PARITY_CASES.map(
				({ qcutPresetId, expectedConfig }, index) => ({
					id: `transition-${index}`,
					trackId: "main",
					fromElementId: `clip-${index}`,
					toElementId: `clip-${index + 1}`,
					presetId: qcutPresetId,
					duration: 0.4,
					easing: "easeInOut" as const,
					...expectedConfig,
				})
			);
			const args = buildFFmpegArgs(
				createBaseOptions({
					duration: videoSources.length * 2,
					videoSources,
					videoTransitions,
				})
			);
			const filter = args[args.indexOf("-filter_complex") + 1];

			expect(filter.match(/xfade=transition=custom/g)).toHaveLength(10);
			expect(filter).not.toContain("st(1");
			expect(filter).not.toContain("st(2");
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

		it("applies duration after all inputs when direct copy includes audio", () => {
			const args = buildFFmpegArgs(
				createBaseOptions({
					useDirectCopy: true,
					videoSources: [{ path: "/video.mp4", startTime: 0, duration: 1 }],
					audioFiles: [{ path: "/audio.mp3", startTime: 0 }],
				})
			);

			const audioInputIndex = args.indexOf("/audio.mp3");
			const durationIndex = args.indexOf("-t");
			expect(durationIndex).toBeGreaterThan(audioInputIndex);
			expect(args[durationIndex + 1]).toBe("1");
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
