import { describe, expect, it } from "vitest";
import {
	buildAccentPopWav,
	buildSparkBurstSvg,
} from "../smart-packaging-assets";

function readAscii({
	buffer,
	offset,
	length,
}: {
	buffer: ArrayBuffer;
	offset: number;
	length: number;
}): string {
	const view = new Uint8Array(buffer, offset, length);
	return String.fromCharCode(...view);
}

describe("Smart Packaging assets", () => {
	it("builds an animated transparent SVG sticker", () => {
		const svg = buildSparkBurstSvg();

		expect(svg).toContain('viewBox="0 0 512 512"');
		expect(svg).toContain("animateTransform");
		expect(svg).not.toContain("<rect");
	});

	it("builds a valid 44.1 kHz mono PCM WAV", () => {
		const wav = buildAccentPopWav();
		const view = new DataView(wav);

		expect(readAscii({ buffer: wav, offset: 0, length: 4 })).toBe("RIFF");
		expect(readAscii({ buffer: wav, offset: 8, length: 4 })).toBe("WAVE");
		expect(readAscii({ buffer: wav, offset: 36, length: 4 })).toBe("data");
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(44_100);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBeGreaterThan(20_000);
	});
});
