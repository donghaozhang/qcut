import { buildRuntimeFrameTimings } from "./runtime-frames.js";
import {
	StickerRuntimeError,
	type DirectGifRuntimeDescriptor,
	type DirectGifRuntimeFrame,
	type StickerRuntimeCompletion,
} from "./runtime-model.js";
import { assertDirectGifRuntimeDescriptor } from "./runtime-validation.js";

const GIF_MAX_BYTES = 64 * 1024 * 1024;
const GIF_MAX_FRAMES = 10_000;
const GIF_TRAILER = 0x3b;
const GIF_EXTENSION_INTRODUCER = 0x21;
const GIF_IMAGE_SEPARATOR = 0x2c;

interface GifGraphicControl {
	delayCentiseconds: number;
	disposalMethod: number;
	hasTransparency: boolean;
	transparentColorIndex?: number;
}

const DEFAULT_GRAPHIC_CONTROL: GifGraphicControl = {
	delayCentiseconds: 0,
	disposalMethod: 0,
	hasTransparency: false,
};

class GifByteReader {
	readonly bytes: Uint8Array;
	offset = 0;

	constructor({ bytes }: { bytes: Uint8Array }) {
		this.bytes = bytes;
	}

	readByte({ label }: { label: string }): number {
		const value = this.bytes[this.offset];
		if (value === undefined) {
			throw new StickerRuntimeError({
				code: "MALFORMED_GIF",
				message: `Unexpected end of GIF while reading ${label}`,
			});
		}
		this.offset += 1;
		return value;
	}

	readUint16({ label }: { label: string }): number {
		const low = this.readByte({ label });
		const high = this.readByte({ label });
		return low | (high << 8);
	}

	readAscii({ length, label }: { length: number; label: string }): string {
		this.assertAvailable({ length, label });
		let result = "";
		for (let index = 0; index < length; index += 1) {
			result += String.fromCharCode(this.bytes[this.offset + index] ?? 0);
		}
		this.offset += length;
		return result;
	}

	readBytes({ length, label }: { length: number; label: string }): Uint8Array {
		this.assertAvailable({ length, label });
		const value = this.bytes.slice(this.offset, this.offset + length);
		this.offset += length;
		return value;
	}

	skip({ length, label }: { length: number; label: string }): void {
		this.assertAvailable({ length, label });
		this.offset += length;
	}

	private assertAvailable({
		length,
		label,
	}: {
		length: number;
		label: string;
	}): void {
		if (length < 0 || this.offset + length > this.bytes.length) {
			throw new StickerRuntimeError({
				code: "MALFORMED_GIF",
				message: `Unexpected end of GIF while reading ${label}`,
			});
		}
	}
}

function readDataSubBlocks({
	reader,
	label,
}: {
	reader: GifByteReader;
	label: string;
}): Uint8Array[] {
	const blocks: Uint8Array[] = [];
	while (true) {
		const length = reader.readByte({ label: `${label} block length` });
		if (length === 0) return blocks;
		blocks.push(reader.readBytes({ length, label }));
	}
}

function skipDataSubBlocks({
	reader,
	label,
}: {
	reader: GifByteReader;
	label: string;
}): void {
	while (true) {
		const length = reader.readByte({ label: `${label} block length` });
		if (length === 0) return;
		reader.skip({ length, label });
	}
}

function readGraphicControl({
	reader,
}: {
	reader: GifByteReader;
}): GifGraphicControl {
	const blockSize = reader.readByte({ label: "graphic control block size" });
	if (blockSize !== 4) {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF graphic control extension must contain four bytes",
		});
	}
	const packed = reader.readByte({ label: "graphic control flags" });
	const delayCentiseconds = reader.readUint16({ label: "frame delay" });
	const transparentColorIndex = reader.readByte({
		label: "transparent color index",
	});
	const terminator = reader.readByte({ label: "graphic control terminator" });
	if (terminator !== 0) {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF graphic control extension is not terminated",
		});
	}
	const hasTransparency = (packed & 0x01) !== 0;
	return {
		delayCentiseconds,
		disposalMethod: (packed >> 2) & 0x07,
		hasTransparency,
		...(hasTransparency ? { transparentColorIndex } : {}),
	};
}

function readApplicationRepeatCount({
	reader,
}: {
	reader: GifByteReader;
}): number | undefined {
	const identifierLength = reader.readByte({
		label: "application identifier length",
	});
	const identifier = reader.readAscii({
		length: identifierLength,
		label: "application identifier",
	});
	const blocks = readDataSubBlocks({ reader, label: "application data" });
	if (identifier !== "NETSCAPE2.0" && identifier !== "ANIMEXTS1.0") return;
	const repeatBlock = blocks[0];
	if (!repeatBlock || repeatBlock.length < 3 || repeatBlock[0] !== 1) return;
	return (repeatBlock[1] ?? 0) | ((repeatBlock[2] ?? 0) << 8);
}

function colorTableByteLength({ packed }: { packed: number }): number {
	if ((packed & 0x80) === 0) return 0;
	return 3 * 2 ** ((packed & 0x07) + 1);
}

function assertImageBounds({
	x,
	y,
	width,
	height,
	canvasWidth,
	canvasHeight,
}: {
	x: number;
	y: number;
	width: number;
	height: number;
	canvasWidth: number;
	canvasHeight: number;
}): void {
	if (
		width <= 0 ||
		height <= 0 ||
		x + width > canvasWidth ||
		y + height > canvasHeight
	) {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF frame rectangle lies outside the logical screen",
		});
	}
}

