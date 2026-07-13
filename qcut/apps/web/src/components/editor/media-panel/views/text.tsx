import { DraggableMediaItem } from "@/components/ui/draggable-item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { colorWithOpacity } from "@/lib/text/text-style";
import {
	TEXT_TEMPLATE_CATEGORIES,
	getTextTemplatesByCategory,
} from "@/lib/text/text-template-registry";
import type { MarkdownElement, TextElement } from "@/types/timeline";

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
	const previewStrokeWidth = Math.min(
		1,
		Math.max(0, template.strokeWidth ?? 0) * 0.25
	);
	const addToTimeline = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addTextAtTime(template, time);
	};

	return (
		<div className="w-full">
			<DraggableMediaItem
				data-testid={
					template.id === "default-text" ? "text-overlay-button" : undefined
				}
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
									previewStrokeWidth > 0
										? `${previewStrokeWidth}px ${template.strokeColor}`
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
				onActivate={() => addToTimeline()}
				showLabel
				stopPropagation={false}
			/>
		</div>
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
			<Tabs defaultValue={TEXT_TEMPLATE_CATEGORIES[0].id}>
				<TabsList className="grid w-full grid-cols-4">
					{TEXT_TEMPLATE_CATEGORIES.map((category) => (
						<TabsTrigger key={category.id} value={category.id}>
							{category.label}
						</TabsTrigger>
					))}
				</TabsList>
				{TEXT_TEMPLATE_CATEGORIES.map((category) => (
					<TabsContent key={category.id} value={category.id}>
						<TemplateGrid
							templates={getTextTemplatesByCategory({ category: category.id })}
						/>
						{category.id === "basic" && (
							<div className="w-full">
								<DraggableMediaItem
									data-testid="markdown-overlay-button"
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
									onActivate={() => addMarkdown()}
									showLabel
									stopPropagation={false}
								/>
							</div>
						)}
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
}
