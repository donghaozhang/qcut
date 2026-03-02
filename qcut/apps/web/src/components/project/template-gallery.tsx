import { Film, MonitorPlay, Package, User } from "lucide-react";
import type { CanvasSize } from "@/types/editor";

interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	hint: string;
	icon: React.ElementType;
	canvasSize: CanvasSize;
	aspectLabel: string;
}

const TEMPLATES: ProjectTemplate[] = [
	{
		id: "social-reel",
		name: "Social Reel",
		description: "TikTok, Reels, Shorts",
		hint: "Trending format",
		icon: Film,
		canvasSize: { width: 1080, height: 1920 },
		aspectLabel: "9:16",
	},
	{
		id: "youtube-video",
		name: "YouTube Video",
		description: "Standard widescreen",
		hint: "Optimized for retention",
		icon: MonitorPlay,
		canvasSize: { width: 1920, height: 1080 },
		aspectLabel: "16:9",
	},
	{
		id: "product-demo",
		name: "Product Demo",
		description: "Presentations & demos",
		hint: "Presentation-ready",
		icon: Package,
		canvasSize: { width: 1920, height: 1080 },
		aspectLabel: "16:9",
	},
	{
		id: "ai-avatar",
		name: "AI Avatar",
		description: "Talking head videos",
		hint: "Agent-ready",
		icon: User,
		canvasSize: { width: 1080, height: 1920 },
		aspectLabel: "9:16",
	},
];

interface TemplateGalleryProps {
	onCreateFromTemplate: (name: string, canvasSize: CanvasSize) => void;
}

export function TemplateGallery({
	onCreateFromTemplate,
}: TemplateGalleryProps) {
	return (
		<section className="mt-12">
			<h2 className="text-lg font-semibold mb-4 text-muted-foreground">
				Start from Template
			</h2>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{TEMPLATES.map((template) => (
					<button
						key={template.id}
						type="button"
						onClick={() =>
							onCreateFromTemplate(template.name, template.canvasSize)
						}
						className="group/tpl flex flex-col items-center gap-2 p-5 rounded-lg border border-border/50 hover:border-primary/40 bg-muted/10 hover:bg-muted/30 transition-all duration-200 cursor-pointer text-center"
					>
						<template.icon className="h-6 w-6 text-muted-foreground group-hover/tpl:text-primary transition-colors" />
						<span className="text-sm font-medium">{template.name}</span>
						<span className="text-xs text-muted-foreground">
							{template.aspectLabel} &middot; {template.description}
						</span>
						<span className="text-[10px] text-primary/70 font-medium uppercase tracking-wider">
							{template.hint}
						</span>
					</button>
				))}
			</div>
		</section>
	);
}
