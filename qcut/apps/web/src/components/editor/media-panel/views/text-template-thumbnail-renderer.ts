import type { TextTemplateDefinition } from "@/lib/text/text-template-registry";
import {
	buildTextTemplatePack,
	type TextTemplatePackPayload,
} from "@/lib/text/text-template-packs";
import type { CreateTextElement, TextElement } from "@/types/timeline";
import { canvasFontFamily } from "@/lib/text/canvas-font";

export type TextTemplateThumbnailLayoutKind = "single" | "pack";

export type TextThumbnailBackgroundKind =
	| "solid"
	| "burst"
	| "candy"
	| "chrome"
	| "comic"
	| "fire"
	| "glass"
	| "glitch"
	| "gold"
	| "gradient"
	| "ice"
	| "ink"
	| "lava"
	| "pixel"
	| "paper"
	| "soft"
	| "texture"
	| "warning";

export type TextThumbnailTextFillKind =
	| "solid"
	| "chrome"
	| "gold"
	| "hot"
	| "ice"
	| "neon"
	| "pastel"
	| "texture";

export type TextThumbnailOrnamentKind =
	| "none"
	| "burst-rays"
	| "confetti"
	| "fire"
	| "glitch"
	| "sparkles"
	| "sticker"
	| "torn-paper"
	| "grain";

export type TextTemplateThumbnailRecipe = {
	backgroundKind: TextThumbnailBackgroundKind;
	textFillKind: TextThumbnailTextFillKind;
	ornamentKind: TextThumbnailOrnamentKind;
	accentColors: readonly string[];
	materialDetail: "standard" | "rich";
};

export type TextTemplatePackPreviewKind =
	| "headline"
	| "quote"
	| "list"
	| "split"
	| "timeline";

export type TextTemplatePackPreviewSlot = {
	id: string;
	content: string;
	label: string;
};

export type TextTemplatePackPreviewElement = {
	id: string;
	backgroundColor: string;
	backgroundOpacity: number;
	backgroundPadding: number;
	backgroundRadius: number;
	color: string;
	content: string;
	fontSize: number;
	height: number;
	name: string;
	opacity: number;
	rotation: number;
	strokeColor?: string;
	strokeWidth: number;
	textAlign: CanvasTextAlign;
	width: number;
	x: number;
	y: number;
};

export type TextTemplatePackPreviewDecoration =
	| {
			id: string;
			kind: "circle";
			color: string;
			opacity: number;
			radius: number;
			x: number;
			y: number;
	  }
	| {
			id: string;
			kind: "line";
			color: string;
			opacity: number;
			strokeWidth: number;
			x1: number;
			x2: number;
			y1: number;
			y2: number;
	  }
	| {
			id: string;
			kind: "pill";
			color: string;
			height: number;
			opacity: number;
			radius: number;
			width: number;
			x: number;
			y: number;
	  };

export type TextTemplatePackPreviewModel = {
	kind: TextTemplatePackPreviewKind;
	layerCount: number;
	decorations: readonly TextTemplatePackPreviewDecoration[];
	elements: readonly TextTemplatePackPreviewElement[];
	slots: readonly TextTemplatePackPreviewSlot[];
};

type CanvasSize = {
	width: number;
	height: number;
};

const STYLE_RECIPES: Readonly<Record<string, TextTemplateThumbnailRecipe>> = {
	"blue-ice": {
		backgroundKind: "ice",
		textFillKind: "ice",
		ornamentKind: "sparkles",
		accentColors: ["#0f172a", "#0369a1", "#7dd3fc", "#ffffff"],
		materialDetail: "rich",
	},
	candy: {
		backgroundKind: "candy",
		textFillKind: "pastel",
		ornamentKind: "confetti",
		accentColors: ["#831843", "#f9a8d4", "#ffffff", "#f0abfc"],
		materialDetail: "rich",
	},
	chrome: {
		backgroundKind: "chrome",
		textFillKind: "chrome",
		ornamentKind: "grain",
		accentColors: ["#171717", "#737373", "#fafafa", "#262626"],
		materialDetail: "rich",
	},
	comic: {
		backgroundKind: "comic",
		textFillKind: "solid",
		ornamentKind: "burst-rays",
		accentColors: ["#facc15", "#ef4444", "#f97316", "#111827"],
		materialDetail: "rich",
	},
	fire: {
		backgroundKind: "fire",
		textFillKind: "hot",
		ornamentKind: "fire",
		accentColors: ["#450a0a", "#b91c1c", "#fb923c", "#facc15"],
		materialDetail: "rich",
	},
	glass: {
		backgroundKind: "glass",
		textFillKind: "ice",
		ornamentKind: "sparkles",
		accentColors: ["#172554", "#0891b2", "#ffffff", "#67e8f9"],
		materialDetail: "rich",
	},
	glitch: {
		backgroundKind: "glitch",
		textFillKind: "neon",
		ornamentKind: "glitch",
		accentColors: ["#111827", "#22d3ee", "#fb7185", "#ffffff"],
		materialDetail: "rich",
	},
	glow: {
		backgroundKind: "gradient",
		textFillKind: "neon",
		ornamentKind: "sparkles",
		accentColors: ["#083344", "#06b6d4", "#f0abfc", "#ecfeff"],
		materialDetail: "rich",
	},
	gold: {
		backgroundKind: "gold",
		textFillKind: "gold",
		ornamentKind: "sparkles",
		accentColors: ["#2b1d08", "#8a5a12", "#facc15", "#fff7ed"],
		materialDetail: "rich",
	},
	"gradient-duotone": {
		backgroundKind: "gradient",
		textFillKind: "pastel",
		ornamentKind: "sparkles",
		accentColors: ["#7c3aed", "#ec4899", "#f97316", "#ffffff"],
		materialDetail: "rich",
	},
	"gradient-shine": {
		backgroundKind: "gradient",
		textFillKind: "ice",
		ornamentKind: "sparkles",
		accentColors: ["#0891b2", "#9333ea", "#fb7185", "#ecfeff"],
		materialDetail: "rich",
	},
	"green-fresh": {
		backgroundKind: "soft",
		textFillKind: "solid",
		ornamentKind: "confetti",
		accentColors: ["#14532d", "#16a34a", "#bef264", "#f0fdf4"],
		materialDetail: "standard",
	},
	ink: {
		backgroundKind: "ink",
		textFillKind: "texture",
		ornamentKind: "grain",
		accentColors: ["#292524", "#57534e", "#e7e5e4", "#ffffff"],
		materialDetail: "rich",
	},
	lava: {
		backgroundKind: "lava",
		textFillKind: "hot",
		ornamentKind: "fire",
		accentColors: ["#1c1917", "#450a0a", "#ef4444", "#facc15"],
		materialDetail: "rich",
	},
	pixel: {
		backgroundKind: "pixel",
		textFillKind: "solid",
		ornamentKind: "grain",
		accentColors: ["#27272a", "#52525b", "#facc15", "#111827"],
		materialDetail: "standard",
	},
	"pink-heart": {
		backgroundKind: "candy",
		textFillKind: "pastel",
		ornamentKind: "sticker",
		accentColors: ["#be185d", "#f9a8d4", "#ffffff", "#831843"],
		materialDetail: "rich",
	},
	"purple-dream": {
		backgroundKind: "gradient",
		textFillKind: "pastel",
		ornamentKind: "sparkles",
		accentColors: ["#2e1065", "#7c3aed", "#f0abfc", "#ffffff"],
		materialDetail: "rich",
	},
	"red-burst": {
		backgroundKind: "burst",
		textFillKind: "hot",
		ornamentKind: "burst-rays",
		accentColors: ["#7f1d1d", "#ef4444", "#facc15", "#111827"],
		materialDetail: "rich",
	},
	"texture-grain": {
		backgroundKind: "texture",
		textFillKind: "texture",
		ornamentKind: "grain",
		accentColors: ["#292524", "#57534e", "#a8a29e", "#fafaf9"],
		materialDetail: "rich",
	},
	"torn-paper": {
		backgroundKind: "paper",
		textFillKind: "solid",
		ornamentKind: "torn-paper",
		accentColors: ["#3f3f46", "#f5f5f4", "#a8a29e", "#111827"],
		materialDetail: "rich",
	},
	warning: {
		backgroundKind: "warning",
		textFillKind: "solid",
		ornamentKind: "burst-rays",
		accentColors: ["#4a421d", "#facc15", "#111827", "#fef9c3"],
		materialDetail: "standard",
	},
};