export function parseDirectGifRuntimeDescriptor({
	bytes,
	completion = "freeze-last",
	zeroDelayFallbackSeconds = 0.1,
}: {
	bytes: Uint8Array;
	completion?: StickerRuntimeCompletion;
	zeroDelayFallbackSeconds?: number;
}): DirectGifRuntimeDescriptor {
	if (bytes.length > GIF_MAX_BYTES) {
		throw new StickerRuntimeError({
			code: "UNSUPPORTED_GIF",
			message: `GIF timing parser accepts at most ${GIF_MAX_BYTES} bytes`,
		});
	}
	if (
		!Number.isFinite(zeroDelayFallbackSeconds) ||
		zeroDelayFallbackSeconds <= 0
	) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "zeroDelayFallbackSeconds must be finite and positive",
		});
	}
	const reader = new GifByteReader({ bytes });
	const signature = reader.readAscii({ length: 6, label: "signature" });
	if (signature !== "GIF87a" && signature !== "GIF89a") {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF signature must be GIF87a or GIF89a",
		});
	}
	const width = reader.readUint16({ label: "logical screen width" });
	const height = reader.readUint16({ label: "logical screen height" });
	if (width <= 0 || height <= 0) {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF logical screen must have positive dimensions",
		});
	}
	const screenPacked = reader.readByte({ label: "logical screen flags" });
	reader.skip({ length: 2, label: "logical screen background and aspect" });
	reader.skip({
		length: colorTableByteLength({ packed: screenPacked }),
		label: "global color table",
	});

	let graphicControl = DEFAULT_GRAPHIC_CONTROL;
	let rawRepeatCount: number | undefined;
	const parsedFrames: Omit<DirectGifRuntimeFrame, "startSeconds">[] = [];
	let foundTrailer = false;
	while (reader.offset < bytes.length) {
		const marker = reader.readByte({ label: "block marker" });
		if (marker === GIF_TRAILER) {
			foundTrailer = true;
			break;
		}
		if (marker === GIF_EXTENSION_INTRODUCER) {
			const extensionLabel = reader.readByte({ label: "extension label" });
			if (extensionLabel === 0xf9) {
				graphicControl = readGraphicControl({ reader });
				continue;
			}
			if (extensionLabel === 0xff) {
				const candidate = readApplicationRepeatCount({ reader });
				if (candidate !== undefined) rawRepeatCount = candidate;
				continue;
			}
			skipDataSubBlocks({ reader, label: "extension data" });
			continue;
		}
		if (marker !== GIF_IMAGE_SEPARATOR) {
			throw new StickerRuntimeError({
				code: "MALFORMED_GIF",
				message: `Unsupported GIF block marker 0x${marker.toString(16)}`,
			});
		}

		const x = reader.readUint16({ label: "frame x" });
		const y = reader.readUint16({ label: "frame y" });
		const frameWidth = reader.readUint16({ label: "frame width" });
		const frameHeight = reader.readUint16({ label: "frame height" });
		assertImageBounds({
			x,
			y,
			width: frameWidth,
			height: frameHeight,
			canvasWidth: width,
			canvasHeight: height,
		});
		const imagePacked = reader.readByte({ label: "image flags" });
		reader.skip({
			length: colorTableByteLength({ packed: imagePacked }),
			label: "local color table",
		});
		reader.readByte({ label: "LZW minimum code size" });
		skipDataSubBlocks({ reader, label: "image data" });
		if (parsedFrames.length >= GIF_MAX_FRAMES) {
			throw new StickerRuntimeError({
				code: "UNSUPPORTED_GIF",
				message: `GIF timing parser accepts at most ${GIF_MAX_FRAMES} frames`,
			});
		}
		parsedFrames.push({
			delayCentiseconds: graphicControl.delayCentiseconds,
			disposalMethod: graphicControl.disposalMethod,
			durationSeconds:
				graphicControl.delayCentiseconds > 0
					? graphicControl.delayCentiseconds / 100
					: zeroDelayFallbackSeconds,
			frameRect: { x, y, width: frameWidth, height: frameHeight },
			hasTransparency: graphicControl.hasTransparency,
			...(graphicControl.transparentColorIndex !== undefined
				? { transparentColorIndex: graphicControl.transparentColorIndex }
				: {}),
		});
		graphicControl = DEFAULT_GRAPHIC_CONTROL;
	}
	if (!foundTrailer) {
		throw new StickerRuntimeError({
			code: "MALFORMED_GIF",
			message: "GIF is missing its trailer",
		});
	}
	const timing = buildRuntimeFrameTimings({
		durationsSeconds: parsedFrames.map(
			({ durationSeconds }) => durationSeconds
		),
	});
	const frames = parsedFrames.map((frame, index) => ({
		...frame,
		startSeconds: timing.timings[index]?.startSeconds ?? 0,
	}));
	const descriptor: DirectGifRuntimeDescriptor = {
		kind: "direct-gif",
		canvasSize: { width, height },
		cycleDurationSeconds: timing.cycleDurationSeconds,
		frames,
		repeat:
			rawRepeatCount === 0
				? { kind: "infinite" }
				: {
						kind: "finite",
						additionalIterations: rawRepeatCount ?? 0,
					},
		completion,
	};
	assertDirectGifRuntimeDescriptor({ descriptor });
	return descriptor;
}
