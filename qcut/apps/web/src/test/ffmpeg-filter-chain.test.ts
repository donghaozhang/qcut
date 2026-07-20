import { FFmpegFilterChain } from "../lib/ffmpeg/ffmpeg-filter-chain";

describe("FFmpegFilterChain", () => {
	it("should convert brightness correctly", () => {
		const chain = new FFmpegFilterChain().addBrightness(20).build();
		expect(chain).toBe("eq=brightness=0.2");
	});

	it("should convert contrast correctly", () => {
		const chain = new FFmpegFilterChain().addContrast(10).build();
		expect(chain).toBe("eq=contrast=1.1");
	});

	it("should handle multiple effects", () => {
		const chain = new FFmpegFilterChain()
			.addBrightness(10)
			.addContrast(-5)
			.addBlur(3)
			.build();
		expect(chain).toBe("eq=brightness=0.1,eq=contrast=0.95,boxblur=3:1");
	});

	it("should handle static conversion", () => {
		const params = { brightness: 15, contrast: -10, blur: 2 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("eq=brightness=0.15,eq=contrast=0.9,boxblur=2:1");
	});

	it("should handle saturation correctly", () => {
		const chain = new FFmpegFilterChain().addSaturation(50).build();
		expect(chain).toBe("eq=saturation=1.5");
	});

	it("should handle hue rotation correctly", () => {
		const chain = new FFmpegFilterChain().addHue(180).build();
		expect(chain).toBe("hue=h=180");
	});

	it("should handle negative values correctly", () => {
		const chain = new FFmpegFilterChain()
			.addBrightness(-30)
			.addContrast(-20)
			.build();
		expect(chain).toBe("eq=brightness=-0.3,eq=contrast=0.8");
	});

	it("should return empty string for no effects", () => {
		const chain = new FFmpegFilterChain().build();
		expect(chain).toBe("");
	});

	it("should handle empty parameters object", () => {
		const chain = FFmpegFilterChain.fromEffectParameters({});
		expect(chain).toBe("");
	});

	it("should handle partial parameters", () => {
		const params = { brightness: 25, blur: 1 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("eq=brightness=0.25,boxblur=1:1");
	});

	it("should handle grayscale effect", () => {
		const params = { grayscale: 100 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("hue=s=0");
	});

	it("should handle partial grayscale effect", () => {
		const params = { grayscale: 50 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("hue=s=0.5");
	});

	it("should handle invert effect", () => {
		const params = { invert: 100 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("negate");
	});

	it("should handle partial invert effect", () => {
		const params = { invert: 50 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("negate");
	});

	it("should handle combined grayscale and invert effects", () => {
		const params = { grayscale: 100, invert: 100 };
		const chain = FFmpegFilterChain.fromEffectParameters(params);
		expect(chain).toBe("hue=s=0,negate");
	});

	it("builds a strength-aware sepia color matrix", () => {
		const chain = FFmpegFilterChain.fromEffectParameters({ sepia: 80 });

		expect(chain).toBe(
			"colorchannelmixer=rr=0.5144:rg=0.6152:rb=0.1512:" +
				"gr=0.2792:gg=0.7488:gb=0.1344:" +
				"br=0.2176:bg=0.4272:bb=0.3048"
		);
	});

	it("gates every filter to an end-exclusive clip-local window", () => {
		const chain = FFmpegFilterChain.fromEffectParameters(
			{ brightness: 10, invert: 100 },
			{ startSeconds: 1.25, endSeconds: 3.5 }
		);

		expect(chain).toBe(
			"eq=brightness=0.1:enable='gte(t,1.25)*lt(t,3.5)'," +
				"negate=enable='gte(t,1.25)*lt(t,3.5)'"
		);
	});

	it("builds frame-evaluated keyframes in effect-local time", () => {
		const chain = FFmpegFilterChain.fromEffectInstance({
			parameters: { brightness: 10 },
			animations: [
				{
					parameter: "brightness",
					keyframes: [
						{ time: 0, value: 0 },
						{ time: 2, value: 100 },
					],
					interpolation: "linear",
				},
			],
			window: { startSeconds: 3, endSeconds: 6 },
		});

		expect(chain).toContain("eq=brightness='");
		expect(chain).toContain("(t-3)/2");
		expect(chain).toContain(":eval=frame");
		expect(chain).toContain("enable='gte(t,3)*lt(t,6)'");
		expect(chain).not.toContain("brightness=0.1");
	});

	it("builds a vignette filter for the 暗角 preset", () => {
		const chain = FFmpegFilterChain.fromEffectParameters({ vignette: 55 });
		expect(chain).toMatch(/^vignette=a=/);
	});

	it("builds an unsharp filter for the 画质清晰 preset", () => {
		const chain = FFmpegFilterChain.fromEffectParameters({ sharpen: 60 });
		expect(chain).toContain("unsharp=5:5:");
	});

	it("skips vignette and sharpen when their strength is zero", () => {
		expect(
			FFmpegFilterChain.fromEffectParameters({ vignette: 0, sharpen: 0 })
		).toBe("");
	});
});
