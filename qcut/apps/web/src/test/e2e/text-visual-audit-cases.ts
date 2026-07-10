import type { TextElement } from "@/types/timeline";

export interface TextVisualAuditCase {
	id: string;
	group:
		| "templates"
		| "blend-modes"
		| "curves"
		| "alignment"
		| "animations"
		| "keyframes"
		| "advanced";
	label: string;
	captureTime: number;
	element: TextElement;
}

export const TEXT_VISUAL_AUDIT_ROOT =
	process.env.QCUT_TEXT_AUDIT_DIR ?? "/tmp/qcut-text-visual-audit";

const baseText: TextElement = {
	id: "visual-audit-text",
	type: "text",
	name: "Visual audit text",
	content: "QCut Text",
	fontSize: 88,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	width: 900,
	height: 260,
	letterSpacing: 0,
	lineHeight: 1.2,
	verticalAlign: "middle",
	strokeColor: "#000000",
	strokeWidth: 0,
	strokeOpacity: 1,
	backgroundOpacity: 0,
	backgroundRadius: 4,
	backgroundPadding: 12,
	shadowColor: "#000000",
	shadowOpacity: 0,
	shadowOffsetX: 4,
	shadowOffsetY: 4,
	shadowBlur: 8,
	glowColor: "#ffffff",
	glowOpacity: 0,
	glowBlur: 12,
	curve: 0,
	animationType: "none",
	animationDuration: 0.6,
	animationDelay: 0,
	blendMode: "normal",
	duration: 2,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

const templates: Array<{ id: string; label: string; element: TextElement }> = [
	{
		id: "basic-default",
		label: "Basic - Default text",
		element: {
			...baseText,
			name: "Default text",
			content: "Default text",
			fontSize: 48,
			fontWeight: "normal",
			width: 640,
			height: 180,
		},
	},
	{
		id: "basic-heading",
		label: "Basic - Heading",
		element: {
			...baseText,
			name: "Heading",
			content: "Heading",
			fontSize: 84,
			width: 900,
			height: 220,
		},
	},
	{
		id: "bubble-rounded",
		label: "Bubbles - Rounded label",
		element: {
			...baseText,
			name: "Rounded label",
			content: "Rounded label",
			fontSize: 48,
			color: "#111111",
			backgroundColor: "#ffffff",
			backgroundOpacity: 1,
			backgroundRadius: 28,
			backgroundPadding: 20,
			width: 620,
			height: 150,
		},
	},
	{
		id: "bubble-dark",
		label: "Bubbles - Dark bubble",
		element: {
			...baseText,
			name: "Dark bubble",
			content: "Dark bubble",
			fontSize: 48,
			backgroundColor: "#111827",
			backgroundOpacity: 0.92,
			backgroundRadius: 18,
			backgroundPadding: 18,
			shadowOpacity: 0.45,
			shadowOffsetY: 8,
			shadowBlur: 16,
			width: 600,
			height: 150,
		},
	},
	{
		id: "bubble-yellow",
		label: "Bubbles - Yellow callout",
		element: {
			...baseText,
			name: "Yellow callout",
			content: "Important",
			fontSize: 48,
			color: "#111111",
			backgroundColor: "#ffe600",
			backgroundOpacity: 1,
			backgroundRadius: 8,
			backgroundPadding: 16,
			rotation: -3,
			width: 520,
			height: 150,
		},
	},
	{
		id: "decorative-yellow-pop",
		label: "Decorative - Yellow pop",
		element: {
			...baseText,
			name: "Yellow pop",
			content: "Big moment",
			fontSize: 72,
			color: "#ffe600",
			strokeWidth: 4,
			shadowOpacity: 0.35,
			shadowOffsetX: 5,
			shadowOffsetY: 6,
			shadowBlur: 2,
			curve: -18,
			width: 760,
			height: 220,
		},
	},
	{
		id: "decorative-cyan-neon",
		label: "Decorative - Cyan neon",
		element: {
			...baseText,
			name: "Cyan neon",
			content: "Neon",
			fontSize: 80,
			color: "#e6ffff",
			strokeColor: "#00d9ff",
			strokeWidth: 1,
			glowColor: "#00d9ff",
			glowOpacity: 0.9,
			glowBlur: 18,
			width: 700,
			height: 240,
		},
	},
	{
		id: "decorative-editorial",
		label: "Decorative - Editorial title",
		element: {
			...baseText,
			name: "Editorial title",
			content: "Editorial",
			fontSize: 76,
			fontFamily: "Playfair Display",
			fontStyle: "italic",
			letterSpacing: 2,
			shadowOpacity: 0.5,
			shadowOffsetY: 5,
			shadowBlur: 12,
			width: 800,
			height: 220,
		},
	},
];

const blendModes = [
	"normal",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
] as const;

const horizontalAlignments = ["left", "center", "right"] as const;
const verticalAlignments = ["top", "middle", "bottom"] as const;
const animationTypes = ["none", "fade", "slide-up", "slide-left"] as const;

export const TEXT_VISUAL_AUDIT_CASES: TextVisualAuditCase[] = [
	...templates.map(({ id, label, element }) => ({
		id,
		group: "templates" as const,
		label,
		captureTime: 0.8,
		element,
	})),
	...blendModes.map((blendMode) => ({
		id: `blend-${blendMode}`,
		group: "blend-modes" as const,
		label: `Blend - ${blendMode}`,
		captureTime: 0.8,
		element: {
			...baseText,
			content: blendMode.toUpperCase(),
			fontSize: 104,
			color: "#ffd166",
			strokeColor: "#ef476f",
			strokeWidth: 3,
			glowColor: "#06d6a0",
			glowOpacity: 0.55,
			glowBlur: 14,
			blendMode,
		},
	})),
	{
		id: "curve-positive",
		group: "curves",
		label: "Curve +90 degrees",
		captureTime: 0.8,
		element: {
			...baseText,
			content: "POSITIVE CURVE",
			fontSize: 72,
			color: "#ffd166",
			curve: 90,
			width: 1100,
			height: 420,
		},
	},
	{
		id: "curve-negative",
		group: "curves",
		label: "Curve -90 degrees",
		captureTime: 0.8,
		element: {
			...baseText,
			content: "NEGATIVE CURVE",
			fontSize: 72,
			color: "#06d6a0",
			curve: -90,
			width: 1100,
			height: 420,
		},
	},
	...horizontalAlignments.flatMap((textAlign) =>
		verticalAlignments.map((verticalAlign) => ({
			id: `align-${textAlign}-${verticalAlign}`,
			group: "alignment" as const,
			label: `Align - ${textAlign} / ${verticalAlign}`,
			captureTime: 0.8,
			element: {
				...baseText,
				content: `${textAlign.toUpperCase()}\n${verticalAlign.toUpperCase()}`,
				fontSize: 64,
				textAlign,
				verticalAlign,
				backgroundColor: "#111827",
				backgroundOpacity: 0.82,
				backgroundRadius: 24,
				backgroundPadding: 32,
				width: 1000,
				height: 420,
			},
		}))
	),
	...animationTypes.flatMap((animationType) =>
		([0.3, 0.8] as const).map((captureTime) => ({
			id: `animation-${animationType}-${captureTime < 0.5 ? "enter" : "settled"}`,
			group: "animations" as const,
			label: `Animation - ${animationType} / ${captureTime < 0.5 ? "enter" : "settled"}`,
			captureTime,
			element: {
				...baseText,
				content: animationType.toUpperCase(),
				color: "#ffd166",
				strokeColor: "#111111",
				strokeWidth: 3,
				animationType,
				animationDuration: 0.6,
			},
		}))
	),
	...([0.03, 1] as const).map((captureTime) => ({
		id: `yellow-pop-keyframe-${captureTime < 0.1 ? "start" : "end"}`,
		group: "keyframes" as const,
		label: `Yellow Pop keyframes - ${captureTime < 0.1 ? "start" : "end"}`,
		captureTime,
		element: {
			...baseText,
			content: "YELLOW POP",
			fontSize: 72,
			color: "#ffe600",
			strokeColor: "#111111",
			strokeWidth: 4,
			shadowOpacity: 0.35,
			shadowOffsetX: 5,
			shadowOffsetY: 6,
			shadowBlur: 2,
			keyframes: {
				x: [
					{ id: "x-start", frame: 0, value: -420, easing: "linear" },
					{ id: "x-end", frame: 30, value: 420, easing: "easeOut" },
				],
				rotation: [
					{ id: "r-start", frame: 0, value: -15, easing: "linear" },
					{ id: "r-end", frame: 30, value: 15, easing: "easeInOut" },
				],
				opacity: [
					{ id: "o-start", frame: 0, value: 0.5, easing: "linear" },
					{ id: "o-end", frame: 30, value: 1, easing: "linear" },
				],
				fontSize: [
					{ id: "s-start", frame: 0, value: 72, easing: "linear" },
					{ id: "s-end", frame: 30, value: 96, easing: "easeOut" },
				],
			},
		},
	})),
	{
		id: "advanced-composite",
		group: "advanced",
		label: "Advanced - multiline / stroke / shadow / glow / rounded / rotation",
		captureTime: 0.8,
		element: {
			...baseText,
			content: "MULTILINE TEXT\nADVANCED STYLE",
			fontSize: 76,
			color: "#fff4cc",
			letterSpacing: 2,
			lineHeight: 1.45,
			backgroundColor: "#000000",
			backgroundOpacity: 0.65,
			backgroundRadius: 28,
			backgroundPadding: 30,
			strokeColor: "#ffcc33",
			strokeWidth: 4,
			shadowColor: "#000000",
			shadowOpacity: 0.75,
			shadowOffsetX: 8,
			shadowOffsetY: 10,
			shadowBlur: 5,
			glowColor: "#00d7ff",
			glowOpacity: 0.55,
			glowBlur: 16,
			rotation: -7,
			width: 1100,
			height: 420,
		},
	},
];
