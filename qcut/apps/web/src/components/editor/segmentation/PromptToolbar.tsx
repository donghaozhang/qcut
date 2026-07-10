"use client";

import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Type, MousePointer, Square, Sparkles } from "lucide-react";
import type { Sam3SegmentationMode } from "@/types/sam3";

/**
 * PromptToolbar
 *
 * Toolbar for selecting prompt mode and entering prompts.
 * Supports text, point, box, and auto modes.
 */
export function PromptToolbar() {
	const {
		promptMode,
		setPromptMode,
		currentTextPrompt,
		setTextPrompt,
		currentPointPrompts,
		currentBoxPrompts,
		mode,
		videoBackend,
	} = useSegmentationStore();
	if (mode === "video" && videoBackend === "local-person") return null;

	const handleModeChange = (value: string) => {
		if (value) {
			setPromptMode(value as Sam3SegmentationMode);
		}
	};

	return (
		<div className="space-y-3">
			{/* Mode Toggle */}
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">Mode:</span>
				<ToggleGroup
					type="single"
					value={promptMode}
					onValueChange={handleModeChange}
					className="justify-start"
				>
					<ToggleGroupItem value="text" aria-label="Text prompt mode">
						<Type className="w-4 h-4 mr-1" />
						Text
					</ToggleGroupItem>
					<ToggleGroupItem value="point" aria-label="Point prompt mode">
						<MousePointer className="w-4 h-4 mr-1" />
						Click
					</ToggleGroupItem>
					<ToggleGroupItem value="box" aria-label="Box prompt mode">
						<Square className="w-4 h-4 mr-1" />
						Box
					</ToggleGroupItem>
					<ToggleGroupItem value="auto" aria-label="Auto detect mode">
						<Sparkles className="w-4 h-4 mr-1" />
						Auto
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{/* Text Prompt Input (shown in text and auto modes) */}
			{(promptMode === "text" || promptMode === "auto") && (
				<div className="space-y-1">
					<Input
						placeholder="Describe what to segment (e.g., 'person', 'car', 'dog')"
						value={currentTextPrompt}
						onChange={(e) => setTextPrompt(e.target.value)}
						className="w-full"
					/>
					<p className="text-xs text-muted-foreground">
						Enter a description of the objects you want to segment
					</p>
				</div>
			)}

			{/* Point/Box mode instructions */}
			{promptMode === "point" && (
				<div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
					<p className="font-medium mb-1">Click Mode</p>
					<p className="text-xs">
						- Left-click to mark foreground (include)
						<br />- Right-click to mark background (exclude)
					</p>
					{currentPointPrompts.length > 0 && (
						<p className="mt-2 text-xs">
							{currentPointPrompts.length} point(s) selected
						</p>
					)}
				</div>
			)}

			{promptMode === "box" && (
				<div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
					<p className="font-medium mb-1">Box Mode</p>
					<p className="text-xs">
						Click and drag to draw a box around the object
					</p>
					{currentBoxPrompts.length > 0 && (
						<p className="mt-2 text-xs">
							{currentBoxPrompts.length} box(es) drawn
						</p>
					)}
				</div>
			)}
		</div>
	);
}
