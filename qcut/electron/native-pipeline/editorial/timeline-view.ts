import { promises as fs } from "node:fs";
import { basename, resolve } from "node:path";
import {
	encodeRgbPng,
	extractMonoPcm,
	extractRgbFrames,
} from "./media-process.js";
import type { NarrationWord } from "./types.js";

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 650;
const FRAME_COUNT = 8;
const FRAME_WIDTH = 200;
const FRAME_HEIGHT = 113;

interface Color {
	red: number;
	green: number;
	blue: number;
}

const COLORS = {
	background: { red: 19, green: 22, blue: 28 },
	panel: { red: 31, green: 36, blue: 45 },
	grid: { red: 70, green: 78, blue: 91 },
	text: { red: 224, green: 229, blue: 238 },
	muted: { red: 142, green: 151, blue: 166 },
	accent: { red: 34, green: 211, blue: 238 },
	scene: { red: 251, green: 113, blue: 133 },
	wordA: { red: 250, green: 204, blue: 21 },
	wordB: { red: 74, green: 222, blue: 128 },
	wave: { red: 96, green: 165, blue: 250 },
} satisfies Record<string, Color>;

const GLYPHS: Record<string, string> = {
	" ": "00000/00000/00000/00000/00000/00000/00000",
	"-": "00000/00000/00000/11111/00000/00000/00000",
	".": "00000/00000/00000/00000/00000/00110/00110",
	":": "00000/00110/00110/00000/00110/00110/00000",
	"/": "00001/00010/00100/01000/10000/00000/00000",
	"?": "01110/10001/00001/00010/00100/00000/00100",
	"0": "01110/10001/10011/10101/11001/10001/01110",
	"1": "00100/01100/00100/00100/00100/00100/01110",
	"2": "01110/10001/00001/00010/00100/01000/11111",
	"3": "11110/00001/00001/01110/00001/00001/11110",
	"4": "00010/00110/01010/10010/11111/00010/00010",
	"5": "11111/10000/10000/11110/00001/00001/11110",
	"6": "01110/10000/10000/11110/10001/10001/01110",
	"7": "11111/00001/00010/00100/01000/01000/01000",
	"8": "01110/10001/10001/01110/10001/10001/01110",
	"9": "01110/10001/10001/01111/00001/00001/01110",
	A: "01110/10001/10001/11111/10001/10001/10001",
	B: "11110/10001/10001/11110/10001/10001/11110",
	C: "01111/10000/10000/10000/10000/10000/01111",
	D: "11110/10001/10001/10001/10001/10001/11110",
	E: "11111/10000/10000/11110/10000/10000/11111",
	F: "11111/10000/10000/11110/10000/10000/10000",
	G: "01111/10000/10000/10111/10001/10001/01111",
	H: "10001/10001/10001/11111/10001/10001/10001",
	I: "01110/00100/00100/00100/00100/00100/01110",
	J: "00111/00010/00010/00010/10010/10010/01100",
	K: "10001/10010/10100/11000/10100/10010/10001",
	L: "10000/10000/10000/10000/10000/10000/11111",
	M: "10001/11011/10101/10101/10001/10001/10001",
	N: "10001/11001/10101/10011/10001/10001/10001",
	O: "01110/10001/10001/10001/10001/10001/01110",
	P: "11110/10001/10001/11110/10000/10000/10000",
	Q: "01110/10001/10001/10001/10101/10010/01101",
	R: "11110/10001/10001/11110/10100/10010/10001",
	S: "01111/10000/10000/01110/00001/00001/11110",
	T: "11111/00100/00100/00100/00100/00100/00100",
	U: "10001/10001/10001/10001/10001/10001/01110",
	V: "10001/10001/10001/10001/10001/01010/00100",
	W: "10001/10001/10001/10101/10101/11011/10001",
	X: "10001/10001/01010/00100/01010/10001/10001",
	Y: "10001/10001/01010/00100/00100/00100/00100",
	Z: "11111/00001/00010/00100/01000/10000/11111",
};

function setPixel({
	canvas,
	x,
	y,
	color,
}: {
	canvas: Buffer;
	x: number;
	y: number;
	color: Color;
}): void {
	if (x < 0 || y < 0 || x >= VIEW_WIDTH || y >= VIEW_HEIGHT) return;
	const offset = (Math.floor(y) * VIEW_WIDTH + Math.floor(x)) * 3;
	canvas[offset] = color.red;
	canvas[offset + 1] = color.green;
	canvas[offset + 2] = color.blue;
}

function fillRect({
	canvas,
	x,
	y,
	width,
	height,
	color,
}: {
	canvas: Buffer;
	x: number;
	y: number;
	width: number;
	height: number;
	color: Color;
}): void {
	const startX = Math.max(0, Math.floor(x));
	const endX = Math.min(VIEW_WIDTH, Math.ceil(x + width));
	const startY = Math.max(0, Math.floor(y));
	const endY = Math.min(VIEW_HEIGHT, Math.ceil(y + height));
	for (let row = startY; row < endY; row += 1) {
		for (let column = startX; column < endX; column += 1) {
			setPixel({ canvas, x: column, y: row, color });
		}
	}
}

