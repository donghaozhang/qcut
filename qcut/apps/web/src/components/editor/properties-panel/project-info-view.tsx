"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useTranslation } from "@/lib/i18n";

/** QCut previews and exports through an 8-bit BT.709 SDR pipeline. */
const PROJECT_COLOR_SPACE = "Rec.709 SDR";

/** One label/value row styled like Jianying's draft-parameter list. */
function InfoRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<PropertyItem direction="row" className="items-start gap-4">
			<PropertyItemLabel className="w-20 shrink-0 text-muted-foreground">
				{label}
			</PropertyItemLabel>
			<PropertyItemValue className="min-w-0 text-xs">
				{children}
			</PropertyItemValue>
		</PropertyItem>
	);
}

/**
 * Displays project metadata mirroring Jianying's draft-parameter panel:
 * name, on-disk location, and color space, then the timeline parameters
 * (timeline name, aspect ratio, resolution, frame rate) with the ratio and
 * FPS staying editable.
 */
export function ProjectInfoView() {
	const { t } = useTranslation();
	const { activeProject, updateProjectCanvasSize, updateProjectFps } =
		useProjectStore();
	const { canvasSize, canvasPresets, setCanvasSize } = useEditorStore();
	const { getDisplayName, currentPreset } = useAspectRatio();
	const [projectFilePath, setProjectFilePath] = useState<string | null>(null);

	const projectId = activeProject?.id;
	useEffect(() => {
		let cancelled = false;
		const storage = window.electronAPI?.storage;
		if (!projectId || !storage?.projectFilePath) {
			setProjectFilePath(null);
			return;
		}
		storage
			.projectFilePath(projectId)
			.then((filePath) => {
				if (!cancelled) setProjectFilePath(filePath);
			})
			.catch(() => {
				if (!cancelled) setProjectFilePath(null);
			});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const currentScene = activeProject?.scenes.find(
		(scene) => scene.id === activeProject.currentSceneId
	);

	const handleRevealProjectFile = useCallback(() => {
		if (projectFilePath) {
			void window.electronAPI?.shell?.showItemInFolder(projectFilePath);
		}
	}, [projectFilePath]);

	const handleAspectRatioChange = useCallback(
		(value: string) => {
			const preset = canvasPresets.find((p) => p.name === value);
			if (preset) {
				const nextSize = { width: preset.width, height: preset.height };
				setCanvasSize(nextSize, "preset");
				void updateProjectCanvasSize(nextSize, "preset");
			}
		},
		[canvasPresets, setCanvasSize, updateProjectCanvasSize]
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
		<div className="flex flex-col gap-3">
			<InfoRow label={t("editor.projectInfo.name")}>
				{activeProject?.name || t("editor.projectInfo.untitled")}
			</InfoRow>

			{projectFilePath ? (
				<InfoRow label={t("editor.projectInfo.location")}>
					<button
						type="button"
						className="break-all text-left hover:underline"
						title={t("editor.projectInfo.reveal")}
						onClick={handleRevealProjectFile}
					>
						{projectFilePath}
					</button>
				</InfoRow>
			) : null}

			<InfoRow label={t("editor.projectInfo.colorSpace")}>
				{PROJECT_COLOR_SPACE}
			</InfoRow>

			<div className="border-t border-border/50" />

			{currentScene ? (
				<InfoRow label={t("editor.projectInfo.timelineName")}>
					{currentScene.name}
				</InfoRow>
			) : null}

			<PropertyItem direction="row" className="gap-4">
				<PropertyItemLabel className="w-20 shrink-0 text-muted-foreground">
					{t("editor.projectInfo.aspectRatio")}
				</PropertyItemLabel>
				<PropertyItemValue className="min-w-0">
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

			<InfoRow label={t("editor.projectInfo.resolution")}>
				<span className="text-muted-foreground">
					{`${canvasSize.width} × ${canvasSize.height}`}
				</span>
			</InfoRow>

			<PropertyItem direction="row" className="gap-4">
				<PropertyItemLabel className="w-20 shrink-0 text-muted-foreground">
					{t("editor.projectInfo.frameRate")}
				</PropertyItemLabel>
				<PropertyItemValue className="min-w-0">
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
