import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	buildTextTemplate,
	type TextTemplateDefinition,
} from "@/lib/text/text-template-registry";
import type { CreateTextElement, TextElement } from "@/types/timeline";

export interface TextTemplatePackPayload {
	id: string;
	name: string;
	category: string;
	copySlots: TextTemplatePackCopySlot[];
	elements: CreateTextElement[];
}

export interface TextTemplatePack extends TextTemplatePackPayload {
	category: TextTemplateDefinition["category"];
}

export interface TextTemplatePackCopySlot {
	defaultContent: string;
	elementIndex: number;
	id: string;
	label: string;
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
	baseTemplate,
	definition,
	currentTime = 0,
}: {
	baseTemplate?: TextElement;
	definition: TextTemplateDefinition;
	currentTime?: number;
}): TextTemplatePack | null {
	if (!isTextTemplatePackDefinition({ definition })) return null;

	const resolvedBaseTemplate =
		baseTemplate ?? buildTextTemplate({ definition });
	const elements = getPackSlots({
		definition,
		baseTemplate: resolvedBaseTemplate,
	}).map(
		(slot): CreateTextElement => ({
			...resolvedBaseTemplate,
			...slot,
			type: "text",
			startTime: currentTime,
			duration:
				slot.duration ??
				resolvedBaseTemplate.duration ??
				TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
			trimStart: 0,
			trimEnd: 0,
		})
	);

	return {
		id: `pack-${definition.id}`,
		name: `${definition.name} pack`,
		category: definition.category,
		copySlots: buildTextTemplatePackCopySlots({
			definition,
			elements,
		}),
		elements,
	};
}

export function applyTextTemplatePackCopy({
	contents,
	pack,
}: {
	contents: readonly string[];
	pack: TextTemplatePackPayload;
}): TextTemplatePackPayload {
	const replacements = new Map<number, string>();
	for (const [slotIndex, slot] of pack.copySlots.entries()) {
		const nextContent = contents[slotIndex]?.trim();
		if (!nextContent) continue;
		replacements.set(slot.elementIndex, nextContent);
	}
	if (replacements.size === 0) return pack;
	return {
		...pack,
		copySlots: pack.copySlots.map((slot) => ({
			...slot,
			defaultContent:
				replacements.get(slot.elementIndex) ?? slot.defaultContent,
		})),
		elements: pack.elements.map((element, elementIndex) => {
			const content = replacements.get(elementIndex);
			return content ? { ...element, content } : element;
		}),
	};
}

function copySlot({
	elementIndex,
	elements,
	id,
	label,
}: {
	elementIndex: number;
	elements: readonly CreateTextElement[];
	id: string;
	label: string;
}): TextTemplatePackCopySlot {
	return {
		defaultContent: elements[elementIndex]?.content ?? "",
		elementIndex,
		id,
		label,
	};
}

export function buildTextTemplatePackCopySlots({
	definition,
	elements,
}: {
	definition: TextTemplateDefinition;
	elements: readonly CreateTextElement[];
}): TextTemplatePackCopySlot[] {
	if (definition.category === "quote-template") {
		return [
			copySlot({ elementIndex: 1, elements, id: "quote", label: "引用正文" }),
			copySlot({ elementIndex: 2, elements, id: "attribution", label: "出处" }),
		];
	}
	if (definition.category === "list-template") {
		return [
			copySlot({ elementIndex: 0, elements, id: "title", label: "标题" }),
			copySlot({ elementIndex: 1, elements, id: "item-1", label: "条目 1" }),
			copySlot({ elementIndex: 2, elements, id: "item-2", label: "条目 2" }),
		];
	}
	if (definition.category === "split-template") {
		return [
			copySlot({ elementIndex: 0, elements, id: "left", label: "左侧文案" }),
			copySlot({ elementIndex: 1, elements, id: "right", label: "右侧文案" }),
		];
	}
	if (definition.category === "timeline-template") {
		return [
			copySlot({ elementIndex: 0, elements, id: "stage-1", label: "阶段 1" }),
			copySlot({ elementIndex: 1, elements, id: "stage-2", label: "阶段 2" }),
			copySlot({ elementIndex: 2, elements, id: "stage-3", label: "阶段 3" }),
		];
	}
	return [
		copySlot({ elementIndex: 0, elements, id: "kicker", label: "眉标题" }),
		copySlot({ elementIndex: 1, elements, id: "headline", label: "主标题" }),
		copySlot({ elementIndex: 2, elements, id: "subhead", label: "副标题" }),
	];
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
