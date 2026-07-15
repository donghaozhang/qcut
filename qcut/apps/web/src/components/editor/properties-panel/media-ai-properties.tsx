import { Bot, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { CloudTaskStatus } from "@/components/editor/cloud-task-status";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMediaOutpaint } from "@/hooks/use-media-outpaint";
import { useTranslation } from "@/lib/i18n";
import {
	closestMediaOutpaintAspectRatio,
	MEDIA_OUTPAINT_ASPECT_RATIOS,
	MEDIA_OUTPAINT_MAX_SOURCE_SECONDS,
	MEDIA_OUTPAINT_RESOLUTIONS,
	type MediaOutpaintAspectRatio,
	type MediaOutpaintRequest,
	type MediaOutpaintResolution,
} from "@/lib/ai-video/media-outpaint";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";
import type { MediaElement } from "@/types/timeline";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";

function activateButton({
	event,
	action,
}: {
	event: React.KeyboardEvent<HTMLButtonElement>;
	action: () => void;
}): void {
	if (event.key !== "Enter") return;
	event.preventDefault();
	action();
}

function MediaAIPropertiesForClip({
	element,
	trackId,
	onOpenUpscale,
	onOpenVideoTools,
}: {
	element: MediaElement;
	trackId: string;
	onOpenUpscale: () => void;
	onOpenVideoTools: () => void;
}) {
	const { t } = useTranslation();
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const outpaint = useMediaOutpaint({ element, trackId, fps });
	const defaultAspectRatio = closestMediaOutpaintAspectRatio(canvasSize);
	const [prompt, setPrompt] = useState(outpaint.taskRequest?.prompt ?? "");
	const [aspectRatio, setAspectRatio] = useState<MediaOutpaintAspectRatio>(
		outpaint.taskRequest?.aspectRatio ?? defaultAspectRatio
	);
	const [resolution, setResolution] = useState<MediaOutpaintResolution>(
		outpaint.taskRequest?.resolution ?? "720p"
	);

	const request: MediaOutpaintRequest = { prompt, aspectRatio, resolution };
	const sourceTooLong =
		outpaint.sourceDuration > MEDIA_OUTPAINT_MAX_SOURCE_SECONDS + 0.001;
	const unavailable = outpaint.isChecked && !outpaint.isAvailable;
	const disabled =
		outpaint.isRunning ||
		!outpaint.isChecked ||
		!outpaint.isAvailable ||
		!outpaint.mediaItem ||
		!prompt.trim() ||
		sourceTooLong;
	const startOutpaint = () => {
		void outpaint.runOutpaint({ request });
	};

	return (
		<div className="space-y-4" data-testid="media-ai-properties">
			<PropertyGroup title={t("mediaProperties.aiProcessing")} defaultExpanded>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={onOpenUpscale}
						onKeyDown={(event) =>
							activateButton({ event, action: onOpenUpscale })
						}
						data-testid="media-ai-upscale"
					>
						<Sparkles className="size-4" aria-hidden="true" />
						{t("mediaProperties.aiUpscale")}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onOpenVideoTools}
						onKeyDown={(event) =>
							activateButton({ event, action: onOpenVideoTools })
						}
						data-testid="media-ai-video-tools"
					>
						<Bot className="size-4" aria-hidden="true" />
						{t("mediaProperties.aiVideoTools")}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup title={t("mediaProperties.aiOutpaint")} defaultExpanded>
				<div className="space-y-3">
					<PropertyItem>
						<PropertyItemLabel>
							{t("mediaProperties.outpaintAspectRatio")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={aspectRatio}
								onValueChange={(value) =>
									setAspectRatio(value as MediaOutpaintAspectRatio)
								}
							>
								<SelectTrigger
									className="h-8 text-xs"
									aria-label={t("mediaProperties.outpaintAspectRatio")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MEDIA_OUTPAINT_ASPECT_RATIOS.map((ratio) => (
										<SelectItem key={ratio} value={ratio}>
											{ratio}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>

					<PropertyItem>
						<PropertyItemLabel>
							{t("mediaProperties.outpaintResolution")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={resolution}
								onValueChange={(value) =>
									setResolution(value as MediaOutpaintResolution)
								}
							>
								<SelectTrigger
									className="h-8 text-xs"
									aria-label={t("mediaProperties.outpaintResolution")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MEDIA_OUTPAINT_RESOLUTIONS.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>

					<div className="space-y-1.5">
						<PropertyItemLabel htmlFor={`outpaint-prompt-${element.id}`}>
							{t("mediaProperties.outpaintPrompt")}
						</PropertyItemLabel>
						<Textarea
							id={`outpaint-prompt-${element.id}`}
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder={t("mediaProperties.outpaintPromptPlaceholder")}
							className="min-h-20 resize-none text-xs"
							maxLength={2_000}
							data-testid="media-outpaint-prompt"
						/>
					</div>

					<div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
						<span>
							{t("mediaProperties.outpaintSourceDuration", {
								duration: outpaint.sourceDuration.toFixed(1),
							})}
						</span>
						<span className={sourceTooLong ? "text-destructive" : undefined}>
							{t("mediaProperties.outpaintDurationLimit", {
								duration: MEDIA_OUTPAINT_MAX_SOURCE_SECONDS,
							})}
						</span>
					</div>

					{unavailable ? (
						<p className="text-xs text-destructive" role="alert">
							{t("mediaProperties.outpaintUnavailable")}
						</p>
					) : null}

					<Button
						type="button"
						className="w-full"
						disabled={disabled}
						onClick={startOutpaint}
						onKeyDown={(event) =>
							activateButton({ event, action: startOutpaint })
						}
						data-testid="media-outpaint-generate"
					>
						{outpaint.isRunning ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<WandSparkles className="size-4" aria-hidden="true" />
						)}
						{t("mediaProperties.outpaintGenerate")}
					</Button>

					<CloudTaskStatus
						taskId={outpaint.taskId}
						onCancel={outpaint.cancelOutpaint}
						onRetry={() => {
							void outpaint.retryOutpaint();
						}}
					/>
				</div>
			</PropertyGroup>
		</div>
	);
}

export function MediaAIProperties({
	element,
	trackId,
	onOpenUpscale,
	onOpenVideoTools,
}: {
	element: MediaElement;
	trackId: string;
	onOpenUpscale: () => void;
	onOpenVideoTools: () => void;
}) {
	return (
		<MediaAIPropertiesForClip
			key={element.id}
			element={element}
			trackId={trackId}
			onOpenUpscale={onOpenUpscale}
			onOpenVideoTools={onOpenVideoTools}
		/>
	);
}
