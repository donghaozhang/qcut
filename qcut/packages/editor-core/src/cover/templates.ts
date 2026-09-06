import { createCoverText } from "./editing.js";
import type { CoverDesignV1, CoverTextLayerV1 } from "./model.js";

export const COVER_TEMPLATES = [
	{
		id: "none",
		category: "all",
		label: "Original",
		zh: "原图",
		title: "",
		subtitle: "",
		color: "#ffffff",
		y: 0.5,
		font: "sans-serif",
	},
	{
		id: "journal",
		category: "life",
		label: "Daily journal",
		zh: "日常记录",
		title: "A LITTLE EVERYDAY",
		subtitle: "我的日常 / DAILY JOURNAL",
		color: "#ffffff",
		y: 0.7,
		font: "sans-serif",
	},
	{
		id: "travel",
		category: "life",
		label: "Travel notes",
		zh: "旅行手记",
		title: "Travel Notes",
		subtitle: "沿途的风景 / ON THE ROAD",
		color: "#f8de66",
		y: 0.36,
		font: "serif",
	},
	{
		id: "editorial",
		category: "style",
		label: "Editorial",
		zh: "杂志风格",
		title: "THE EDIT",
		subtitle: "记录此刻 / MOMENTS THAT MATTER",
		color: "#ffffff",
		y: 0.2,
		font: "serif",
	},
	{
		id: "tutorial",
		category: "knowledge",
		label: "How to",
		zh: "知识分享",
		title: "HOW TO",
		subtitle: "从这里开始 / START HERE",
		color: "#ffffff",
		y: 0.52,
		font: "sans-serif",
	},
	{
		id: "play",
		category: "games",
		label: "Play of the day",
		zh: "高光时刻",
		title: "PLAY OF THE DAY",
		subtitle: "高光时刻 / BEST MOMENTS",
		color: "#85f4b2",
		y: 0.7,
		font: "monospace",
	},
] as const;

export function applyCoverTemplate({
	design,
	templateId,
}: {
	design: CoverDesignV1;
	templateId: string;
}): CoverDesignV1 {
	const template = COVER_TEMPLATES.find((entry) => entry.id === templateId);
	if (!template) throw new Error("Unknown QCut cover template");
	const manual = design.layers
		.slice(1)
		.filter(
			(layer): layer is CoverTextLayerV1 =>
				layer.kind === "text" && !layer.templateId
		);
	const texts: CoverTextLayerV1[] =
		template.id === "none"
			? []
			: [
					{
						...createCoverText({
							canvas: design.canvas,
							content: template.title,
							id: `template-${template.id}-title`,
						}),
						templateId,
						y: template.y,
						color: template.color,
						fontFamily: template.font,
						background: template.id === "tutorial",
						italic: template.id === "travel",
						stroke: template.id === "play",
					},
					{
						...createCoverText({
							canvas: design.canvas,
							content: template.subtitle,
							id: `template-${template.id}-subtitle`,
						}),
						templateId,
						y: Math.min(0.9, template.y + 0.19),
						height: 0.12,
						fontSize: Math.max(
							8,
							Math.round(
								Math.min(design.canvas.width, design.canvas.height) * 0.029
							)
						),
						bold: false,
					},
				];
	if (manual.length + texts.length > 20)
		throw new Error("A cover supports at most 20 text layers");
	return {
		...design,
		templateId,
		layers: [design.layers[0], ...manual, ...texts],
	};
}