export function getTextTemplateThumbnailRecipe({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateThumbnailRecipe {
	return (
		STYLE_RECIPES[definition.variantId] ?? {
			backgroundKind: "solid",
			textFillKind: "solid",
			ornamentKind: definition.variantId === "sticker" ? "sticker" : "none",
			accentColors: ["#3a3a3a", "#ffffff", "#111827", "#60a5fa"],
			materialDetail: "standard",
		}
	);
}

export function getTextTemplateThumbnailLayoutKind({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateThumbnailLayoutKind {
	if (
		definition.category === "headline-template" ||
		definition.category === "quote-template" ||
		definition.category === "list-template" ||
		definition.category === "split-template" ||
		definition.category === "timeline-template"
	) {
		return "pack";
	}
	return "single";
}

export function getTextTemplatePackPreviewModel({
	definition,
	pack,
	template,
}: {
	definition: TextTemplateDefinition;
	pack?: TextTemplatePackPayload;
	template: TextElement;
}): TextTemplatePackPreviewModel | null {
	const resolvedPack =
		pack ?? buildTextTemplatePack({ baseTemplate: template, definition });
	if (!resolvedPack) return null;
	return {
		kind: getTextTemplatePackPreviewKind({ definition }),
		layerCount: resolvedPack.elements.length,
		decorations: getTextTemplatePackPreviewDecorations({ definition }),
		elements: resolvedPack.elements.map((element, index) =>
			toPackPreviewElement({ element, index })
		),
		slots: resolvedPack.copySlots.map((slot) => ({
			id: slot.id,
			content: slot.defaultContent,
			label: slot.label,
		})),
	};
}

function toPackPreviewElement({
	element,
	index,
}: {
	element: CreateTextElement;
	index: number;
}): TextTemplatePackPreviewElement {
	return {
		id: `element-${index}`,
		backgroundColor: element.backgroundColor ?? "transparent",
		backgroundOpacity: element.backgroundOpacity ?? 0,
		backgroundPadding: element.backgroundPadding ?? 0,
		backgroundRadius: element.backgroundRadius ?? 0,
		color: element.color ?? "#ffffff",
		content: element.content,
		fontSize: element.fontSize ?? 48,
		height: element.height ?? element.fontSize ?? 72,
		name: element.name ?? `Element ${index + 1}`,
		opacity: element.opacity ?? 1,
		rotation: element.rotation ?? 0,
		strokeColor: element.strokeColor,
		strokeWidth: element.strokeWidth ?? 0,
		textAlign: element.textAlign ?? "center",
		width: element.width ?? 320,
		x: element.x ?? 0,
		y: element.y ?? 0,
	};
}

function getTextTemplatePackPreviewKind({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplatePackPreviewKind {
	if (definition.category === "quote-template") return "quote";
	if (definition.category === "list-template") return "list";
	if (definition.category === "split-template") return "split";
	if (definition.category === "timeline-template") return "timeline";
	return "headline";
}

function getTextTemplatePackPreviewDecorations({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplatePackPreviewDecoration[] {
	if (definition.category === "list-template") {
		return [
			{
				id: "list-rail",
				kind: "line",
				color: "rgba(255,255,255,.58)",
				opacity: 0.72,
				strokeWidth: 8,
				x1: 86,
				x2: 86,
				y1: 232,
				y2: 356,
			},
			{
				id: "list-node-1",
				kind: "circle",
				color: definition.overrides?.glowColor ?? "#38bdf8",
				opacity: 0.95,
				radius: 22,
				x: 86,
				y: 255,
			},
			{
				id: "list-node-2",
				kind: "circle",
				color: definition.overrides?.glowColor ?? "#38bdf8",
				opacity: 0.82,
				radius: 20,
				x: 86,
				y: 337,
			},
		];
	}
	if (definition.category === "split-template") {
		return [
			{
				id: "split-divider",
				kind: "line",
				color: definition.overrides?.glowColor ?? "#38bdf8",
				opacity: 0.8,
				strokeWidth: 10,
				x1: 480,
				x2: 480,
				y1: 96,
				y2: 292,
			},
		];
	}
	if (definition.category === "timeline-template") {
		return [
			{
				id: "timeline-rail",
				kind: "line",
				color: "rgba(255,255,255,.72)",
				opacity: 0.84,
				strokeWidth: 12,
				x1: 142,
				x2: 798,
				y1: 166,
				y2: 166,
			},
			...[
				{ id: "timeline-node-1", x: 142, radius: 25, opacity: 0.78 },
				{ id: "timeline-node-2", x: 500, radius: 32, opacity: 0.95 },
				{ id: "timeline-node-3", x: 798, radius: 25, opacity: 0.78 },
			].map(
				(node): TextTemplatePackPreviewDecoration => ({
					id: node.id,
					kind: "circle",
					color: definition.overrides?.glowColor ?? "#38bdf8",
					opacity: node.opacity,
					radius: node.radius,
					x: node.x,
					y: 166,
				})
			),
		];
	}
	if (definition.category === "quote-template") {
		return [
			{
				id: "quote-panel",
				kind: "pill",
				color: "rgba(255,255,255,.14)",
				height: 230,
				opacity: 0.86,
				radius: 34,
				width: 800,
				x: 136,
				y: 78,
			},
		];
	}
	return [
		{
			id: "headline-panel",
			kind: "pill",
			color: "rgba(255,255,255,.13)",
			height: 318,
			opacity: 0.84,
			radius: 34,
			width: 842,
			x: 88,
			y: 68,
		},
		{
			id: "headline-rule",
			kind: "line",
			color: definition.overrides?.glowColor ?? "#38bdf8",
			opacity: 0.78,
			strokeWidth: 9,
			x1: 116,
			x2: 462,
			y1: 298,
			y2: 298,
		},
	];
}

function fillRoundedRect({
	context,
	height,
	radius,
	width,
	x,
	y,
}: {
	context: CanvasRenderingContext2D;
	height: number;
	radius: number;
	width: number;
	x: number;
	y: number;
}) {
	context.beginPath();
	context.moveTo(x + radius, y);
	context.lineTo(x + width - radius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + radius);
	context.lineTo(x + width, y + height - radius);
	context.quadraticCurveTo(
		x + width,
		y + height,
		x + width - radius,
		y + height
	);
	context.lineTo(x + radius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
	context.fill();
}

function createLinearGradient({
	colors,
	context,
	fromX,
	fromY,
	toX,
	toY,
}: {
	colors: readonly string[];
	context: CanvasRenderingContext2D;
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
}): CanvasGradient {
	const gradient = context.createLinearGradient(fromX, fromY, toX, toY);
	const lastIndex = Math.max(1, colors.length - 1);
	for (const [index, color] of colors.entries()) {
		gradient.addColorStop(index / lastIndex, color);
	}
	return gradient;
}

function createRadialGradient({
	colors,
	context,
	height,
	width,
}: {
	colors: readonly string[];
	context: CanvasRenderingContext2D;
	height: number;
	width: number;
}): CanvasGradient {
	const gradient = context.createRadialGradient(
		width * 0.52,
		height * 0.62,
		width * 0.05,
		width * 0.5,
		height * 0.5,
		width * 0.65
	);
	const lastIndex = Math.max(1, colors.length - 1);
	for (const [index, color] of colors.entries()) {
		gradient.addColorStop(index / lastIndex, color);
	}
	return gradient;
}

function drawBackground({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [dark, mid, light, accent] = recipe.accentColors;
	context.clearRect(0, 0, width, height);

	if (recipe.backgroundKind === "burst" || recipe.backgroundKind === "comic") {
		for (let index = 0; index < 28; index += 1) {
			context.beginPath();
			context.moveTo(width / 2, height / 2);
			context.arc(
				width / 2,
				height / 2,
				width,
				(index * Math.PI * 2) / 28,
				((index + 0.62) * Math.PI * 2) / 28
			);
			context.closePath();
			context.fillStyle = index % 2 === 0 ? dark : mid;
			context.fill();
		}
		context.fillStyle = recipe.backgroundKind === "comic" ? light : accent;
		context.globalAlpha = 0.28;
		fillRoundedRect({
			context,
			height: height * 0.54,
			radius: 18,
			width: width * 0.72,
			x: width * 0.14,
			y: height * 0.23,
		});
		context.globalAlpha = 1;
		drawHalftoneDots({ context, height, opacity: 0.18, width });
		drawSurfaceDepth({ context, height, recipe, width });
		return;
	}

	if (recipe.backgroundKind === "fire" || recipe.backgroundKind === "lava") {
		context.fillStyle = createRadialGradient({
			colors: [accent, light, mid, dark],
			context,
			height,
			width,
		});
		context.fillRect(0, 0, width, height);
		drawHeatVeins({ context, height, recipe, width });
		drawSurfaceDepth({ context, height, recipe, width });
		return;
	}

	if (recipe.backgroundKind === "warning") {
		context.fillStyle = dark;
		context.fillRect(0, 0, width, height);
		context.fillStyle = mid;
		for (let x = -width; x < width * 2; x += 22) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x + 13, 0);
			context.lineTo(x + width, height);
			context.lineTo(x + width - 13, height);
			context.closePath();
			context.fill();
		}
		drawSurfaceDepth({ context, height, recipe, width });
		return;
	}

	context.fillStyle = createLinearGradient({
		colors: recipe.accentColors,
		context,
		fromX: 0,
		fromY: 0,
		toX: width,
		toY: height,
	});
	context.fillRect(0, 0, width, height);

	if (
		recipe.backgroundKind === "texture" ||
		recipe.backgroundKind === "ink" ||
		recipe.backgroundKind === "chrome"
	) {
		drawGrain({ context, height, opacity: 0.24, width });
	}

	if (recipe.backgroundKind === "pixel") {
		context.fillStyle = "rgba(255,255,255,.08)";
		for (let x = 0; x < width; x += 12) {
			for (let y = 0; y < height; y += 12) {
				if ((x + y) % 24 === 0) context.fillRect(x, y, 6, 6);
			}
		}
	}

	if (recipe.backgroundKind === "paper") {
		context.fillStyle = "rgba(255,255,255,.82)";
		context.beginPath();
		context.moveTo(width * 0.08, height * 0.24);
		context.lineTo(width * 0.9, height * 0.16);
		context.lineTo(width * 0.84, height * 0.78);
		context.lineTo(width * 0.16, height * 0.86);
		context.closePath();
		context.fill();
		drawPaperFibers({ context, height, width });
	}

	if (recipe.backgroundKind === "glass" || recipe.backgroundKind === "ice") {
		context.fillStyle = "rgba(255,255,255,.28)";
		context.beginPath();
		context.ellipse(width * 0.25, height * 0.18, 26, 16, -0.4, 0, Math.PI * 2);
		context.fill();
	}

	drawSurfaceDepth({ context, height, recipe, width });
}

function drawGrain({
	context,
	height,
	opacity,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	opacity: number;
}) {
	context.save();
	context.globalAlpha = opacity;
	for (let index = 0; index < 92; index += 1) {
		const x = (index * 37) % width;
		const y = (index * 53) % height;
		context.fillStyle = index % 3 === 0 ? "#ffffff" : "#000000";
		context.fillRect(x, y, 1 + (index % 2), 1 + (index % 2));
	}
	context.restore();
}

function drawSurfaceDepth({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}) {
	context.save();
	context.globalAlpha = recipe.materialDetail === "rich" ? 0.36 : 0.2;
	context.fillStyle = createRadialGradient({
		colors: ["rgba(255,255,255,.38)", "rgba(255,255,255,0)", "rgba(0,0,0,.52)"],
		context,
		height,
		width,
	});
	context.fillRect(0, 0, width, height);
	context.globalAlpha = 1;
	context.strokeStyle = "rgba(255,255,255,.2)";
	context.lineWidth = 2;
	context.strokeRect(1, 1, width - 2, height - 2);
	context.strokeStyle = "rgba(0,0,0,.34)";
	context.strokeRect(4, 4, width - 8, height - 8);
	if (recipe.materialDetail === "rich") {
		drawGrain({ context, height, opacity: 0.18, width });
	}
	context.restore();
}

function drawHalftoneDots({
	context,
	height,
	opacity,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	opacity: number;
}) {
	context.save();
	context.globalAlpha = opacity;
	context.fillStyle = "#111827";
	for (let y = 12; y < height; y += 15) {
		for (let x = 10; x < width; x += 15) {
			const radius = 1.5 + ((x + y) % 5);
			context.beginPath();
			context.arc(x, y, radius, 0, Math.PI * 2);
			context.fill();
		}
	}
	context.restore();
}

function drawHeatVeins({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	context.save();
	context.globalAlpha = 0.42;
	for (let index = 0; index < 8; index += 1) {
		const y = height * (0.15 + index * 0.09);
		context.strokeStyle = index % 2 === 0 ? light : accent;
		context.lineWidth = 2 + (index % 3);
		context.beginPath();
		context.moveTo(-10, y);
		context.bezierCurveTo(
			width * 0.24,
			y - 26,
			width * 0.64,
			y + 24,
			width + 10,
			y - 8
		);
		context.stroke();
	}
	context.globalAlpha = 0.2;
	context.fillStyle = mid;
	context.fillRect(width * 0.1, height * 0.72, width * 0.8, 3);
	context.restore();
}

function drawPaperFibers({
	context,
	height,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
}) {
	context.save();
	context.globalAlpha = 0.22;
	context.strokeStyle = "#78716c";
	for (let index = 0; index < 24; index += 1) {
		const y = height * (0.22 + (index % 14) * 0.045);
		const x = width * (0.12 + ((index * 7) % 18) * 0.035);
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x + 24 + (index % 5) * 9, y + (index % 3) * 2);
		context.stroke();
	}
	context.restore();
}

function drawOrnaments({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	if (recipe.ornamentKind === "fire") {
		for (let index = 0; index < 7; index += 1) {
			const x = width * (0.18 + index * 0.1);
			const flameHeight = height * (0.25 + (index % 3) * 0.08);
			context.fillStyle = index % 2 === 0 ? accent : mid;
			context.beginPath();
			context.moveTo(x, height * 0.83);
			context.quadraticCurveTo(
				x - 11,
				height * 0.68,
				x + 3,
				height * 0.83 - flameHeight
			);
			context.quadraticCurveTo(x + 15, height * 0.68, x + 10, height * 0.83);
			context.closePath();
			context.fill();
		}
		return;
	}

	if (recipe.ornamentKind === "glitch") {
		context.fillStyle = light;
		context.fillRect(width * 0.08, height * 0.24, width * 0.44, 2);
		context.fillStyle = mid;
		context.fillRect(width * 0.34, height * 0.7, width * 0.5, 2);
		context.fillStyle = accent;
		context.fillRect(width * 0.14, height * 0.52, width * 0.24, 7);
		return;
	}

	if (recipe.ornamentKind === "sticker") {
		context.save();
		context.shadowColor = "rgba(0,0,0,.35)";
		context.shadowBlur = 6;
		context.fillStyle = "rgba(255,255,255,.9)";
		fillRoundedRect({
			context,
			height: height * 0.62,
			radius: 18,
			width: width * 0.78,
			x: width * 0.11,
			y: height * 0.2,
		});
		context.restore();
		return;
	}

	if (
		recipe.ornamentKind === "sparkles" ||
		recipe.ornamentKind === "confetti"
	) {
		for (let index = 0; index < 10; index += 1) {
			const x = (index * 31) % width;
			const y = (index * 19) % height;
			context.fillStyle = index % 2 === 0 ? light : accent;
			context.globalAlpha = 0.74;
			context.fillRect(x, y, 3, 3);
		}
		context.globalAlpha = 1;
		return;
	}

	if (recipe.ornamentKind === "grain") {
		drawGrain({ context, height, opacity: 0.32, width });
	}
}

function getTextFill({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}): CanvasGradient | string {
	if (recipe.textFillKind === "solid")
		return recipe.accentColors[3] ?? "#ffffff";
	const colorsByKind: Record<
		Exclude<TextThumbnailTextFillKind, "solid">,
		string[]
	> = {
		chrome: ["#ffffff", "#a3a3a3", "#f8fafc", "#404040"],
		gold: ["#fff7ed", "#facc15", "#92400e"],
		hot: ["#fff7ed", "#facc15", "#ef4444"],
		ice: ["#ffffff", "#7dd3fc", "#2563eb"],
		neon: ["#ecfeff", "#67e8f9", "#f9a8d4"],
		pastel: ["#ffffff", "#f0abfc", "#fb7185"],
		texture: ["#fafaf9", "#a8a29e", "#57534e"],
	};
	return createLinearGradient({
		colors: colorsByKind[recipe.textFillKind],
		context,
		fromX: 0,
		fromY: height * 0.18,
		toX: width,
		toY: height * 0.82,
	});
}

function drawText({
	context,
	definition,
	height,
	recipe,
	template,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	definition: TextTemplateDefinition;
	recipe: TextTemplateThumbnailRecipe;
	template: TextElement;
}) {
	const content = getThumbnailPreviewContent({ definition, template });
	const fontSize = Math.min(
		108,
		Math.max(70, width / Math.max(2.1, content.length * 0.7))
	);
	const fontFamily = definition.variantId === "pixel" ? "monospace" : "Arial";
	const strokeWidth = Math.max(
		6,
		Math.min(13, (template.strokeWidth ?? 1) * 1.9)
	);

	context.save();
	context.translate(width / 2, height / 2 + 2);
	context.rotate(((template.rotation ?? 0) * Math.PI) / 180);
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.font = `900 ${fontSize}px ${canvasFontFamily(fontFamily)}`;
	context.lineJoin = "round";
	context.miterLimit = 2;
	context.shadowColor = template.shadowColor ?? "rgba(0,0,0,.7)";
	context.shadowBlur = Math.min(30, (template.shadowBlur ?? 8) * 2);
	context.shadowOffsetX = Math.min(17, (template.shadowOffsetX ?? 4) * 2);
	context.shadowOffsetY = Math.min(18, (template.shadowOffsetY ?? 4) * 2);

	if (recipe.ornamentKind === "glitch") {
		context.fillStyle = "#22d3ee";
		context.fillText(content, -3, 0);
		context.fillStyle = "#fb7185";
		context.fillText(content, 3, 0);
	}

	context.strokeStyle = "rgba(0,0,0,.72)";
	context.lineWidth = strokeWidth + 7;
	context.strokeText(content, 0, 0);
	context.strokeStyle = "#ffffff";
	context.lineWidth = strokeWidth + 3;
	context.strokeText(content, 0, 0);
	context.strokeStyle =
		definition.variantId === "red-burst"
			? "#111827"
			: definition.variantId === "sticker"
				? "#ffffff"
				: recipe.accentColors[1];
	context.lineWidth = Math.max(1, strokeWidth);
	context.strokeText(content, 0, 0);
	context.fillStyle = getTextFill({ context, height, recipe, width });
	context.fillText(content, 0, 0);
	drawTextHighlight({ content, context, fontSize, height, recipe, width });

	context.restore();
}

export function getThumbnailPreviewContent({
	definition,
	template,
}: {
	definition: TextTemplateDefinition;
	template: TextElement;
}): string {
	if (definition.groupId === "fancy") return "花字";
	if (definition.category === "basic") return "文字";
	if (definition.category === "caption") return "说明";
	if (definition.category === "headline-template") return "标题";
	if (definition.category === "quote-template") return "金句";
	if (definition.category === "list-template") return "清单";
	if (definition.category === "split-template") return "对比";
	if (definition.category === "timeline-template") return "阶段";
	if (definition.category === "summary") return "摘要";
	if (definition.category === "key-point") return "重点";
	if (definition.category === "chapter") return "章节";
	if (definition.category === "subtitle-title") return "标题";
	if (definition.category === "rewrite") return "改写";

	const content = template.content || definition.content;
	const characters = Array.from(content.trim());
	if (characters.length <= 4) return content;
	if (/^[\w\s-]+$/.test(content)) return "文字";
	return characters.slice(0, 4).join("");
}

function drawTextHighlight({
	content,
	context,
	fontSize,
	height,
	recipe,
	width,
}: CanvasSize & {
	content: string;
	context: CanvasRenderingContext2D;
	fontSize: number;
	recipe: TextTemplateThumbnailRecipe;
}) {
	context.save();
	context.shadowColor = "transparent";
	context.globalAlpha = recipe.materialDetail === "rich" ? 0.52 : 0.34;
	context.fillStyle = createLinearGradient({
		colors: ["rgba(255,255,255,.85)", "rgba(255,255,255,.08)"],
		context,
		fromX: -width * 0.32,
		fromY: -fontSize * 0.7,
		toX: width * 0.35,
		toY: fontSize * 0.2,
	});
	context.save();
	context.beginPath();
	context.rect(-width * 0.5, -height * 0.38, width, height * 0.28);
	context.clip();
	context.fillText(content, 0, -fontSize * 0.08);
	context.restore();
	context.globalAlpha = 1;
	context.strokeStyle = "rgba(255,255,255,.42)";
	context.lineWidth = 1.5;
	context.strokeText(content, 0, -1);
	context.restore();
}

function drawPackText({
	align = "center",
	color,
	context,
	fontSize,
	text,
	weight = 900,
	x,
	y,
}: {
	align?: CanvasTextAlign;
	color: string | CanvasGradient;
	context: CanvasRenderingContext2D;
	fontSize: number;
	text: string;
	weight?: number;
	x: number;
	y: number;
}) {
	context.save();
	context.textAlign = align;
	context.textBaseline = "middle";
	context.font = `${weight} ${fontSize}px Arial, sans-serif`;
	context.lineJoin = "round";
	context.shadowColor = "rgba(0,0,0,.42)";
	context.shadowBlur = 8;
	context.shadowOffsetY = 4;
	context.strokeStyle = "rgba(0,0,0,.58)";
	context.lineWidth = Math.max(3, fontSize * 0.1);
	context.strokeText(text, x, y);
	context.fillStyle = color;
	context.fillText(text, x, y);
	context.restore();
}

function drawPackPill({
	context,
	fillStyle,
	height,
	radius,
	width,
	x,
	y,
}: {
	context: CanvasRenderingContext2D;
	fillStyle: string | CanvasGradient;
	height: number;
	radius: number;
	width: number;
	x: number;
	y: number;
}) {
	context.save();
	context.fillStyle = fillStyle;
	context.shadowColor = "rgba(0,0,0,.35)";
	context.shadowBlur = 8;
	context.shadowOffsetY = 4;
	fillRoundedRect({ context, height, radius, width, x, y });
	context.restore();
}

function drawPackPreviewCard({
	context,
	height,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [dark, mid, light] = recipe.accentColors;
	context.save();
	context.fillStyle = "rgba(255,255,255,.13)";
	fillRoundedRect({
		context,
		height: height * 0.74,
		radius: 18,
		width: width * 0.82,
		x: width * 0.09,
		y: height * 0.13,
	});
	context.strokeStyle = "rgba(255,255,255,.18)";
	context.lineWidth = 2;
	context.strokeRect(width * 0.1, height * 0.14, width * 0.8, height * 0.72);
	context.fillStyle = createLinearGradient({
		colors: [`${dark}cc`, `${mid}99`, `${light}44`],
		context,
		fromX: width * 0.1,
		fromY: height * 0.14,
		toX: width * 0.9,
		toY: height * 0.86,
	});
	fillRoundedRect({
		context,
		height: height * 0.72,
		radius: 18,
		width: width * 0.8,
		x: width * 0.1,
		y: height * 0.14,
	});
	context.restore();
}

function getPackPreviewSlotContent({
	fallback,
	maxCharacters,
	model,
	slotId,
}: {
	fallback: string;
	maxCharacters: number;
	model: TextTemplatePackPreviewModel;
	slotId: string;
}): string {
	const content =
		model.slots.find((slot) => slot.id === slotId)?.content ?? fallback;
	return truncatePackPreviewText({ maxCharacters, text: content || fallback });
}

function truncatePackPreviewText({
	maxCharacters,
	text,
}: {
	maxCharacters: number;
	text: string;
}): string {
	const characters = Array.from(text.trim());
	if (characters.length <= maxCharacters) return text.trim();
	return characters.slice(0, maxCharacters).join("");
}

function drawHeadlinePackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	drawPackPreviewCard({ context, height, recipe, width });
	drawPackPill({
		context,
		fillStyle: accent,
		height: height * 0.11,
		radius: 13,
		width: width * 0.34,
		x: width * 0.18,
		y: height * 0.21,
	});
	drawPackText({
		align: "left",
		color: "#020617",
		context,
		fontSize: 20,
		text: getPackPreviewSlotContent({
			fallback: "本期重点",
			maxCharacters: 5,
			model,
			slotId: "kicker",
		}),
		weight: 800,
		x: width * 0.22,
		y: height * 0.265,
	});
	drawPackText({
		align: "left",
		color: light,
		context,
		fontSize: 52,
		text: getPackPreviewSlotContent({
			fallback: "标题",
			maxCharacters: 5,
			model,
			slotId: "headline",
		}),
		x: width * 0.18,
		y: height * 0.48,
	});
	drawPackText({
		align: "left",
		color: mid,
		context,
		fontSize: 25,
		text: getPackPreviewSlotContent({
			fallback: "三句话讲清楚",
			maxCharacters: 7,
			model,
			slotId: "subhead",
		}),
		weight: 800,
		x: width * 0.19,
		y: height * 0.67,
	});
}

function drawQuotePackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	drawPackPreviewCard({ context, height, recipe, width });
	drawPackText({
		color: accent,
		context,
		fontSize: 82,
		text: "“",
		x: width * 0.24,
		y: height * 0.36,
	});
	drawPackText({
		align: "left",
		color: light,
		context,
		fontSize: 42,
		text: getPackPreviewSlotContent({
			fallback: "金句",
			maxCharacters: 5,
			model,
			slotId: "quote",
		}),
		x: width * 0.35,
		y: height * 0.48,
	});
	drawPackText({
		align: "left",
		color: mid,
		context,
		fontSize: 22,
		text: `— ${getPackPreviewSlotContent({
			fallback: "观点摘录",
			maxCharacters: 5,
			model,
			slotId: "attribution",
		}).replace(/^—\s*/, "")}`,
		weight: 800,
		x: width * 0.37,
		y: height * 0.67,
	});
}

function drawListPackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	drawPackPreviewCard({ context, height, recipe, width });
	drawPackText({
		align: "left",
		color: light,
		context,
		fontSize: 40,
		text: getPackPreviewSlotContent({
			fallback: "清单",
			maxCharacters: 5,
			model,
			slotId: "title",
		}),
		x: width * 0.2,
		y: height * 0.32,
	});
	for (const [index, label] of ["item-1", "item-2"].entries()) {
		const y = height * (0.5 + index * 0.16);
		context.fillStyle = accent;
		context.beginPath();
		context.arc(width * 0.24, y, 13, 0, Math.PI * 2);
		context.fill();
		drawPackText({
			color: "#020617",
			context,
			fontSize: 16,
			text: String(index + 1).padStart(2, "0"),
			weight: 900,
			x: width * 0.24,
			y,
		});
		drawPackPill({
			context,
			fillStyle: "rgba(255,255,255,.2)",
			height: height * 0.055,
			radius: 8,
			width: width * (index === 0 ? 0.42 : 0.34),
			x: width * 0.32,
			y: y - height * 0.027,
		});
		drawPackText({
			align: "left",
			color: "rgba(255,255,255,.86)",
			context,
			fontSize: 15,
			text: getPackPreviewSlotContent({
				fallback: index === 0 ? "关键动作" : "避坑提醒",
				maxCharacters: 5,
				model,
				slotId: label,
			}).replace(/^\d+\s*/, ""),
			weight: 800,
			x: width * 0.34,
			y,
		});
	}
	drawPackText({
		align: "left",
		color: mid,
		context,
		fontSize: 18,
		text: "步骤模板",
		weight: 800,
		x: width * 0.2,
		y: height * 0.78,
	});
}

function drawSplitPackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [dark, mid, light, accent] = recipe.accentColors;
	drawPackPreviewCard({ context, height, recipe, width });
	for (const [index, slotId] of ["left", "right"].entries()) {
		const x = width * (index === 0 ? 0.16 : 0.54);
		drawPackPill({
			context,
			fillStyle: index === 0 ? `${dark}cc` : `${mid}cc`,
			height: height * 0.42,
			radius: 18,
			width: width * 0.3,
			x,
			y: height * 0.3,
		});
		drawPackText({
			color: light,
			context,
			fontSize: 28,
			text: getPackPreviewSlotContent({
				fallback: index === 0 ? "之前" : "之后",
				maxCharacters: 4,
				model,
				slotId,
			}),
			x: x + width * 0.15,
			y: height * 0.51,
		});
	}
	drawPackText({
		color: accent,
		context,
		fontSize: 38,
		text: "VS",
		x: width * 0.5,
		y: height * 0.5,
	});
}

function drawTimelinePackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const [, mid, light, accent] = recipe.accentColors;
	drawPackPreviewCard({ context, height, recipe, width });
	context.save();
	context.strokeStyle = "rgba(255,255,255,.72)";
	context.lineWidth = 5;
	context.lineCap = "round";
	context.beginPath();
	context.moveTo(width * 0.2, height * 0.5);
	context.lineTo(width * 0.8, height * 0.5);
	context.stroke();
	context.restore();
	for (const [index, slotId] of ["stage-1", "stage-2", "stage-3"].entries()) {
		const x = width * (0.2 + index * 0.3);
		context.fillStyle = index === 1 ? accent : mid;
		context.beginPath();
		context.arc(x, height * 0.5, index === 1 ? 23 : 18, 0, Math.PI * 2);
		context.fill();
		drawPackText({
			color: index === 1 ? "#020617" : light,
			context,
			fontSize: index === 1 ? 20 : 18,
			text: getPackPreviewSlotContent({
				fallback: index === 0 ? "阶段 1" : index === 1 ? "阶段" : "结果",
				maxCharacters: index === 1 ? 3 : 4,
				model,
				slotId,
			}).replace(/^阶段\s*/, index === 0 ? "" : "阶段"),
			weight: 900,
			x,
			y: height * (index === 1 ? 0.5 : 0.69),
		});
	}
}

export type TextTemplatePackPreviewBounds = {
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
};

export type TextTemplatePackPreviewElementVisualRect = {
	height: number;
	width: number;
	x: number;
	y: number;
};

type TextTemplatePackPreviewVisualRect =
	TextTemplatePackPreviewElementVisualRect;

function estimatePackPreviewTextWidth({
	element,
}: {
	element: TextTemplatePackPreviewElement;
}): number {
	const contentWidth = Array.from(element.content.trim()).reduce(
		(width, character) =>
			width +
			element.fontSize * (/^[\x20-\x7e]$/.test(character) ? 0.56 : 0.94),
		0
	);
	const paddedWidth = contentWidth + element.backgroundPadding * 2;
	return Math.min(element.width, Math.max(element.fontSize * 1.4, paddedWidth));
}

export function getTextTemplatePackPreviewElementVisualRect({
	element,
}: {
	element: TextTemplatePackPreviewElement;
}): TextTemplatePackPreviewElementVisualRect {
	const width = estimatePackPreviewTextWidth({ element });
	const x =
		element.textAlign === "right" || element.textAlign === "end"
			? element.x + element.width - width
			: element.textAlign === "center"
				? element.x + (element.width - width) / 2
				: element.x;
	return {
		height: element.height,
		width,
		x,
		y: element.y,
	};
}

export function getTextTemplatePackPreviewDecorationVisualRect({
	decoration,
}: {
	decoration: TextTemplatePackPreviewDecoration;
}): TextTemplatePackPreviewVisualRect {
	if (decoration.kind === "circle") {
		return {
			height: decoration.radius * 2,
			width: decoration.radius * 2,
			x: decoration.x - decoration.radius,
			y: decoration.y - decoration.radius,
		};
	}
	if (decoration.kind === "line") {
		const padding = decoration.strokeWidth / 2;
		return {
			height: Math.abs(decoration.y2 - decoration.y1) + padding * 2,
			width: Math.abs(decoration.x2 - decoration.x1) + padding * 2,
			x: Math.min(decoration.x1, decoration.x2) - padding,
			y: Math.min(decoration.y1, decoration.y2) - padding,
		};
	}
	return {
		height: decoration.height,
		width: decoration.width,
		x: decoration.x,
		y: decoration.y,
	};
}

export function getTextTemplatePackPreviewBounds({
	decorations = [],
	elements,
}: {
	decorations?: readonly TextTemplatePackPreviewDecoration[];
	elements: readonly TextTemplatePackPreviewElement[];
}): TextTemplatePackPreviewBounds {
	const rects: TextTemplatePackPreviewVisualRect[] = [
		...decorations.map((decoration) =>
			getTextTemplatePackPreviewDecorationVisualRect({ decoration })
		),
		...elements.map((element) =>
			getTextTemplatePackPreviewElementVisualRect({ element })
		),
	];
	const firstRect = rects[0];
	if (!firstRect) return { maxX: 1, maxY: 1, minX: 0, minY: 0 };
	return rects.reduce(
		(bounds, rect) => {
			return {
				maxX: Math.max(bounds.maxX, rect.x + rect.width),
				maxY: Math.max(bounds.maxY, rect.y + rect.height),
				minX: Math.min(bounds.minX, rect.x),
				minY: Math.min(bounds.minY, rect.y),
			};
		},
		{
			maxX: firstRect.x + firstRect.width,
			maxY: firstRect.y + firstRect.height,
			minX: firstRect.x,
			minY: firstRect.y,
		}
	);
}

function mapPackPreviewVisualRect({
	bounds,
	height,
	rect,
	width,
}: CanvasSize & {
	bounds: TextTemplatePackPreviewBounds;
	rect: TextTemplatePackPreviewVisualRect;
}) {
	const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
	const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
	const target = {
		height: height * 0.68,
		width: width * 0.76,
		x: width * 0.12,
		y: height * 0.16,
	};
	const scale = Math.min(
		target.width / sourceWidth,
		target.height / sourceHeight
	);
	const scaledWidth = sourceWidth * scale;
	const scaledHeight = sourceHeight * scale;
	const offsetX = target.x + (target.width - scaledWidth) / 2;
	const offsetY = target.y + (target.height - scaledHeight) / 2;
	return {
		height: rect.height * scale,
		scale,
		width: rect.width * scale,
		x: offsetX + (rect.x - bounds.minX) * scale,
		y: offsetY + (rect.y - bounds.minY) * scale,
	};
}

function mapPackPreviewElementRect({
	bounds,
	element,
	height,
	width,
}: CanvasSize & {
	bounds: TextTemplatePackPreviewBounds;
	element: TextTemplatePackPreviewElement;
}) {
	return mapPackPreviewVisualRect({
		bounds,
		height,
		rect: getTextTemplatePackPreviewElementVisualRect({ element }),
		width,
	});
}

function mapPackPreviewDecorationRect({
	bounds,
	decoration,
	height,
	width,
}: CanvasSize & {
	bounds: TextTemplatePackPreviewBounds;
	decoration: TextTemplatePackPreviewDecoration;
}) {
	return mapPackPreviewVisualRect({
		bounds,
		height,
		rect: getTextTemplatePackPreviewDecorationVisualRect({ decoration }),
		width,
	});
}

function getPackPreviewTextX({
	align,
	width,
	x,
}: {
	align: CanvasTextAlign;
	width: number;
	x: number;
}): number {
	if (align === "left" || align === "start") return x;
	if (align === "right" || align === "end") return x + width;
	return x + width / 2;
}

function drawPackPreviewElement({
	context,
	element,
	height,
	recipe,
	scale,
	width,
	x,
	y,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	element: TextTemplatePackPreviewElement;
	recipe: TextTemplateThumbnailRecipe;
	scale: number;
	x: number;
	y: number;
}) {
	const fontSize = Math.max(13, Math.min(58, element.fontSize * scale));
	const text = truncatePackPreviewText({
		maxCharacters: Math.max(
			2,
			Math.floor(width / Math.max(1, fontSize * 0.54))
		),
		text: element.content,
	});

	context.save();
	context.globalAlpha = Math.max(0.18, Math.min(1, element.opacity));
	context.translate(x + width / 2, y + height / 2);
	context.rotate((element.rotation * Math.PI) / 180);
	context.translate(-(x + width / 2), -(y + height / 2));

	if (
		element.backgroundColor &&
		element.backgroundColor !== "transparent" &&
		element.backgroundOpacity > 0
	) {
		context.save();
		context.globalAlpha *= Math.min(1, element.backgroundOpacity);
		context.fillStyle = element.backgroundColor;
		fillRoundedRect({
			context,
			height: height + element.backgroundPadding * 0.45,
			radius: Math.max(4, element.backgroundRadius * 0.42),
			width: width + element.backgroundPadding * 0.9,
			x: x - element.backgroundPadding * 0.45,
			y: y - element.backgroundPadding * 0.22,
		});
		context.restore();
	}

	context.textAlign = element.textAlign;
	context.textBaseline = "middle";
	context.font = `900 ${fontSize}px Arial, sans-serif`;
	context.lineJoin = "round";
	context.shadowColor = "rgba(0,0,0,.46)";
	context.shadowBlur = 8;
	context.shadowOffsetY = 4;

	const textX = getPackPreviewTextX({
		align: element.textAlign,
		width,
		x,
	});
	const textY = y + height / 2;
	context.strokeStyle = "rgba(0,0,0,.62)";
	context.lineWidth = Math.max(2.5, fontSize * 0.12);
	context.strokeText(text, textX, textY);
	if (element.strokeWidth > 0) {
		context.strokeStyle = element.strokeColor ?? recipe.accentColors[1];
		context.lineWidth = Math.max(1, Math.min(8, element.strokeWidth * 0.75));
		context.strokeText(text, textX, textY);
	}
	context.fillStyle = element.color || recipe.accentColors[2];
	context.fillText(text, textX, textY);
	context.restore();
}

function drawPackPreviewDecoration({
	context,
	decoration,
	height,
	width,
	x,
	y,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	decoration: TextTemplatePackPreviewDecoration;
	x: number;
	y: number;
}) {
	context.save();
	context.globalAlpha = Math.max(0.05, Math.min(1, decoration.opacity));
	if (decoration.kind === "line") {
		context.strokeStyle = decoration.color;
		context.lineWidth = Math.max(2, Math.min(width, height));
		context.lineCap = "round";
		context.beginPath();
		if (decoration.y1 === decoration.y2) {
			context.moveTo(x, y + height / 2);
			context.lineTo(x + width, y + height / 2);
		} else if (decoration.x1 === decoration.x2) {
			context.moveTo(x + width / 2, y);
			context.lineTo(x + width / 2, y + height);
		} else {
			context.moveTo(x, y);
			context.lineTo(x + width, y + height);
		}
		context.stroke();
		context.restore();
		return;
	}
	if (decoration.kind === "circle") {
		context.fillStyle = decoration.color;
		context.shadowColor = "rgba(0,0,0,.32)";
		context.shadowBlur = 8;
		context.beginPath();
		context.arc(
			x + width / 2,
			y + height / 2,
			Math.min(width, height) / 2,
			0,
			Math.PI * 2
		);
		context.fill();
		context.restore();
		return;
	}
	context.fillStyle = decoration.color;
	context.shadowColor = "rgba(0,0,0,.32)";
	context.shadowBlur = 8;
	fillRoundedRect({
		context,
		height,
		radius: Math.max(4, Math.min(width, height, decoration.radius)),
		width,
		x,
		y,
	});
	context.restore();
}

function drawPackPreviewScene({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	const bounds = getTextTemplatePackPreviewBounds({
		decorations: model.decorations,
		elements: model.elements,
	});
	for (const decoration of model.decorations) {
		const rect = mapPackPreviewDecorationRect({
			bounds,
			decoration,
			height,
			width,
		});
		drawPackPreviewDecoration({
			context,
			decoration,
			height: rect.height,
			width: rect.width,
			x: rect.x,
			y: rect.y,
		});
	}
	for (const element of model.elements) {
		const rect = mapPackPreviewElementRect({
			bounds,
			element,
			height,
			width,
		});
		drawPackPreviewElement({
			context,
			element,
			height: rect.height,
			recipe,
			scale: rect.scale,
			width: rect.width,
			x: rect.x,
			y: rect.y,
		});
	}
}

function drawTemplatePackPreview({
	context,
	height,
	model,
	recipe,
	width,
}: CanvasSize & {
	context: CanvasRenderingContext2D;
	model: TextTemplatePackPreviewModel;
	recipe: TextTemplateThumbnailRecipe;
}) {
	if (model.elements.length > 0) {
		drawPackPreviewCard({ context, height, recipe, width });
		drawPackPreviewScene({ context, height, model, recipe, width });
		return;
	}
	if (model.kind === "quote") {
		drawQuotePackPreview({ context, height, model, recipe, width });
		return;
	}
	if (model.kind === "list") {
		drawListPackPreview({ context, height, model, recipe, width });
		return;
	}
	if (model.kind === "split") {
		drawSplitPackPreview({ context, height, model, recipe, width });
		return;
	}
	if (model.kind === "timeline") {
		drawTimelinePackPreview({ context, height, model, recipe, width });
		return;
	}
	drawHeadlinePackPreview({ context, height, model, recipe, width });
}

export function renderTextTemplateThumbnail({
	canvas,
	definition,
	pack,
	template,
}: {
	canvas: HTMLCanvasElement;
	definition: TextTemplateDefinition;
	pack?: TextTemplatePackPayload;
	template: TextElement;
}) {
	const context = canvas.getContext("2d");
	if (!context) return;

	const width = canvas.width;
	const height = canvas.height;
	const recipe = getTextTemplateThumbnailRecipe({ definition });

	drawBackground({ context, height, recipe, width });
	drawOrnaments({ context, height, recipe, width });
	if (getTextTemplateThumbnailLayoutKind({ definition }) === "pack") {
		const model = getTextTemplatePackPreviewModel({
			definition,
			pack,
			template,
		});
		if (model) {
			drawTemplatePackPreview({ context, height, model, recipe, width });
			return;
		}
		drawText({ context, definition, height, recipe, template, width });
		return;
	}
	drawText({ context, definition, height, recipe, template, width });
}
