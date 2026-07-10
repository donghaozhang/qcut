import { DraggableMediaItem } from "@/components/ui/draggable-item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { colorWithOpacity } from "@/lib/text/text-style";
import type { MarkdownElement, TextElement } from "@/types/timeline";

const baseText: TextElement = {
	id: "default-text",
	type: "text",
	name: "Default text",
	content: "Default text",
	fontSize: 48,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	width: 640,
	height: 180,
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
	duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

const textTemplates: Record<string, TextElement[]> = {
	basic: [
		baseText,
		{
			...baseText,
			id: "heading-text",
			name: "Heading",
			content: "Heading",
			fontSize: 84,
			fontWeight: "bold",
			width: 900,
			height: 220,
		},
	],
	bubbles: [
		{
			...baseText,
			id: "rounded-label",
			name: "Rounded label",
			content: "Rounded label",
			fontWeight: "bold",
			color: "#111111",
			backgroundColor: "#ffffff",
			backgroundOpacity: 1,
			backgroundRadius: 28,
			backgroundPadding: 20,
			width: 620,
			height: 150,
		},
		{
			...baseText,
			id: "dark-bubble",
			name: "Dark bubble",
			content: "Dark bubble",
			fontWeight: "bold",
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
		{
			...baseText,
			id: "yellow-callout",
			name: "Yellow callout",
			content: "Important",
			fontWeight: "bold",
			color: "#111111",
			backgroundColor: "#ffe600",
			backgroundOpacity: 1,
			backgroundRadius: 8,
			backgroundPadding: 16,
			rotation: -3,
			width: 520,
			height: 150,
		},
	],
	decorative: [
		{
			...baseText,
			id: "yellow-pop",
			name: "Yellow pop",
			content: "Big moment",
			fontSize: 72,
			fontWeight: "bold",
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
		{
			...baseText,
			id: "cyan-neon",
			name: "Cyan neon",
			content: "Neon",
			fontSize: 80,
			fontWeight: "bold",
			color: "#e6ffff",
			strokeColor: "#00d9ff",
			strokeWidth: 1,
			glowColor: "#00d9ff",
			glowOpacity: 0.9,
			glowBlur: 18,
			width: 700,
			height: 240,
		},
		{
			...baseText,
			id: "editorial-title",
			name: "Editorial title",
			content: "Editorial",
			fontSize: 76,
			fontFamily: "Playfair Display",
			fontWeight: "bold",
			fontStyle: "italic",
			letterSpacing: 2,
			shadowOpacity: 0.5,
			shadowOffsetY: 5,
			shadowBlur: 12,
			width: 800,
			height: 220,
		},
	],
};

const markdownData: MarkdownElement = {
	id: "default-markdown",
	type: "markdown",
	name: "Default markdown",
	markdownContent: "# Title\n\nStart writing your markdown content...",
	duration: TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	theme: "dark",
	fontSize: 18,
	fontFamily: "Arial",
	padding: 16,
	backgroundColor: "rgba(0, 0, 0, 0.85)",
	textColor: "#ffffff",
	scrollMode: "static",
	scrollSpeed: 30,
	x: 0,
	y: 0,
	width: 720,
	height: 420,
	rotation: 0,
	opacity: 1,
};

function TextTemplate({ template }: { template: TextElement }) {
	const addToTimeline = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addTextAtTime(template, time);
	};

	return (
		<button
			type="button"
			data-testid={
				template.id === "default-text" ? "text-overlay-button" : undefined
			}
			aria-label={`Add ${template.name}`}
			onClick={() => addToTimeline()}
			onKeyDown={(event) => {
				if (event.key === " ") event.preventDefault();
			}}
			className="w-full cursor-pointer border-0 bg-transparent p-0"
		>
			<DraggableMediaItem
				name={template.name}
				preview={
					<div
						className="flex h-full w-full items-center justify-center overflow-hidden rounded-sm bg-muted p-3"
						style={{
							backgroundColor:
								(template.backgroundOpacity ?? 0) > 0
									? colorWithOpacity(
											template.backgroundColor,
											template.backgroundOpacity ?? 0
										)
									: undefined,
						}}
					>
						<span
							className="select-none text-center text-sm"
							style={{
								color: template.color,
								fontFamily: template.fontFamily,
								fontWeight: template.fontWeight,
								fontStyle: template.fontStyle,
								WebkitTextStroke:
									(template.strokeWidth ?? 0) > 0
										? `${Math.min(2, template.strokeWidth ?? 0)}px ${template.strokeColor}`
										: undefined,
								textShadow:
									(template.glowOpacity ?? 0) > 0
										? `0 0 10px ${template.glowColor}`
										: undefined,
							}}
						>
							{template.content}
						</span>
					</div>
				}
				dragData={{
					id: template.id,
					type: template.type,
					name: template.name,
					content: template.content,
					textTemplate: template,
				}}
				aspectRatio={1.4}
				onAddToTimeline={addToTimeline}
				showLabel
				stopPropagation={false}
			/>
		</button>
	);
}

function TemplateGrid({ templates }: { templates: TextElement[] }) {
	return (
		<div className="grid grid-cols-2 gap-3 py-3">
			{templates.map((template) => (
				<TextTemplate key={template.id} template={template} />
			))}
		</div>
	);
}

export function TextView() {
	const addMarkdown = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addMarkdownAtTime(markdownData, time);
	};

	return (
		<div className="p-4" data-testid="text-panel">
			<Tabs defaultValue="basic">
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="basic">Basic</TabsTrigger>
					<TabsTrigger value="bubbles">Bubbles</TabsTrigger>
					<TabsTrigger value="decorative">Decorative</TabsTrigger>
				</TabsList>
				<TabsContent value="basic">
					<TemplateGrid templates={textTemplates.basic} />
					<button
						data-testid="markdown-overlay-button"
						aria-label="Add default markdown overlay"
						onClick={() => addMarkdown()}
						className="w-full cursor-pointer border-0 bg-transparent p-0"
						type="button"
					>
						<DraggableMediaItem
							name="Markdown"
							preview={
								<div className="flex h-full w-full items-center justify-center rounded-sm bg-muted p-2">
									<span className="select-none text-center text-xs">
										Markdown
									</span>
								</div>
							}
							dragData={{
								id: markdownData.id,
								type: markdownData.type,
								name: markdownData.name,
								markdownContent: markdownData.markdownContent,
							}}
							aspectRatio={1.4}
							onAddToTimeline={addMarkdown}
							showLabel
							stopPropagation={false}
						/>
					</button>
				</TabsContent>
				<TabsContent value="bubbles">
					<TemplateGrid templates={textTemplates.bubbles} />
				</TabsContent>
				<TabsContent value="decorative">
					<TemplateGrid templates={textTemplates.decorative} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
