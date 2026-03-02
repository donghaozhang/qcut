"use client";

import { useCallback } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { FPS_PRESETS } from "@/constants/timeline-constants";
import { useProjectStore } from "@/stores/project-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useAspectRatio } from "@/hooks/media/use-aspect-ratio";

/** Displays project metadata (name, resolution, FPS) with editable controls. */
export function ProjectInfoView() {
	const { activeProject, updateProjectFps } = useProjectStore();
	const { canvasSize, canvasPresets, setCanvasSize } = useEditorStore();
	const { getDisplayName, currentPreset } = useAspectRatio();

	const handleAspectRatioChange = useCallback(
		(value: string) => {
			const preset = canvasPresets.find((p) => p.name === value);
			if (preset) {
				setCanvasSize({ width: preset.width, height: preset.height });
			}
		},
		[canvasPresets, setCanvasSize]
	);

	const handleFpsChange = useCallback(
		(value: string) => {
			const fps = parseFloat(value);
			if (!isNaN(fps) && fps > 0) {
				updateProjectFps(fps);
			}
		},
		[updateProjectFps]
	);

	return (
		<div className="flex flex-col gap-4">
			<PropertyItem direction="column">
				<PropertyItemLabel>Name</PropertyItemLabel>
				<PropertyItemValue>
					{activeProject?.name || "Untitled project"}
				</PropertyItemValue>
			</PropertyItem>

			<PropertyItem direction="column">
				<PropertyItemLabel>Aspect ratio</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={currentPreset?.name}
						onValueChange={handleAspectRatioChange}
					>
						<SelectTrigger className="bg-panel-accent">
							<SelectValue placeholder={getDisplayName()} />
						</SelectTrigger>
						<SelectContent>
							{canvasPresets.map((preset) => (
								<SelectItem key={preset.name} value={preset.name}>
									{preset.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>

			<PropertyItem direction="column">
				<PropertyItemLabel>Resolution</PropertyItemLabel>
				<PropertyItemValue className="text-xs text-muted-foreground">
					{`${canvasSize.width} × ${canvasSize.height}`}
				</PropertyItemValue>
			</PropertyItem>

			<PropertyItem direction="column">
				<PropertyItemLabel>Frame rate</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={(activeProject?.fps || 30).toString()}
						onValueChange={handleFpsChange}
					>
						<SelectTrigger className="bg-panel-accent">
							<SelectValue placeholder="Select a frame rate" />
						</SelectTrigger>
						<SelectContent>
							{FPS_PRESETS.map((preset) => (
								<SelectItem key={preset.value} value={preset.value}>
									{preset.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>
		</div>
	);
}
