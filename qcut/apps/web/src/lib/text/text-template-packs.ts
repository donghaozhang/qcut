import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	buildTextTemplate,
	type TextTemplateDefinition,
} from "@/lib/text/text-template-registry";
import type { CreateTextElement, TextElement } from "@/types/timeline";

export interface TextTemplatePack {
	id: string;
	name: string;
	category: TextTemplateDefinition["category"];
	elements: CreateTextElement[];
}

const PACK_TEMPLATE_CATEGORIES = new Set<TextTemplateDefinition["category"]>([
	"headline-template",
	"quote-template",
	"list-template",
	"split-template",
	"timeline-template",
]);

export function isTextTemplatePackDefinition({
	definition,
}: {
	definition: TextTemplateDefinition;
}): boolean {
	return PACK_TEMPLATE_CATEGORIES.has(definition.category);
}

export function buildTextTemplatePack({
	definition,
	currentTime = 0,
}: {
	definition: TextTemplateDefinition;
	currentTime?: number;
}): TextTemplatePack | null {
	if (!isTextTemplatePackDefinition({ definition })) return null;

	const baseTemplate = buildTextTemplate({ definition });
	const elements = getPackSlots({ definition, baseTemplate }).map(
		(slot): CreateTextElement => ({
			...baseTemplate,
			...slot,
			type: "text",
			startTime: currentTime,
			duration:
				slot.duration ??
				baseTemplate.duration ??
				TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
			trimStart: 0,
			trimEnd: 0,
		})
	);

	return {
		id: `pack-${definition.id}`,
		name: `${definition.name} pack`,
		category: definition.category,
		elements,
	};
}

function getPackSlots({
	definition,
	baseTemplate,
}: {
	definition: TextTemplateDefinition;
	baseTemplate: TextElement;
}): Array<Partial<TextElement>> {
	if (definition.category === "quote-template") {
		return [
			{
				name: `${definition.name} Quote Mark`,
				content: "“",
				fontSize: 92,
				color: definition.overrides?.strokeColor ?? "#facc15",
				strokeWidth: 0,
				x: 86,
				y: 88,
				width: 110,
				height: 120,
				opacity: 0.92,
			},
			{
				name: `${definition.name} Quote`,
				content: definition.content,
				fontSize: Math.max(42, (baseTemplate.fontSize ?? 64) - 8),
				x: 178,
				y: 112,
				width: 760,
				height: 130,
				textAlign: "left",
			},
			{
				name: `${definition.name} Attribution`,
				content: "— 观点摘录",
				fontSize: 28,
				color: "rgba(255,255,255,0.82)",
				strokeWidth: 0,
				x: 188,
				y: 242,
				width: 420,
				height: 64,
				textAlign: "left",
			},
		];
	}

	if (definition.category === "list-template") {
		return [
			{
				name: `${definition.name} Header`,
				content: definition.content,
				x: 104,
				y: 86,
				width: 640,
				height: 112,
				textAlign: "left",
			},
			{
				name: `${definition.name} Item 1`,
				content: "01 关键动作",
				fontSize: 34,
				x: 112,
				y: 218,
				width: 520,
				height: 74,
				textAlign: "left",
			},
			{
				name: `${definition.name} Item 2`,
				content: "02 避坑提醒",
				fontSize: 34,
				x: 112,
				y: 300,
				width: 520,
				height: 74,
				textAlign: "left",
				opacity: 0.88,
			},
		];
	}

	if (definition.category === "split-template") {
		return [
			{
				name: `${definition.name} Left Label`,
				content: "之前",
				x: 110,
				y: 124,
				width: 330,
				height: 112,
			},
			{
				name: `${definition.name} Right Label`,
				content: "之后",
				x: 520,
				y: 124,
				width: 330,
				height: 112,
				color: definition.overrides?.glowColor ?? "#38bdf8",
			},
			{
				name: `${definition.name} Center Divider`,
				content: "VS",
				fontSize: 52,
				x: 430,
				y: 154,
				width: 110,
				height: 96,
				rotation: -5,
			},
		];
	}

	if (definition.category === "timeline-template") {
		return [
			{
				name: `${definition.name} Stage 1`,
				content: "阶段 1",
				fontSize: 42,
				x: 92,
				y: 120,
				width: 250,
				height: 92,
			},
			{
				name: `${definition.name} Stage 2`,
				content: definition.content,
				fontSize: 50,
				x: 350,
				y: 98,
				width: 300,
				height: 118,
			},
			{
				name: `${definition.name} Stage 3`,
				content: "结果",
				fontSize: 42,
				x: 660,
				y: 120,
				width: 250,
				height: 92,
			},
		];
	}

	return [
		{
			name: `${definition.name} Kicker`,
			content: "本期重点",
			fontSize: 28,
			x: 122,
			y: 86,
			width: 360,
			height: 68,
			textAlign: "left",
			strokeWidth: 0,
			backgroundColor: definition.overrides?.glowColor ?? "#38bdf8",
			backgroundOpacity: 0.95,
			backgroundRadius: 18,
			backgroundPadding: 14,
			color: "#020617",
		},
		{
			name: `${definition.name} Headline`,
			content: definition.content,
			x: 108,
			y: 154,
			width: 800,
			height: 150,
			textAlign: "left",
		},
		{
			name: `${definition.name} Subhead`,
			content: "三句话讲清楚",
			fontSize: 34,
			x: 116,
			y: 302,
			width: 560,
			height: 76,
			textAlign: "left",
			opacity: 0.9,
		},
	];
}
