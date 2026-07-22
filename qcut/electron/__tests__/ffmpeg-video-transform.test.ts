import { describe, expect, it } from "vitest";
import {
	buildVideoMaskExpression,
	buildVideoKeyframeExpression,
	buildVideoTimelineFilters,
} from "../ffmpeg-video-transform";
import type {
	VideoSource,
	VideoTransition,
	VideoVisual,
} from "../ffmpeg/types";
import { buildChromaKeyFilterGraph } from "../ffmpeg/chroma-key-filter";

const visual: VideoVisual = {
	x: 40,
	y: -20,
	rotation: 15,
	scaleX: 0.8,
	scaleY: 0.7,
	flipHorizontal: true,
	flipVertical: false,
	opacity: 0.75,
	blendMode: "screen",
	fitMode: "contain",
	crop: { top: 0.1, right: 0, bottom: 0, left: 0.05 },
	perspective: {
		topLeftX: 0.05,
		topLeftY: 0.1,
		topRightX: 0.95,
		topRightY: 0,
		bottomRightX: 1,
		bottomRightY: 0.95,
		bottomLeftX: 0,
		bottomLeftY: 1,
	},
	keyframes: {
		x: [
			{ id: "x0", frame: 0, value: 0, easing: "linear" },
			{ id: "x1", frame: 30, value: 100, easing: "easeOut" },
		],
	},
	keyframeFps: 30,
};