function drawLine({
	canvas,
	x1,
	y1,
	x2,
	y2,
	color,
}: {
	canvas: Buffer;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: Color;
}): void {
	const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
	for (let index = 0; index <= steps; index += 1) {
		const progress = index / steps;
		setPixel({
			canvas,
			x: Math.round(x1 + (x2 - x1) * progress),
			y: Math.round(y1 + (y2 - y1) * progress),
			color,
		});
	}
}

function drawText({
	canvas,
	text,
	x,
	y,
	color,
	scale = 2,
	maxCharacters = 80,
}: {
	canvas: Buffer;
	text: string;
	x: number;
	y: number;
	color: Color;
	scale?: number;
	maxCharacters?: number;
}): void {
	const characters = text.toUpperCase().slice(0, maxCharacters);
	for (const [characterIndex, character] of [...characters].entries()) {
		const rows = (GLYPHS[character] ?? GLYPHS["?"]).split("/");
		for (const [rowIndex, row] of rows.entries()) {
			for (const [columnIndex, pixel] of [...row].entries()) {
				if (pixel !== "1") continue;
				fillRect({
					canvas,
					x: x + characterIndex * 6 * scale + columnIndex * scale,
					y: y + rowIndex * scale,
					width: scale,
					height: scale,
					color,
				});
			}
		}
	}
}

function blitFrame({
	canvas,
	frame,
	x,
	y,
}: {
	canvas: Buffer;
	frame: Buffer;
	x: number;
	y: number;
}): void {
	for (let row = 0; row < FRAME_HEIGHT; row += 1) {
		const sourceStart = row * FRAME_WIDTH * 3;
		const targetStart = ((y + row) * VIEW_WIDTH + x) * 3;
		frame.copy(canvas, targetStart, sourceStart, sourceStart + FRAME_WIDTH * 3);
	}
}

function mapTimeToX({
	time,
	start,
	end,
}: {
	time: number;
	start: number;
	end: number;
}): number {
	return Math.round(
		((time - start) / Math.max(0.001, end - start)) * VIEW_WIDTH
	);
}

function drawRuler({
	canvas,
	start,
	end,
	sceneBoundaries,
}: {
	canvas: Buffer;
	start: number;
	end: number;
	sceneBoundaries: number[];
}): void {
	const rulerY = 223;
	drawLine({
		canvas,
		x1: 0,
		y1: rulerY,
		x2: VIEW_WIDTH - 1,
		y2: rulerY,
		color: COLORS.grid,
	});
	const tickCount = 8;
	for (let index = 0; index <= tickCount; index += 1) {
		const x = Math.round((index / tickCount) * (VIEW_WIDTH - 1));
		const time = start + ((end - start) * index) / tickCount;
		drawLine({
			canvas,
			x1: x,
			y1: rulerY - 8,
			x2: x,
			y2: rulerY + 14,
			color: COLORS.muted,
		});
		drawText({
			canvas,
			text: `${time.toFixed(2)}S`,
			x: Math.min(VIEW_WIDTH - 90, x + 5),
			y: rulerY + 18,
			color: COLORS.muted,
			scale: 1,
		});
	}
	for (const boundary of sceneBoundaries) {
		if (boundary < start || boundary > end) continue;
		const x = mapTimeToX({ time: boundary, start, end });
		drawLine({
			canvas,
			x1: x,
			y1: 48,
			x2: x,
			y2: VIEW_HEIGHT - 34,
			color: COLORS.scene,
		});
	}
}

function drawWaveform({
	canvas,
	pcm,
}: {
	canvas: Buffer;
	pcm: Int16Array;
}): void {
	const top = 294;
	const height = 148;
	const center = top + height / 2;
	fillRect({
		canvas,
		x: 0,
		y: top,
		width: VIEW_WIDTH,
		height,
		color: COLORS.panel,
	});
	drawLine({
		canvas,
		x1: 0,
		y1: center,
		x2: VIEW_WIDTH - 1,
		y2: center,
		color: COLORS.grid,
	});
	if (pcm.length === 0) {
		drawText({
			canvas,
			text: "NO AUDIO WAVEFORM",
			x: 18,
			y: top + 16,
			color: COLORS.muted,
		});
		return;
	}
	const samplesPerPixel = Math.max(1, Math.floor(pcm.length / VIEW_WIDTH));
	for (let x = 0; x < VIEW_WIDTH; x += 1) {
		const sampleStart = x * samplesPerPixel;
		const sampleEnd = Math.min(pcm.length, sampleStart + samplesPerPixel);
		let peak = 0;
		for (let index = sampleStart; index < sampleEnd; index += 1) {
			peak = Math.max(peak, Math.abs(pcm[index]));
		}
		const amplitude = (peak / 32768) * (height / 2 - 4);
		drawLine({
			canvas,
			x1: x,
			y1: center - amplitude,
			x2: x,
			y2: center + amplitude,
			color: COLORS.wave,
		});
	}
}

