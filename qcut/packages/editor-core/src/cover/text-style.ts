export interface CoverTextStyleV1 {
	strokeColor: string;
	strokeWidth: number;
	strokeOpacity: number;
	shadowColor: string;
	shadowOpacity: number;
	shadowBlur: number;
	shadowOffsetX: number;
	shadowOffsetY: number;
	backgroundColor: string;
	backgroundOpacity: number;
	backgroundRadius: number;
	backgroundPadding: number;
	glowEnabled: boolean;
	glowColor: string;
	glowOpacity: number;
	glowBlur: number;
	letterSpacing: number;
	lineHeight: number;
	verticalAlign: "top" | "middle" | "bottom";
}

export const COVER_TEXT_STYLE_RANGES = {
	strokeWidth: [0, 40],
	strokeOpacity: [0, 1],
	shadowOpacity: [0, 1],
	shadowBlur: [0, 200],
	shadowOffsetX: [-200, 200],
	shadowOffsetY: [-200, 200],
	backgroundOpacity: [0, 1],
	backgroundRadius: [0, 200],
	backgroundPadding: [0, 200],
	glowOpacity: [0, 1],
	glowBlur: [0, 200],
	letterSpacing: [-20, 100],
	lineHeight: [0.5, 5],
} as const;

export function assertCoverTextStyle({ style }: { style: unknown }): void {
	if (style === undefined) return;
	if (!style || typeof style !== "object" || Array.isArray(style)) {
		throw new Error("Invalid cover text style");
	}
	for (const [key, value] of Object.entries(style)) {
		if (Object.hasOwn(COVER_TEXT_STYLE_RANGES, key)) {
			const [min, max] =
				COVER_TEXT_STYLE_RANGES[key as keyof typeof COVER_TEXT_STYLE_RANGES];
			if (
				typeof value === "number" &&
				Number.isFinite(value) &&
				value >= min &&
				value <= max
			)
				continue;
		} else if (
			["strokeColor", "shadowColor", "backgroundColor", "glowColor"].includes(
				key
			)
		) {
			if (typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value)) continue;
		} else if (key === "glowEnabled" && typeof value === "boolean") {
			continue;
		} else if (
			key === "verticalAlign" &&
			["top", "middle", "bottom"].includes(value)
		) {
			continue;
		}
		throw new Error(`Invalid cover text style: ${key}`);
	}
}

export function resolveCoverTextStyle({
	fontSize,
	width,
	height,
	style,
}: {
	fontSize: number;
	width: number;
	height: number;
	style?: Partial<CoverTextStyleV1>;
}): CoverTextStyleV1 {
	// Missing overrides retain the original V1 cover appearance, including auto-fit.
	return {
		strokeColor: "#161616",
		strokeWidth: fontSize * 0.035,
		strokeOpacity: 1,
		shadowColor: "#000000",
		shadowOpacity: 0.7,
		shadowBlur: fontSize * 0.08,
		shadowOffsetX: 0,
		shadowOffsetY: fontSize * 0.04,
		backgroundColor: "#171717",
		backgroundOpacity: 0.82,
		backgroundRadius: Math.min(8, fontSize * 0.1),
		backgroundPadding: Math.min(200, Math.min(width, height) * 0.05),
		glowEnabled: false,
		glowColor: "#ffffff",
		glowOpacity: 0.8,
		glowBlur: 18,
		letterSpacing: 0,
		lineHeight: 1.2,
		verticalAlign: "middle",
		...style,
	};
}
