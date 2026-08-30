import { describe, expect, it } from "vitest";
import {
	convertRgbaToI420Bt709,
	createCanvasYuvConverter,
	EXPORT_VIDEO_COLOR_SPACE,
} from "../export-canvas-yuv";

function solidRgba({
	width,
	height,
	color,
	alpha = 255,
}: {
	width: number;
	height: number;
	color: readonly [number, number, number];
	alpha?: number;
}): Uint8Array {
	const data = new Uint8Array(width * height * 4);
	for (let index = 0; index < width * height; index += 1) {
		data[index * 4] = color[0];
		data[index * 4 + 1] = color[1];
		data[index * 4 + 2] = color[2];
		data[index * 4 + 3] = alpha;
	}
	return data;
}

/** Float BT.709 limited-range reference for one sRGB color. */
function referenceYuv([r, g, b]: readonly [number, number, number]): [
	number,
	number,
	number,
] {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const luma = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
	return [
		16 + 219 * luma,
		128 + (224 * (bn - luma)) / 1.8556,
		128 + (224 * (rn - luma)) / 1.5748,
	];
}

describe("convertRgbaToI420Bt709", () => {
	it("lays out tightly packed I420 planes", () => {
		const out = convertRgbaToI420Bt709({
			rgba: solidRgba({ width: 4, height: 2, color: [255, 255, 255] }),
			width: 4,
			height: 2,
		});
		expect(out).toHaveLength(12); // 8 luma + 2 Cb + 2 Cr
		for (let index = 0; index < 8; index += 1) {
			expect(Math.abs(out[index] - 235)).toBeLessThanOrEqual(1);
		}
		for (let index = 8; index < 12; index += 1) {
			expect(Math.abs(out[index] - 128)).toBeLessThanOrEqual(1);
		}
	});

	it("matches the BT.709 limited-range reference within one level", () => {
		const colors: ReadonlyArray<readonly [number, number, number]> = [
			[255, 255, 255],
			[0, 0, 0],
			[128, 128, 128],
			[255, 0, 0],
			[0, 255, 0],
			[0, 0, 255],
			[31, 189, 95],
			[224, 172, 105],
		];
		for (const color of colors) {
			const out = convertRgbaToI420Bt709({
				rgba: solidRgba({ width: 2, height: 2, color }),
				width: 2,
				height: 2,
			});
			const [y, cb, cr] = referenceYuv(color);
			expect(Math.abs(out[0] - y), `Y of ${color}`).toBeLessThanOrEqual(1);
			expect(Math.abs(out[4] - cb), `Cb of ${color}`).toBeLessThanOrEqual(1);
			expect(Math.abs(out[5] - cr), `Cr of ${color}`).toBeLessThanOrEqual(1);
		}
	});

	it("uses BT.709, not BT.601, luma weights", () => {
		const out = convertRgbaToI420Bt709({
			rgba: solidRgba({ width: 2, height: 2, color: [0, 255, 0] }),
			width: 2,
			height: 2,
		});
		// BT.709 pure green lands at Y≈173; BT.601 would give Y≈145.
		expect(out[0]).toBeGreaterThan(165);
	});

	it("averages each 2x2 block for chroma", () => {
		const rgba = new Uint8Array(2 * 2 * 4);
		for (const [index, color] of [
			[0, [255, 0, 0]],
			[1, [0, 0, 255]],
			[2, [255, 0, 0]],
			[3, [0, 0, 255]],
		] as const) {
			rgba.set([...color, 255], index * 4);
		}
		const out = convertRgbaToI420Bt709({ rgba, width: 2, height: 2 });
		// The matrix is linear, so chroma of the average equals the average
		// of the chromas: expect the (127.5, 0, 127.5) mix.
		const [, cb, cr] = referenceYuv([127.5, 0, 127.5]);
		expect(Math.abs(out[4] - cb)).toBeLessThanOrEqual(2);
		expect(Math.abs(out[5] - cr)).toBeLessThanOrEqual(2);
	});

	it("composites alpha over black", () => {
		const out = convertRgbaToI420Bt709({
			rgba: solidRgba({
				width: 2,
				height: 2,
				color: [255, 255, 255],
				alpha: 128,
			}),
			width: 2,
			height: 2,
		});
		const [y] = referenceYuv([128, 128, 128]);
		expect(Math.abs(out[0] - y)).toBeLessThanOrEqual(2);
	});

	it("reuses the provided output buffer", () => {
		const out = new Uint8Array(6);
		const result = convertRgbaToI420Bt709({
			rgba: solidRgba({ width: 2, height: 2, color: [0, 0, 0] }),
			width: 2,
			height: 2,
			out,
		});
		expect(result).toBe(out);
	});
});

describe("createCanvasYuvConverter", () => {
	it("rejects odd dimensions", () => {
		expect(() => createCanvasYuvConverter({ width: 3, height: 2 })).toThrow(
			/even/
		);
	});

	it("falls back to scalar conversion without WebGL2", () => {
		// jsdom has no OffscreenCanvas, so the WebGL path cannot come up.
		const converter = createCanvasYuvConverter({ width: 2, height: 2 });
		expect(converter.kind).toBe("cpu");
		const rgba = solidRgba({ width: 2, height: 2, color: [0, 255, 0] });
		const fakeCanvas = {
			getContext: () => ({
				getImageData: () => ({ data: rgba }),
			}),
		} as unknown as HTMLCanvasElement;
		const frame = converter.convert(fakeCanvas);
		expect(frame.codedWidth).toBe(2);
		expect(frame.codedHeight).toBe(2);
		expect(frame.data).toHaveLength(6);
		expect(frame.data[0]).toBeGreaterThan(165);
		converter.dispose();
	});
});

describe("EXPORT_VIDEO_COLOR_SPACE", () => {
	it("declares BT.709 limited range, matching the converted data", () => {
		expect(EXPORT_VIDEO_COLOR_SPACE).toEqual({
			primaries: "bt709",
			transfer: "bt709",
			matrix: "bt709",
			fullRange: false,
		});
	});
});