function drawWords({
	canvas,
	words,
	start,
	end,
}: {
	canvas: Buffer;
	words: NarrationWord[];
	start: number;
	end: number;
}): void {
	const top = 474;
	fillRect({
		canvas,
		x: 0,
		y: top,
		width: VIEW_WIDTH,
		height: 82,
		color: COLORS.panel,
	});
	const visibleWords = words.filter(
		(word) => word.end > start && word.start < end
	);
	for (const [index, word] of visibleWords.entries()) {
		const x1 = mapTimeToX({
			time: Math.max(start, word.start),
			start,
			end,
		});
		const x2 = mapTimeToX({
			time: Math.min(end, word.end),
			start,
			end,
		});
		const lane = index % 2;
		fillRect({
			canvas,
			x: x1,
			y: top + 12 + lane * 30,
			width: Math.max(2, x2 - x1),
			height: 22,
			color: lane === 0 ? COLORS.wordA : COLORS.wordB,
		});
	}
	drawText({
		canvas,
		text: `${visibleWords.length} WORD POSITIONS`,
		x: 18,
		y: top + 60,
		color: COLORS.muted,
		scale: 1,
	});
}

function makeFrameTimes({
	start,
	end,
}: {
	start: number;
	end: number;
}): number[] {
	const safeEnd = Math.max(start, end - 0.04);
	return Array.from({ length: FRAME_COUNT }, (_, index) => {
		const progress = index / (FRAME_COUNT - 1);
		return start + (safeEnd - start) * progress;
	});
}

export async function renderTimelineView({
	source,
	start,
	end,
	outputPath,
	sceneBoundaries,
	narration,
	narrationStart = start,
	narrationEnd = end,
	words = [],
	signal,
}: {
	source: string;
	start: number;
	end: number;
	outputPath: string;
	sceneBoundaries: number[];
	narration?: string;
	narrationStart?: number;
	narrationEnd?: number;
	words?: NarrationWord[];
	signal?: AbortSignal;
}): Promise<{ imagePath: string; dataPath: string }> {
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
		throw new Error("Timeline view requires start < end");
	}
	const frameTimes = makeFrameTimes({ start, end });
	const audioSource = narration ?? source;
	const [frames, pcm] = await Promise.all([
		extractRgbFrames({
			path: source,
			times: frameTimes,
			width: FRAME_WIDTH,
			height: FRAME_HEIGHT,
			signal,
		}),
		extractMonoPcm({
			path: audioSource,
			start: narrationStart,
			end: narrationEnd,
			signal,
		}).catch(() => new Int16Array()),
	]);
	const canvas = Buffer.alloc(VIEW_WIDTH * VIEW_HEIGHT * 3);
	fillRect({
		canvas,
		x: 0,
		y: 0,
		width: VIEW_WIDTH,
		height: VIEW_HEIGHT,
		color: COLORS.background,
	});
	drawText({
		canvas,
		text: `${basename(source)} ${start.toFixed(2)}S-${end.toFixed(2)}S`,
		x: 18,
		y: 16,
		color: COLORS.text,
		maxCharacters: 110,
	});
	for (const [index, frame] of frames.entries()) {
		blitFrame({
			canvas,
			frame,
			x: index * FRAME_WIDTH,
			y: 52,
		});
		drawText({
			canvas,
			text: `${frameTimes[index].toFixed(2)}S`,
			x: index * FRAME_WIDTH + 6,
			y: 171,
			color: COLORS.text,
			scale: 1,
		});
	}
	drawRuler({ canvas, start, end, sceneBoundaries });
	drawText({
		canvas,
		text: "NARRATION WAVEFORM",
		x: 18,
		y: 267,
		color: COLORS.muted,
		scale: 1,
	});
	drawWaveform({ canvas, pcm });
	drawWords({ canvas, words, start: narrationStart, end: narrationEnd });
	drawText({
		canvas,
		text: "CYAN FRAMES  RED SCENE BOUNDARY  YELLOW GREEN WORDS",
		x: 18,
		y: 590,
		color: COLORS.muted,
		scale: 1,
	});
	drawLine({
		canvas,
		x1: 0,
		y1: 50,
		x2: VIEW_WIDTH - 1,
		y2: 50,
		color: COLORS.accent,
	});

	const imagePath = resolve(outputPath);
	await encodeRgbPng({
		rgb: canvas,
		width: VIEW_WIDTH,
		height: VIEW_HEIGHT,
		outputPath: imagePath,
		signal,
	});
	const dataPath = imagePath.replace(/\.[^.]+$/, ".json");
	await fs.writeFile(
		dataPath,
		`${JSON.stringify(
			{
				version: 1,
				source: resolve(source),
				start,
				end,
				frameTimes,
				sceneBoundaries: sceneBoundaries.filter(
					(boundary) => boundary >= start && boundary <= end
				),
				narration: narration ? resolve(narration) : undefined,
				narrationStart,
				narrationEnd,
				words: words.filter(
					(word) => word.end > narrationStart && word.start < narrationEnd
				),
			},
			null,
			2
		)}\n`
	);
	return { imagePath, dataPath };
}

export const timelineViewInternals = {
	makeFrameTimes,
	mapTimeToX,
};
