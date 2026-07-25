import {
	ArrowLeftRight,
	CircleAlert,
	CircleCheck,
	Loader2,
	Pause,
	Play,
	RotateCcw,
	StepBack,
	StepForward,
	Wrench,
} from "lucide-react";
import type { MediaMask, MediaMaskTrackingDirection } from "@/types/timeline";
import { MaskIconButton } from "./media-mask-controls";
import { PropertyItemLabel } from "./property-item";

function trackingStatus(mask: MediaMask) {
	if (mask.tracking?.status === "processing") {
		return { label: "跟踪中...", Icon: Loader2, className: "animate-spin" };
	}
	if (mask.tracking?.status === "paused") {
		return { label: "已暂停", Icon: Pause, className: "text-amber-500" };
	}
	if (mask.tracking?.status === "ready") {
		return {
			label: "跟踪完成",
			Icon: CircleCheck,
			className: "text-emerald-500",
		};
	}
	if (mask.tracking?.status === "error") {
		return {
			label: mask.tracking.error ?? "跟踪失败",
			Icon: CircleAlert,
		};
	}
	return null;
}

export function MediaMaskTrackingControls({
	mask,
	onTrack,
	onPause,
	onResume,
	onFixFrame,
}: {
	mask: MediaMask;
	onTrack?: (direction: MediaMaskTrackingDirection) => void;
	onPause?: () => void;
	onResume?: () => void;
	onFixFrame?: () => void;
}) {
	const processing = mask.tracking?.status === "processing";
	const paused = mask.tracking?.status === "paused";
	const status = trackingStatus(mask);
	const keyframeCount = new Set(
		Object.values(mask.keyframes ?? {}).flatMap(
			(keyframes) => keyframes?.map((keyframe) => keyframe.frame) ?? []
		)
	).size;
	const correctedFrameCount = mask.tracking?.correctedFrames?.length ?? 0;
	const progress = Math.min(100, Math.max(0, mask.tracking?.progress ?? 0));
	const lastDirection = mask.tracking?.direction ?? "both";

	return (
		<div
			className="space-y-2 border-t border-border pt-4"
			data-testid="mask-tracking-controls"
		>
			<div className="flex items-center justify-between gap-2">
				<PropertyItemLabel>跟踪</PropertyItemLabel>
				{status ? (
					<div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
						<status.Icon className={`size-3 ${status.className ?? ""}`} />
						<span className="truncate">{status.label}</span>
					</div>
				) : null}
			</div>
			{processing || paused || progress > 0 ? (
				<div
					className="h-1 overflow-hidden rounded-full bg-muted"
					data-testid="mask-tracking-progress"
					aria-label={`跟踪进度 ${Math.round(progress)}%`}
				>
					<div
						className="h-full rounded-full bg-primary transition-[width]"
						style={{ width: `${progress}%` }}
					/>
				</div>
			) : null}
			<div className="grid grid-cols-3 gap-1.5">
				<MaskIconButton
					label="向前跟踪"
					disabled={!onTrack || processing || paused}
					active={mask.tracking?.direction === "backward"}
					onClick={() => onTrack?.("backward")}
				>
					<StepBack className="size-4" />
				</MaskIconButton>
				<MaskIconButton
					label="双向跟踪"
					disabled={!onTrack || processing || paused}
					active={mask.tracking?.direction === "both"}
					onClick={() => onTrack?.("both")}
				>
					<ArrowLeftRight className="size-4" />
				</MaskIconButton>
				<MaskIconButton
					label="向后跟踪"
					disabled={!onTrack || processing || paused}
					active={mask.tracking?.direction === "forward"}
					onClick={() => onTrack?.("forward")}
				>
					<StepForward className="size-4" />
				</MaskIconButton>
			</div>
			<div className="grid grid-cols-3 gap-1.5">
				<MaskIconButton
					label={paused ? "继续跟踪" : "暂停跟踪"}
					disabled={paused ? !onResume : !onPause || !processing}
					onClick={() => (paused ? onResume?.() : onPause?.())}
				>
					{paused ? <Play className="size-4" /> : <Pause className="size-4" />}
				</MaskIconButton>
				<MaskIconButton
					label="重新分析"
					disabled={!onTrack || processing}
					onClick={() => onTrack?.(lastDirection)}
				>
					<RotateCcw className="size-4" />
				</MaskIconButton>
				<MaskIconButton
					label="修正当前帧"
					disabled={!onFixFrame || processing}
					onClick={() => onFixFrame?.()}
					active={correctedFrameCount > 0}
				>
					<Wrench className="size-4" />
				</MaskIconButton>
			</div>
			{keyframeCount > 0 ? (
				<div className="text-[10px] text-muted-foreground">
					已跟踪 {keyframeCount} 帧
					{correctedFrameCount > 0 ? ` · 修正 ${correctedFrameCount} 帧` : ""}
				</div>
			) : null}
		</div>
	);
}
