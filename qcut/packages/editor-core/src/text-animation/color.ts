/**
 * Color math for the text animation color channel. Only hex colors are
 * handled; anything unparseable falls back so a bad palette entry can never
 * blank a frame.
 */

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

function clampChannel({ value }: { value: number }): number {
	return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseTextAnimationHexColor({
	color,
}: {
	color: string;
}): RgbColor | null {
	const normalized = color.trim().replace(/^#/, "");
	const expanded =
		normalized.length === 3
			? [...normalized].map((digit) => digit + digit).join("")
			: normalized;
	if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
	return {
		r: Number.parseInt(expanded.slice(0, 2), 16),
		g: Number.parseInt(expanded.slice(2, 4), 16),
		b: Number.parseInt(expanded.slice(4, 6), 16),
	};
}

function formatHex({ color }: { color: RgbColor }): string {
	const channel = (value: number) =>
		clampChannel({ value }).toString(16).padStart(2, "0");
	return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * Blend `from` toward `to` in sRGB. Unparseable endpoints resolve to the
 * other endpoint, or `to` when both fail, so the result is always a color.
 */
export function mixTextAnimationColors({
	from,
	to,
	amount,
}: {
	from: string;
	to: string;
	amount: number;
}): string {
	const ratio = Math.min(1, Math.max(0, amount));
	const fromRgb = parseTextAnimationHexColor({ color: from });
	const toRgb = parseTextAnimationHexColor({ color: to });
	if (!fromRgb && !toRgb) return to;
	if (!fromRgb) return to;
	if (!toRgb) return from;
	return formatHex({
		color: {
			r: fromRgb.r + (toRgb.r - fromRgb.r) * ratio,
			g: fromRgb.g + (toRgb.g - fromRgb.g) * ratio,
			b: fromRgb.b + (toRgb.b - fromRgb.b) * ratio,
		},
	});
}

/**
 * Filter `base` through `tint` multiplicatively (white tint = identity),
 * blended by `amount` — Jianying's keyframed color base attribute. Falls back
 * to `base` when either endpoint fails to parse.
 */
export function multiplyTextAnimationColors({
	base,
	tint,
	amount,
}: {
	base: string;
	tint: string;
	amount: number;
}): string {
	const baseRgb = parseTextAnimationHexColor({ color: base });
	const tintRgb = parseTextAnimationHexColor({ color: tint });
	if (!baseRgb || !tintRgb) return base;
	const filtered = {
		r: (baseRgb.r * tintRgb.r) / 255,
		g: (baseRgb.g * tintRgb.g) / 255,
		b: (baseRgb.b * tintRgb.b) / 255,
	};
	const ratio = Math.min(1, Math.max(0, amount));
	return formatHex({
		color: {
			r: baseRgb.r + (filtered.r - baseRgb.r) * ratio,
			g: baseRgb.g + (filtered.g - baseRgb.g) * ratio,
			b: baseRgb.b + (filtered.b - baseRgb.b) * ratio,
		},
	});
}

/**
 * Sample a palette at a fractional stop position. Wraps around, so 1.0 maps
 * back to the first stop; `stepped` snaps to whole stops.
 */
export function sampleTextAnimationPalette({
	palette,
	position,
	stepped,
}: {
	palette: readonly string[];
	position: number;
	stepped: boolean;
}): string {
	if (palette.length === 0) return "#ffffff";
	if (palette.length === 1) return palette[0];
	// Wrap in STOP space, not in 0..1 space. Normalizing the position first
	// loses a bit on exact stop boundaries (0.2 comes back as
	// 0.19999999999999996, and −0.8 as 0.19999999999999996 × 5 = 0.999…),
	// which floors a unit onto the PREVIOUS stop — 彩虹's neighbouring
	// characters landed on the same color. Scaling first keeps the boundaries
	// on whole numbers, which are exact.
	let scaled = (position * palette.length) % palette.length;
	if (scaled < 0) scaled += palette.length;
	const index = Math.floor(scaled) % palette.length;
	if (stepped) return palette[index];
	const next = (index + 1) % palette.length;
	return mixTextAnimationColors({
		from: palette[index],
		to: palette[next],
		amount: scaled - index,
	});
}