describe("FFmpeg video transform filters", () => {
	it("builds animated chroma refinement filters", () => {
		const result = buildChromaKeyFilterGraph({
			inputLabel: "source",
			labelPrefix: "clip_chroma",
			fps: 30,
			duration: 2,
			chromaKey: {
				enabled: true,
				color: "#00ff00",
				similarity: 0.2,
				blend: 0.1,
				shadow: 0.15,
				cleanup: 0.25,
				spill: 0.2,
				keyframes: {
					similarity: [
						{ id: "s0", frame: 0, value: 0.15, easing: "linear" },
						{ id: "s1", frame: 30, value: 0.3, easing: "easeInOut" },
					],
					cleanup: [
						{ id: "c0", frame: 0, value: 0, easing: "linear" },
						{ id: "c1", frame: 30, value: 0.5, easing: "linear" },
					],
				},
			},
		});
		const filter = result.filterSteps.join(";");
		expect(filter).toContain("sendcmd=");
		expect(filter).toContain("chromakey@clip_chroma_filter");
		expect(filter).toContain("erosion=");
		expect(filter).toContain("despill@clip_chroma_despill_filter");
		expect(result.outputLabel).toBe("clip_chroma_despilled");
	});

	it("builds local-time keyframe expressions", () => {
		const expression = buildVideoKeyframeExpression({
			visual,
			property: "x",
			fallback: visual.x,
		});
		expect(expression).toContain("lt(T,1)");
		expect(expression).toContain("1-pow");
	});

	it("builds transformed fixed-size segments and timeline gaps", () => {
		const sources: VideoSource[] = [
			{ path: "/one.mp4", startTime: 1, duration: 2, visual },
			{ path: "/two.mp4", startTime: 3, duration: 2 },
		];
		const result = buildVideoTimelineFilters({
			videoSources: sources,
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 5,
		});
		const filter = result.filterSteps.join(";");
		expect(filter).toContain("video_gap_0");
		expect(filter).toContain("perspective=");
		expect(filter).toContain("hflip");
		expect(filter).toContain("rotate=angle=");
		expect(filter).toContain("blend=all_mode=screen");
		expect(filter).toContain("concat=n=3:v=1:a=0");
	});

	it.each([
		{
			treatment: "outline" as const,
			expected: ["alphaextract", "dilation,dilation", "all_mode=subtract"],
		},
		{
			treatment: "spotlight" as const,
			expected: ["alphaextract", "brightness=-0.28", "alphamerge"],
		},
		{
			treatment: "background-blur" as const,
			expected: ["alphaextract", "gblur=sigma=12", "alphamerge"],
		},
	])("builds $treatment person treatment filters", ({
		treatment,
		expected,
	}) => {
		const result = buildVideoTimelineFilters({
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
								treatment,
								fallback: "disable",
							},
						],
					},
					effectPersonSources: [
						{
							stageIndex: 0,
							path: "/person-alpha.webm",
							animated: true,
							inputIndex: 1,
						},
					],
				},
			],
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 2,
		});
		const filter = result.filterSteps.join(";");
		for (const fragment of expected) expect(filter).toContain(fragment);
		expect(filter).toContain("[1:v]trim=start=0:duration=2");
	});

	it("gates overlay, composite, and person stages to their windows", () => {
		const result = buildVideoTimelineFilters({
			videoSources: [
				{
					path: "/source.mp4",
					startTime: 0,
					duration: 4,
					effectRenderProgram: {
						version: 1,
						stages: [
							{
								kind: "composite",
								layout: "mirror",
								copies: 2,
								gap: 0,
								window: { startSeconds: 0.5, endSeconds: 1.5 },
							},
							{
								kind: "overlay",
								resourceId: "light",
								blendMode: "normal",
								opacity: 0.8,
								fit: "cover",
								window: { startSeconds: 1.5, endSeconds: 2.5 },
							},
							{
								kind: "person-tracking",
								target: "person",
								treatment: "spotlight",
								fallback: "disable",
								window: { startSeconds: 2.5, endSeconds: 3.5 },
							},
						],
					},
					effectOverlaySources: [
						{
							resourceId: "light",
							stageIndex: 1,
							path: "/light.png",
							animated: false,
							inputIndex: 1,
						},
					],
					effectPersonSources: [
						{
							stageIndex: 2,
							path: "/person.webm",
							animated: true,
							inputIndex: 2,
						},
					],
				},
			],
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 4,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("if(gte(T,0.5)*lt(T,1.5),B,A)");
		expect(filter).toContain("enable='gte(t,1.5)*lt(t,2.5)'");
		expect(filter).toContain("if(gte(T,2.5)*lt(T,3.5),B,A)");
	});

	it("composites baked procedural sequences with a plain alpha overlay", () => {
		const result = buildVideoTimelineFilters({
			videoSources: [
				{
					path: "/source.mp4",
					startTime: 0,
					duration: 4,
					effectRenderProgram: {
						version: 1,
						stages: [
							{
								kind: "particles",
								variant: "snow",
								density: 0.5,
								speed: 1,
								color: "#ffffff",
								opacity: 1,
								window: { startSeconds: 1, endSeconds: 3 },
							},
							{
								kind: "decoration",
								variant: "grid",
								color: "#ffffff",
								opacity: 0.6,
							},
						],
					},
					effectOverlaySources: [
						{
							resourceId: "procedural:particles:snow",
							stageIndex: 0,
							path: "/frames/effect-sequences/el-s0/f_%05d.png",
							animated: true,
							sequence: { framerate: 30 },
							inputIndex: 1,
						},
						{
							resourceId: "procedural:decoration:grid",
							stageIndex: 1,
							path: "/frames/effect-sequences/el-s1/f_00000.png",
							animated: false,
							inputIndex: 2,
						},
					],
				},
			],
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 4,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain(
			"[1:v]scale=640:360,format=rgba,fps=30,trim=duration="
		);
		expect(filter).toContain("[2:v]scale=640:360,format=rgba,fps=30");
		expect(filter).toContain("enable='gte(t,1)*lt(t,3)'");
		// Finite sequences must not use shortest=1 (it would truncate the clip).
		const proceduralSteps = result.filterSteps.filter((step) =>
			step.includes("effect_procedural")
		);
		expect(proceduralSteps.length).toBeGreaterThan(0);
		for (const step of proceduralSteps) {
			expect(step).not.toContain("shortest=1");
		}
	});

	it("remaps baked distortion maps with window-gated blending", () => {
		const result = buildVideoTimelineFilters({
			videoSources: [
				{
					path: "/source.mp4",
					startTime: 0,
					duration: 4,
					effectRenderProgram: {
						version: 1,
						stages: [
							{
								kind: "distortion",
								variant: "ripple",
								strength: 1,
								window: { startSeconds: 1, endSeconds: 3 },
							},
						],
					},
					effectDistortionSources: [
						{
							stageIndex: 0,
							xmapPath: "/frames/effect-sequences/el-s0x/f_%05d.pgm",
							ymapPath: "/frames/effect-sequences/el-s0y/f_%05d.pgm",
							animated: true,
							sequence: { framerate: 30 },
							xmapInputIndex: 1,
							ymapInputIndex: 2,
						},
					],
				},
			],
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 4,
		});
		const filter = result.filterSteps.join(";");

		// tpad holds the last map frame so finite sequences cover the segment.
		expect(filter).toContain(
			"[1:v]scale=640:360,fps=30,tpad=stop_mode=clone:stop=-1,trim=duration="
		);
		expect(filter).toContain(
			"[2:v]scale=640:360,fps=30,tpad=stop_mode=clone:stop=-1,trim=duration="
		);
		expect(filter).toContain("remap=fill=black");
		// Window gating splits the base and re-blends with a time expression.
		expect(filter).toContain("if(gte(T,1)*lt(T,3),B,A)");
	});

	it("throws when a distortion stage is missing its FFmpeg input", () => {
		expect(() =>
			buildVideoTimelineFilters({
				videoSources: [
					{
						path: "/source.mp4",
						startTime: 0,
						duration: 4,
						effectRenderProgram: {
							version: 1,
							stages: [{ kind: "distortion", variant: "fisheye", strength: 1 }],
						},
					},
				],
				width: 640,
				height: 360,
				fps: 30,
				totalDuration: 4,
			})
		).toThrow(/Missing FFmpeg input for distortion effect/);
	});

	it("keeps echo and big-head person graphs free of dangling split pads", () => {
		for (const [treatment, extra] of [
			["echo", { echoVariant: "strobe" }],
			["big-head", { intensity: 1 }],
		] as const) {
			const result = buildVideoTimelineFilters({
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
									treatment,
									fallback: "disable",
									...extra,
								},
							],
						},
						effectPersonSources: [
							{
								stageIndex: 0,
								path: "/person-alpha.webm",
								animated: true,
								inputIndex: 1,
							},
						],
					},
				],
				width: 640,
				height: 360,
				fps: 30,
				totalDuration: 2,
			});
			const filter = result.filterSteps.join(";");
			// The focus-family split must not run for these treatments — its
			// unconsumed pads would make FFmpeg reject the whole graph.
			expect(filter).not.toContain("_background_input");
			// Full connectivity: every label a step produces must be consumed
			// as an input by a later step, except the graph's final output.
			const produced = new Map<string, number>();
			const consumed = new Map<string, number>();
			for (const step of result.filterSteps) {
				const inputs = step.match(/^(?:\[[^\]]+\])+/)?.[0] ?? "";
				const outputs = step.match(/(?:\[[^\]]+\])+$/)?.[0] ?? "";
				for (const [, label] of inputs.matchAll(/\[([^\]]+)\]/g)) {
					consumed.set(label, (consumed.get(label) ?? 0) + 1);
				}
				for (const [, label] of outputs.matchAll(/\[([^\]]+)\]/g)) {
					produced.set(label, (produced.get(label) ?? 0) + 1);
				}
			}
			expect(produced.size).toBeGreaterThan(0);
			const dangling = [...produced.keys()].filter(
				(label) =>
					label !== result.outputLabel && (consumed.get(label) ?? 0) === 0
			);
			expect(dangling).toEqual([]);
		}
	});

	it("throws when a procedural stage is missing its FFmpeg input", () => {
		expect(() =>
			buildVideoTimelineFilters({
				videoSources: [
					{
						path: "/source.mp4",
						startTime: 0,
						duration: 4,
						effectRenderProgram: {
							version: 1,
							stages: [
								{
									kind: "particles",
									variant: "snow",
									density: 0.5,
									speed: 1,
									color: "#ffffff",
									opacity: 1,
								},
							],
						},
					},
				],
				width: 640,
				height: 360,
				fps: 30,
				totalDuration: 4,
			})
		).toThrow(/Missing FFmpeg input for procedural effect/);
	});

	it("composites ordered video tracks from bottom to top", () => {
		const sources: VideoSource[] = [
			{
				path: "/top.mp4",
				startTime: 0,
				duration: 3,
				trackOrder: 0,
				elementOrder: 0,
			},
			{
				path: "/bottom.mp4",
				startTime: 0,
				duration: 3,
				trackOrder: 1,
				elementOrder: 0,
			},
		];

		const result = buildVideoTimelineFilters({
			videoSources: sources,
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 3,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("[1:v]trim=");
		expect(filter.indexOf("[1:v]trim=")).toBeLessThan(
			filter.indexOf("[0:v]trim=")
		);
		expect(filter).toContain("video_layer_video_0_composite");
		expect(filter).toContain("video_layer_video_1_composite");
		expect(filter).not.toContain("concat=");
	});

	it.each([
		{ type: "dissolve", expectedExpression: "A*(1-(" },
		{ type: "fade-black", expectedExpression: "eq(PLANE,3)" },
		{ type: "fade-white", expectedExpression: "+255*" },
		{ type: "slide", direction: "right", expectedExpression: "b0(" },
		{ type: "push", direction: "down", expectedExpression: "a0(" },
		{ type: "wipe", direction: "left", expectedExpression: "lt(X" },
		{ type: "zoom-blur", expectedExpression: "W/2+(X-W/2)" },
		{ type: "whip-pan", direction: "left", expectedExpression: "0.045*W" },
		{ type: "flash", expectedExpression: ")))*0.7" },
		{ type: "light-leak", expectedExpression: "eq(PLANE,0),90" },
		{ type: "rgb-glitch", expectedExpression: "mod(Y,12)" },
		{ type: "shake", expectedExpression: "sin((" },
	] satisfies Array<{
		type: VideoTransition["type"];
		direction?: VideoTransition["direction"];
		expectedExpression: string;
	}>)("builds centered $type transitions without shortening the timeline", ({
		type,
		direction,
		expectedExpression,
	}) => {
		const sources: VideoSource[] = [
			{
				elementId: "clip-a",
				trackId: "track-1",
				path: "/one.mp4",
				startTime: 0,
				duration: 2,
				trackOrder: 0,
				elementOrder: 0,
			},
			{
				elementId: "clip-b",
				trackId: "track-1",
				path: "/two.mp4",
				startTime: 2,
				duration: 2,
				trackOrder: 0,
				elementOrder: 1,
			},
		];
		const transition: VideoTransition = {
			id: "transition-1",
			trackId: "track-1",
			fromElementId: "clip-a",
			toElementId: "clip-b",
			presetId: type,
			type,
			direction,
			easing: "linear",
			duration: 1,
		};

		const result = buildVideoTimelineFilters({
			videoSources: sources,
			videoTransitions: [transition],
			width: 640,
			height: 360,
			fps: 30,
			totalDuration: 4,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain(
			"start_duration=0:stop_mode=clone:stop_duration=0.5"
		);
		expect(filter).toContain(
			"start_duration=0.5:stop_mode=clone:stop_duration=0"
		);
		expect(filter).toContain("xfade=transition=custom:duration=1:offset=1.5");
		expect(filter).toContain(expectedExpression);
		expect(filter).toContain("trim=duration=4");
		expect(result.segmentCount).toBe(2);
	});

	it("combines animated masks with add, subtract, and intersect", () => {
		const expression = buildVideoMaskExpression({
			...visual,
			masks: [
				{
					id: "ellipse",
					type: "ellipse",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.8,
					height: 0.8,
					rotation: 0,
					feather: 0,
					invert: false,
					keyframes: {
						centerX: [
							{ id: "x0", frame: 0, value: 0.25, easing: "linear" },
							{ id: "x1", frame: 30, value: 0.75, easing: "linear" },
						],
					},
				},
				{
					id: "cutout",
					type: "rectangle",
					blendMode: "subtract",
					centerX: 0.5,
					centerY: 0.5,
					width: 0.2,
					height: 0.2,
					rotation: 0,
					feather: 0,
					invert: false,
				},
				{
					id: "star",
					type: "star",
					blendMode: "intersect",
					centerX: 0.5,
					centerY: 0.5,
					width: 1,
					height: 1,
					rotation: 0,
					feather: 0,
					invert: false,
				},
			],
		});

		expect(expression).toContain("N/30");
		expect(expression).toContain("*(1-(");
		expect(expression).toContain("mod(");
		expect(expression).not.toContain("lt(T,");
	});
});
