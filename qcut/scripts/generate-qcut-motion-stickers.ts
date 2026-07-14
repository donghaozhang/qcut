import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
	MOTION_STICKERS,
	type MotionStickerDefinition,
} from "../apps/web/src/lib/stickers/sticker-motion-packs";

const OUTPUT_ROOT = join(
	import.meta.dir,
	"../apps/web/public/stickers/qcut-motion"
);
const FRAME_COUNT = 16;
const FRAME_RATE = 12;
const SIZE = 256;

function oscillate({ phase }: { phase: number }): number {
	return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

function motionBody({
	item,
	phase,
}: {
	item: MotionStickerDefinition;
	phase: number;
}): string {
	const pulse = oscillate({ phase });
	const rotation = phase * 360;
	const primary = item.primaryColor;
	const secondary = item.secondaryColor;

	if (item.motion === "pulse") {
		return `<circle cx="128" cy="128" r="${60 + pulse * 54}" fill="none" stroke="${secondary}" stroke-width="14" opacity="${0.65 * (1 - pulse)}"/><circle cx="128" cy="128" r="${62 + pulse * 8}" fill="${primary}" stroke="white" stroke-width="12"/>`;
	}
	if (item.motion === "tap") {
		return `<circle cx="105" cy="96" r="${30 + phase * 70}" fill="none" stroke="${primary}" stroke-width="10" opacity="${1 - phase}"/><path d="M112 89 L201 174 L158 181 L178 224 L151 236 L131 193 L101 222 Z" fill="${secondary}" stroke="${primary}" stroke-width="11" stroke-linejoin="round" transform="translate(${pulse * 17} ${pulse * 17})"/>`;
	}
	if (item.motion === "check") {
		return `<circle cx="128" cy="128" r="86" fill="${primary}" stroke="white" stroke-width="13"/><path d="M76 130 L111 166 L184 88" fill="none" stroke="${secondary}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - Math.min(1, phase * 1.7)}"/>`;
	}
	if (item.motion === "heart") {
		const scale = 0.8 + pulse * 0.2;
		return `<path d="M128 202 C36 146 42 60 98 60 C126 60 128 87 128 98 C128 87 130 60 158 60 C214 60 220 146 128 202 Z" fill="${primary}" stroke="white" stroke-width="13" transform="translate(${128 * (1 - scale)} ${128 * (1 - scale)}) scale(${scale})"/>`;
	}
	if (item.motion === "sparkle") {
		return `<g transform="rotate(${rotation} 128 128)"><path d="M128 34 L143 105 L222 128 L143 151 L128 222 L113 151 L34 128 L113 105 Z" fill="${primary}" stroke="white" stroke-width="10"/><path d="M55 36 L61 58 L84 65 L61 72 L55 95 L48 72 L26 65 L48 58 Z" fill="${secondary}" stroke="white" stroke-width="6"/></g>`;
	}
	if (item.motion === "bounce") {
		return `<path d="M128 32 L220 134 H171 V220 H85 V134 H36 Z" fill="${primary}" stroke="${secondary}" stroke-width="13" stroke-linejoin="round" transform="translate(0 ${22 - pulse * 44})"/>`;
	}
	if (item.motion === "ring") {
		return [0, 0.33, 0.66]
			.map((offset) => {
				const ringPhase = (phase + offset) % 1;
				return `<circle cx="128" cy="128" r="${28 + ringPhase * 88}" fill="none" stroke="${primary}" stroke-width="${14 - ringPhase * 6}" opacity="${1 - ringPhase}"/>`;
			})
			.join("");
	}
	if (item.motion === "confetti") {
		return Array.from({ length: 14 }, (_, index) => {
			const angle = (index / 14) * Math.PI * 2 + phase * 0.4;
			const distance = 36 + ((phase + index / 14) % 1) * 82;
			const x = 128 + Math.cos(angle) * distance;
			const y = 128 + Math.sin(angle) * distance;
			const color = index % 2 === 0 ? primary : secondary;
			return `<rect x="${x - 6}" y="${y - 15}" width="12" height="30" rx="5" fill="${color}" transform="rotate(${rotation + index * 19} ${x} ${y})"/>`;
		}).join("");
	}
	if (item.motion === "wave") {
		return Array.from({ length: 4 }, (_, index) =>
			`<path d="M ${48 + index * 27} ${76 - index * 5} Q ${96 + index * 20} 128 ${48 + index * 27} ${180 + index * 5}" fill="none" stroke="${primary}" stroke-width="15" stroke-linecap="round" opacity="${1 - index * 0.18}" transform="translate(${pulse * 7} 0)"/>`
		).join("");
	}
	if (item.motion === "orbit") {
		const angle = phase * Math.PI * 2;
		return `<circle cx="128" cy="128" r="78" fill="none" stroke="${secondary}" stroke-width="10"/><circle cx="128" cy="128" r="28" fill="${primary}"/><circle cx="${128 + Math.cos(angle) * 78}" cy="${128 + Math.sin(angle) * 78}" r="18" fill="${primary}" stroke="white" stroke-width="8"/>`;
	}
	if (item.motion === "progress") {
		return `<rect x="22" y="91" width="212" height="74" rx="37" fill="${secondary}" stroke="white" stroke-width="10"/><rect x="34" y="103" width="${38 + phase * 150}" height="50" rx="25" fill="${primary}"/>`;
	}
	return Array.from({ length: 12 }, (_, index) => {
		const opacity = 0.2 + (((index + Math.floor(phase * 12)) % 12) / 11) * 0.8;
		return `<rect x="121" y="25" width="14" height="48" rx="7" fill="${primary}" opacity="${opacity}" transform="rotate(${index * 30} 128 128)"/>`;
	}).join("");
}

function motionSvg({
	item,
	phase,
}: {
	item: MotionStickerDefinition;
	phase: number;
}): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g filter="url(#shadow)">${motionBody({ item, phase })}</g><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.22"/></filter></defs></svg>`;
}

