export interface JianyingTextColor {
	alpha: number;
	hex: string;
	rgb: [number, number, number];
}

function parseHexChannel({ value }: { value: string }): number {
	return Number.parseInt(value, 16);
}

function colorFromChannels({
	alpha,
	blue,
	green,
	red,
}: {
	alpha: number;
	blue: number;
	green: number;
	red: number;
}): JianyingTextColor {
	const channels = [red, green, blue].map((channel) =>
		Math.min(255, Math.max(0, Math.round(channel)))
	);
	return {
		alpha: Math.min(1, Math.max(0, alpha)),
		hex: `#${channels
			.map((channel) => channel.toString(16).padStart(2, "0"))
			.join("")}`,
		rgb: channels.map((channel) => channel / 255) as [number, number, number],
	};
}

function parseHexColor({ value }: { value: string }): JianyingTextColor | null {
	const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
	if (!match) return null;
	const digits = match[1];
	if (digits.length === 3 || digits.length === 4) {
		return colorFromChannels({
			alpha:
				digits.length === 4
					? parseHexChannel({ value: `${digits[3]}${digits[3]}` }) / 255
					: 1,
			blue: parseHexChannel({ value: `${digits[2]}${digits[2]}` }),
			green: parseHexChannel({ value: `${digits[1]}${digits[1]}` }),
			red: parseHexChannel({ value: `${digits[0]}${digits[0]}` }),
		});
	}
	return colorFromChannels({
		alpha:
			digits.length === 8
				? parseHexChannel({ value: digits.slice(6, 8) }) / 255
				: 1,
		blue: parseHexChannel({ value: digits.slice(4, 6) }),
		green: parseHexChannel({ value: digits.slice(2, 4) }),
		red: parseHexChannel({ value: digits.slice(0, 2) }),
	});
}

function parseFunctionalChannel({ value }: { value: string }): number | null {
	const trimmed = value.trim();
	const parsed = Number.parseFloat(trimmed);
	if (!Number.isFinite(parsed)) return null;
	if (trimmed.endsWith("%")) {
		if (parsed < 0 || parsed > 100) return null;
		return (parsed / 100) * 255;
	}
	if (parsed < 0 || parsed > 255) return null;
	return parsed;
}

function parseFunctionalAlpha({ value }: { value: string }): number | null {
	const trimmed = value.trim();
	const parsed = Number.parseFloat(trimmed);
	if (!Number.isFinite(parsed)) return null;
	if (trimmed.endsWith("%")) {
		if (parsed < 0 || parsed > 100) return null;
		return parsed / 100;
	}
	if (parsed < 0 || parsed > 1) return null;
	return parsed;
}

function parseFunctionalColor({
	value,
}: {
	value: string;
}): JianyingTextColor | null {
	const match = /^rgba?\((.*)\)$/i.exec(value);
	if (!match) return null;
	const parts = match[1]
		.replace("/", " ")
		.split(/[,\s]+/)
		.filter(Boolean);
	if (parts.length !== 3 && parts.length !== 4) return null;
	const red = parseFunctionalChannel({ value: parts[0] });
	const green = parseFunctionalChannel({ value: parts[1] });
	const blue = parseFunctionalChannel({ value: parts[2] });
	const alpha =
		parts.length === 4 ? parseFunctionalAlpha({ value: parts[3] }) : 1;
	if (red === null || green === null || blue === null || alpha === null) {
		return null;
	}
	return colorFromChannels({ alpha, blue, green, red });
}

export function parseJianyingTextColor({
	value,
}: {
	value: string;
}): JianyingTextColor | null {
	const normalized = value.trim().toLowerCase();
	if (normalized === "transparent") {
		return colorFromChannels({ alpha: 0, blue: 0, green: 0, red: 0 });
	}
	return (
		parseHexColor({ value: normalized }) ??
		parseFunctionalColor({ value: normalized })
	);
}
