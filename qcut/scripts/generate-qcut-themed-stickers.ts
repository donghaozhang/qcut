import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	THEMED_STICKER_PACKS,
	type ThemedStickerDefinition,
	type ThemedStickerPack,
	type ThemedStickerStyle,
} from "../apps/web/src/lib/stickers/sticker-themed-packs";

const OUTPUT_ROOT = join(
	import.meta.dir,
	"../apps/web/public/stickers/qcut-original/themed"
);

function escapeXml({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function normalizeSvg({ value }: { value: string }): string {
	return `${value.replace(/[ \t]+$/gm, "").trim()}\n`;
}

function textLayout({ value }: { value: string }): {
	fontSize: number;
	lines: string[];
} {
	if (value.length <= 5) return { fontSize: 74, lines: [value] };
	if (value.length <= 8) return { fontSize: 58, lines: [value] };
	const splitAt = Math.ceil(value.length / 2);
	return {
		fontSize: 50,
		lines: [value.slice(0, splitAt), value.slice(splitAt)],
	};
}

function textMarkup({
	definition,
	pack,
	textColor,
	y,
}: {
	definition: ThemedStickerDefinition;
	pack: ThemedStickerPack;
	textColor?: string;
	y: number;
}): string {
	const { fontSize, lines } = textLayout({ value: definition.localizedName });
	const lineHeight = fontSize * 1.05;
	const startY = y - ((lines.length - 1) * lineHeight) / 2;
	return lines
		.map(
			(line, index) =>
				`<text x="256" y="${startY + index * lineHeight}" text-anchor="middle" dominant-baseline="middle" fill="${textColor ?? pack.palette.ink}" stroke="white" stroke-width="16" paint-order="stroke" stroke-linejoin="round" font-family="PingFang SC, Noto Sans CJK SC, Arial, sans-serif" font-size="${fontSize}" font-weight="900">${escapeXml({ value: line })}</text>`
		)
		.join("\n");
}

function sparkleDecor({ pack }: { pack: ThemedStickerPack }): string {
	return `<g fill="${pack.palette.secondary}" stroke="white" stroke-width="7" stroke-linejoin="round">
		<path d="M 78 96 L 88 126 L 119 136 L 88 146 L 78 177 L 68 146 L 37 136 L 68 126 Z"/>
		<path d="M 423 333 L 432 357 L 457 366 L 432 375 L 423 400 L 414 375 L 389 366 L 414 357 Z"/>
		<circle cx="416" cy="104" r="13"/>
		<circle cx="101" cy="386" r="10"/>
	</g>`;
}

function categoryMotif({
	pack,
	variant,
}: {
	pack: ThemedStickerPack;
	variant: number;
}): string {
	const { accent, ink, secondary } = pack.palette;
	if (pack.id === "world-cup" || pack.id === "sports") {
		return `<g transform="translate(${variant % 2 === 0 ? 346 : 74} 62) rotate(${variant * 11})">
			<circle cx="48" cy="48" r="42" fill="white" stroke="${ink}" stroke-width="8"/>
			<path d="M 48 25 L 67 39 L 60 62 H 36 L 29 39 Z M 29 39 L 11 35 M 67 39 L 84 35 M 36 62 L 25 80 M 60 62 L 71 80" fill="${accent}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>
		</g>`;
	}
	if (pack.id === "line-friends") {
		return `<g transform="translate(${variant % 2 === 0 ? 339 : 65} 54)" fill="white" stroke="${ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
			<path d="M 24 45 Q 3 21 14 4 Q 36 4 45 27 Q 70 14 95 27 Q 104 4 126 4 Q 137 21 116 45 Q 131 72 116 102 Q 93 128 70 117 Q 47 128 24 102 Q 9 72 24 45 Z"/>
			<circle cx="50" cy="66" r="4" fill="${ink}"/><circle cx="90" cy="66" r="4" fill="${ink}"/>
			<path d="M 63 80 Q 70 86 77 80" fill="none"/>
			<path d="M 111 22 L 128 7" stroke="${secondary}"/>
		</g>`;
	}
	if (pack.id === "vlog") {
		return `<g transform="translate(372 82) rotate(${variant % 2 === 0 ? 7 : -7})">
			<rect x="-43" y="-31" width="86" height="62" rx="13" fill="${accent}" stroke="white" stroke-width="12"/>
			<path d="M -10 -17 L 21 0 L -10 17 Z" fill="white"/>
		</g>`;
	}
	if (pack.id === "mood" || pack.id === "romance") {
		return `<path d="M 397 82 C 369 55 339 90 397 132 C 455 90 425 55 397 82 Z" fill="${secondary}" stroke="white" stroke-width="11"/>`;
	}
	if (pack.id === "travel") {
		return `<path d="M 354 79 L 465 38 L 421 142 L 395 103 L 354 79 Z" fill="${accent}" stroke="white" stroke-width="12" stroke-linejoin="round"/>
			<path d="M 395 103 L 421 142" stroke="${ink}" stroke-width="7"/>`;
	}
	if (pack.id === "summer" || pack.id === "little-blue") {
		return `<path d="M 405 44 C 369 95 347 124 405 162 C 463 124 441 95 405 44 Z" fill="${accent}" stroke="white" stroke-width="12"/>`;
	}
	if (pack.id === "ecommerce") {
		return `<path d="M 354 64 H 444 L 431 151 H 368 Z" fill="${accent}" stroke="white" stroke-width="12" stroke-linejoin="round"/>
			<path d="M 378 65 Q 399 28 420 65" fill="none" stroke="${ink}" stroke-width="8"/>`;
	}
	if (pack.id === "beauty") {
		return `<path d="M 379 47 H 424 V 93 H 438 V 163 H 365 V 93 H 379 Z" fill="${secondary}" stroke="white" stroke-width="12" stroke-linejoin="round"/>
			<path d="M 383 47 L 420 16 V 47 Z" fill="${accent}"/>`;
	}
	return `<path d="M 386 54 L 401 91 L 442 94 L 410 120 L 419 161 L 386 139 L 351 161 L 361 120 L 329 94 L 370 91 Z" fill="${accent}" stroke="white" stroke-width="11" stroke-linejoin="round"/>`;
}

function shapeMarkup({
	definition,
	pack,
}: {
	definition: ThemedStickerDefinition;
	pack: ThemedStickerPack;
}): string {
	const { accent, background, ink, secondary } = pack.palette;
	const text = ({ y, textColor }: { y: number; textColor?: string }) =>
		textMarkup({ definition, pack, textColor, y });
	const shapes: Record<ThemedStickerStyle, string> = {
		pill: `<rect x="52" y="166" width="408" height="180" rx="90" fill="${background}" stroke="white" stroke-width="30"/><rect x="52" y="166" width="408" height="180" rx="90" fill="${background}" stroke="${ink}" stroke-width="12"/>${text({ y: 258 })}`,
		burst: `<path d="M 68 256 L 119 215 L 91 159 L 157 153 L 170 91 L 225 126 L 266 76 L 306 126 L 362 91 L 373 154 L 439 160 L 410 216 L 461 257 L 410 297 L 438 354 L 373 359 L 360 422 L 305 387 L 264 437 L 224 387 L 168 422 L 157 359 L 91 353 L 120 297 Z" fill="${accent}" stroke="white" stroke-width="28" stroke-linejoin="round"/><path d="M 68 256 L 119 215 L 91 159 L 157 153 L 170 91 L 225 126 L 266 76 L 306 126 L 362 91 L 373 154 L 439 160 L 410 216 L 461 257 L 410 297 L 438 354 L 373 359 L 360 422 L 305 387 L 264 437 L 224 387 L 168 422 L 157 359 L 91 353 L 120 297 Z" fill="${accent}" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>${text({ y: 259, textColor: ink })}`,
		speech: `<path d="M 61 141 Q 61 83 119 83 H 394 Q 451 83 451 141 V 320 Q 451 378 394 378 H 228 L 145 442 L 161 378 H 119 Q 61 378 61 320 Z" fill="${background}" stroke="white" stroke-width="30" stroke-linejoin="round"/><path d="M 61 141 Q 61 83 119 83 H 394 Q 451 83 451 141 V 320 Q 451 378 394 378 H 228 L 145 442 L 161 378 H 119 Q 61 378 61 320 Z" fill="${background}" stroke="${ink}" stroke-width="11" stroke-linejoin="round"/>${text({ y: 236 })}`,
		arrow: `<path d="M 51 188 H 302 V 105 L 466 256 L 302 407 V 324 H 51 Z" fill="${secondary}" stroke="white" stroke-width="30" stroke-linejoin="round"/><path d="M 51 188 H 302 V 105 L 466 256 L 302 407 V 324 H 51 Z" fill="${secondary}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/>${text({ y: 258, textColor: "white" })}`,
		progress: `<rect x="44" y="178" width="424" height="156" rx="39" fill="${ink}" stroke="white" stroke-width="28"/><rect x="74" y="285" width="364" height="22" rx="11" fill="white" opacity="0.35"/><rect x="74" y="285" width="${190 + (definition.id.charCodeAt(0) % 140)}" height="22" rx="11" fill="${accent}"/>${text({ y: 235, textColor: "white" })}`,
		caption: `<path d="M 51 310 Q 105 255 160 286 Q 212 230 271 271 Q 330 217 390 263 Q 441 240 468 292 V 385 H 51 Z" fill="${background}" stroke="white" stroke-width="28" stroke-linejoin="round"/><path d="M 51 310 Q 105 255 160 286 Q 212 230 271 271 Q 330 217 390 263 Q 441 240 468 292 V 385 H 51 Z" fill="${background}" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>${text({ y: 334 })}`,
		stamp: `<g transform="rotate(-7 256 256)"><rect x="68" y="139" width="376" height="234" rx="42" fill="white" stroke="white" stroke-width="28"/><rect x="68" y="139" width="376" height="234" rx="42" fill="white" stroke="${secondary}" stroke-width="14" stroke-dasharray="25 13"/><rect x="91" y="162" width="330" height="188" rx="28" fill="${background}" stroke="${ink}" stroke-width="8"/>${text({ y: 258 })}</g>`,
		note: `<g transform="rotate(5 256 256)"><path d="M 99 82 H 412 V 374 L 346 440 H 99 Z" fill="${background}" stroke="white" stroke-width="30" stroke-linejoin="round"/><path d="M 99 82 H 412 V 374 L 346 440 H 99 Z" fill="${background}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/><path d="M 346 440 V 374 H 412" fill="${accent}" stroke="${ink}" stroke-width="8"/>${text({ y: 253 })}</g>`,
		label: `<path d="M 49 174 L 92 112 H 419 L 463 174 L 429 256 L 463 338 L 419 400 H 92 L 49 338 L 83 256 Z" fill="${background}" stroke="white" stroke-width="29" stroke-linejoin="round"/><path d="M 49 174 L 92 112 H 419 L 463 174 L 429 256 L 463 338 L 419 400 H 92 L 49 338 L 83 256 Z" fill="${background}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/>${text({ y: 258 })}`,
		frame: `<rect x="55" y="55" width="402" height="402" rx="73" fill="none" stroke="white" stroke-width="34"/><rect x="55" y="55" width="402" height="402" rx="73" fill="none" stroke="${accent}" stroke-width="17"/><path d="M 80 161 V 80 H 161 M 351 80 H 432 V 161 M 432 351 V 432 H 351 M 161 432 H 80 V 351" fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="round"/>${text({ y: 258 })}`,
	};
	return shapes[definition.style];
}

function renderSticker({
	definition,
	pack,
	variant,
}: {
	definition: ThemedStickerDefinition;
	pack: ThemedStickerPack;
	variant: number;
}): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeXml({ value: `${pack.name} ${definition.name}` })}">
	<defs>
		<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
			<feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#1f2330" flood-opacity="0.2"/>
		</filter>
	</defs>
	<g filter="url(#shadow)">
		${shapeMarkup({ definition, pack })}
		${categoryMotif({ pack, variant })}
		${sparkleDecor({ pack })}
	</g>
</svg>
`;
}

await Promise.all(
	THEMED_STICKER_PACKS.map((pack) =>
		mkdir(join(OUTPUT_ROOT, pack.id), { recursive: true })
	)
);

const files = THEMED_STICKER_PACKS.flatMap((pack) =>
	pack.items.map((definition, variant) => ({
		content: normalizeSvg({
			value: renderSticker({ definition, pack, variant }),
		}),
		path: join(OUTPUT_ROOT, pack.id, `${definition.id}.svg`),
	}))
);

await Promise.all(files.map((file) => Bun.write(file.path, file.content)));

console.log(`Generated ${files.length} QCut themed stickers in ${OUTPUT_ROOT}`);