async function writeFrame({
	frame,
	frameDirectory,
	item,
}: {
	frame: number;
	frameDirectory: string;
	item: MotionStickerDefinition;
}) {
	const canvas = createCanvas(SIZE, SIZE);
	const context = canvas.getContext("2d");
	const image = await loadImage(
		Buffer.from(motionSvg({ item, phase: frame / FRAME_COUNT }))
	);
	context.drawImage(image, 0, 0, SIZE, SIZE);
	await Bun.write(
		join(frameDirectory, `frame-${String(frame).padStart(2, "0")}.png`),
		canvas.toBuffer("image/png")
	);
}

async function generateSticker({
	item,
	tempRoot,
}: {
	item: MotionStickerDefinition;
	tempRoot: string;
}) {
	const frameDirectory = join(tempRoot, item.collection, item.icon);
	const outputDirectory = join(OUTPUT_ROOT, item.collection);
	await Promise.all([
		mkdir(frameDirectory, { recursive: true }),
		mkdir(outputDirectory, { recursive: true }),
	]);
	await Promise.all(
		Array.from({ length: FRAME_COUNT }, (_, frame) =>
			writeFrame({ frame, frameDirectory, item })
		)
	);

	const outputPath = join(outputDirectory, `${item.icon}.png`);
	const process = Bun.spawn(
		[
			"ffmpeg",
			"-loglevel",
			"error",
			"-y",
			"-framerate",
			String(FRAME_RATE),
			"-i",
			join(frameDirectory, "frame-%02d.png"),
			"-plays",
			"0",
			"-f",
			"apng",
			outputPath,
		],
		{ stderr: "pipe", stdout: "ignore" }
	);
	const exitCode = await process.exited;
	if (exitCode !== 0) {
		throw new Error(
			`Failed to generate ${item.id}: ${await new Response(process.stderr).text()}`
		);
	}
}

const tempRoot = await mkdtemp(join(tmpdir(), "qcut-motion-stickers-"));
try {
	await Promise.all(
		MOTION_STICKERS.map((item) => generateSticker({ item, tempRoot }))
	);
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}

console.log(`Generated ${MOTION_STICKERS.length} QCut APNG motion stickers`);
