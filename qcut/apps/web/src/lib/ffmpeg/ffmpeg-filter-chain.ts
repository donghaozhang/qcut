import type { AnimatedParameter, EffectParameters } from "@qcut/editor-core";
import {
	buildEffectKeyframeExpression,
	type EffectKeyframeValueTransform,
} from "./effect-keyframe-ffmpeg";

export type { EffectParameters } from "@qcut/editor-core";

export interface FFmpegEffectWindow {
	startSeconds: number;
	endSeconds: number;
}

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

export class FFmpegFilterChain {
	private filters: string[] = [];

	constructor(private readonly window?: FFmpegEffectWindow) {}

	private addFilter(filter: string): void {
		if (!this.window) {
			this.filters.push(filter);
			return;
		}
		const start = Number(this.window.startSeconds.toFixed(6));
		const end = Number(this.window.endSeconds.toFixed(6));
		const enable = `enable='gte(t,${start})*lt(t,${end})'`;
		this.filters.push(
			filter.includes("=") ? `${filter}:${enable}` : `${filter}=${enable}`
		);
	}

	addBrightness(value: number): this {
		const ffmpegValue = clamp(value / 100, -1, 1);
		this.addFilter(`eq=brightness=${ffmpegValue}`);
		return this;
	}

	addContrast(value: number): this {
		const ffmpegValue = clamp(1 + value / 100, 0, 3);
		this.addFilter(`eq=contrast=${ffmpegValue}`);
		return this;
	}

	addSaturation(value: number): this {
		const ffmpegValue = clamp(1 + value / 100, 0, 3);
		this.addFilter(`eq=saturation=${ffmpegValue}`);
		return this;
	}

	addBlur(radius: number): this {
		const r = clamp(radius, 0, 100);
		this.addFilter(`boxblur=${r}:1`);
		return this;
	}

	addHue(degrees: number): this {
		const d = ((degrees % 360) + 360) % 360; // Normalize to 0-359
		this.addFilter(`hue=h=${d}`);
		return this;
	}

	addGrayscale(value: number): this {
		// FFmpeg grayscale: hue=s=0 removes all saturation (100% grayscale)
		// For partial grayscale, reduce saturation: hue=s=(1-value/100)
		const saturationValue = clamp(1 - value / 100, 0, 1);
		this.addFilter(`hue=s=${saturationValue}`);
		return this;
	}

	addInvert(value: number): this {
		// FFmpeg invert: negate filter inverts colors
		// For simplicity, we'll use negate for any non-zero value
		// Full implementation: value >= 50 applies negate, otherwise skip
		if (value > 0) {
			this.addFilter("negate");
		}
		return this;
	}

	addSepia(value: number): this {
		const strength = clamp(value / 100, 0, 1);
		const rr = 1 - 0.607 * strength;
		const rg = 0.769 * strength;
		const rb = 0.189 * strength;
		const gr = 0.349 * strength;
		const gg = 1 - 0.314 * strength;
		const gb = 0.168 * strength;
		const br = 0.272 * strength;
		const bg = 0.534 * strength;
		const bb = 1 - 0.869 * strength;
		this.addFilter(
			"colorchannelmixer=" +
				`rr=${rr.toFixed(4)}:rg=${rg.toFixed(4)}:rb=${rb.toFixed(4)}:` +
				`gr=${gr.toFixed(4)}:gg=${gg.toFixed(4)}:gb=${gb.toFixed(4)}:` +
				`br=${br.toFixed(4)}:bg=${bg.toFixed(4)}:bb=${bb.toFixed(4)}`
		);
		return this;
	}

	build(): string {
		return this.filters.join(",");
	}

	static fromEffectParameters(
		params: EffectParameters,
		window?: FFmpegEffectWindow
	): string {
		const chain = new FFmpegFilterChain(window);

		if (params.brightness !== undefined) chain.addBrightness(params.brightness);
		if (params.contrast !== undefined) chain.addContrast(params.contrast);
		if (params.saturation !== undefined) chain.addSaturation(params.saturation);
		if (params.blur !== undefined) chain.addBlur(params.blur);
		if (params.hue !== undefined) chain.addHue(params.hue);
		if (params.grayscale !== undefined) chain.addGrayscale(params.grayscale);
		if (params.invert !== undefined) chain.addInvert(params.invert);
		if (params.sepia !== undefined) chain.addSepia(params.sepia);

		return chain.build();
	}

	static fromEffectInstance({
		parameters,
		animations,
		window,
	}: {
		parameters: EffectParameters;
		animations?: readonly AnimatedParameter[];
		window?: FFmpegEffectWindow;
	}): string {
		const chain = new FFmpegFilterChain(window);
		const animationByParameter = new Map(
			(animations ?? []).map((animation) => [animation.parameter, animation])
		);
		const addAnimatedParameter = ({
			parameter,
			transform,
			filter,
		}: {
			parameter: "brightness" | "contrast" | "saturation" | "hue" | "grayscale";
			transform: EffectKeyframeValueTransform;
			filter: ({ expression }: { expression: string }) => string;
		}): boolean => {
			const animation = animationByParameter.get(parameter);
			if (!animation) return false;
			const expression = buildEffectKeyframeExpression({
				animation,
				transform,
				timeOffset: window?.startSeconds ?? 0,
			});
			if (!expression) return false;
			chain.addFilter(filter({ expression }));
			return true;
		};

		if (
			!addAnimatedParameter({
				parameter: "brightness",
				transform: "brightness",
				filter: ({ expression }) => `eq=brightness='${expression}':eval=frame`,
			}) &&
			parameters.brightness !== undefined
		) {
			chain.addBrightness(parameters.brightness);
		}
		if (
			!addAnimatedParameter({
				parameter: "contrast",
				transform: "contrast",
				filter: ({ expression }) => `eq=contrast='${expression}':eval=frame`,
			}) &&
			parameters.contrast !== undefined
		) {
			chain.addContrast(parameters.contrast);
		}
		if (
			!addAnimatedParameter({
				parameter: "saturation",
				transform: "saturation",
				filter: ({ expression }) => `eq=saturation='${expression}':eval=frame`,
			}) &&
			parameters.saturation !== undefined
		) {
			chain.addSaturation(parameters.saturation);
		}
		if (parameters.blur !== undefined) chain.addBlur(parameters.blur);
		if (
			!addAnimatedParameter({
				parameter: "hue",
				transform: "hue",
				filter: ({ expression }) => `hue=h='${expression}'`,
			}) &&
			parameters.hue !== undefined
		) {
			chain.addHue(parameters.hue);
		}
		if (
			!addAnimatedParameter({
				parameter: "grayscale",
				transform: "grayscale",
				filter: ({ expression }) => `hue=s='${expression}'`,
			}) &&
			parameters.grayscale !== undefined
		) {
			chain.addGrayscale(parameters.grayscale);
		}
		if (parameters.invert !== undefined) chain.addInvert(parameters.invert);
		if (parameters.sepia !== undefined) chain.addSepia(parameters.sepia);

		return chain.build();
	}
}
