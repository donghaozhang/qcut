export interface EffectParameters {
	brightness?: number; // -100 to 100
	contrast?: number; // -100 to 100
	saturation?: number; // -100 to 100
	blur?: number; // 0 to 20
	hue?: number; // 0 to 360
	grayscale?: number; // 0 to 100
	invert?: number; // 0 to 100
	sepia?: number; // 0 to 100
}

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

export class FFmpegFilterChain {
	private filters: string[] = [];

	addBrightness(value: number): this {
		const ffmpegValue = clamp(value / 100, -1, 1);
		this.filters.push(`eq=brightness=${ffmpegValue}`);
		return this;
	}

	addContrast(value: number): this {
		const ffmpegValue = clamp(1 + value / 100, 0, 3);
		this.filters.push(`eq=contrast=${ffmpegValue}`);
		return this;
	}

	addSaturation(value: number): this {
		const ffmpegValue = clamp(1 + value / 100, 0, 3);
		this.filters.push(`eq=saturation=${ffmpegValue}`);
		return this;
	}

	addBlur(radius: number): this {
		const r = clamp(radius, 0, 100);
		this.filters.push(`boxblur=${r}:1`);
		return this;
	}

	addHue(degrees: number): this {
		const d = ((degrees % 360) + 360) % 360; // Normalize to 0-359
		this.filters.push(`hue=h=${d}`);
		return this;
	}

	addGrayscale(value: number): this {
		// FFmpeg grayscale: hue=s=0 removes all saturation (100% grayscale)
		// For partial grayscale, reduce saturation: hue=s=(1-value/100)
		const saturationValue = clamp(1 - value / 100, 0, 1);
		this.filters.push(`hue=s=${saturationValue}`);
		return this;
	}

	addInvert(value: number): this {
		// FFmpeg invert: negate filter inverts colors
		// For simplicity, we'll use negate for any non-zero value
		// Full implementation: value >= 50 applies negate, otherwise skip
		if (value > 0) {
			this.filters.push("negate");
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
		this.filters.push(
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

	static fromEffectParameters(params: EffectParameters): string {
		const chain = new FFmpegFilterChain();

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
}
