import {
	ArrowLeftRight,
	CircleAlert,
	CircleCheck,
	Loader2,
	StepBack,
	StepForward,
} from "lucide-react";
import type { MediaMask, MediaMaskTrackingDirection } from "@/types/timeline";
import { MaskIconButton } from "./media-mask-controls";
import { PropertyItemLabel } from "./property-item";

function trackingStatus(mask: MediaMask) {
	if (mask.tracking?.status === "processing") {
		return { label: "跟踪中...", Icon: Loader2, className: "animate-spin" };
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
}: {
	mask: MediaMask;
	onTrack?: (direction: MediaMaskTrackingDirection) => void;
}) {
	const processing = mask.tracking?.status === "processing";
	const status = trackingStatus(mask);
	const keyframeCount = new Set(
		Object.values(mask.keyframes ?? {}).flatMap(
			(keyframes) => keyframes?.map((keyframe) => keyframe.frame) ?? []
		)
	).size;

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
			<div className="grid grid-cols-3 gap-1.5">
				<MaskIconButton
					label="向前跟踪"
					disabled={!onTrack || processing}
					active={mask.tracking?.direction === "backward"}
					onClick={() => onTrack?.("backward")}
				>
					<StepBack className="size-4" />
				</MaskIconButton>
				<MaskIconButton
					label="双向跟踪"
					disabled={!onTrack || processing}
					active={mask.tracking?.direction === "both"}
					onClick={() => onTrack?.("both")}
				>
					<ArrowLeftRight className="size-4" />
				</MaskIconButton>
				<MaskIconButton
					label="向后跟踪"
					disabled={!onTrack || processing}
					active={mask.tracking?.direction === "forward"}
					onClick={() => onTrack?.("forward")}
				>
					<StepForward className="size-4" />
				</MaskIconButton>
			</div>
			{keyframeCount > 0 ? (
				<div className="text-[10px] text-muted-foreground">
					已跟踪 {keyframeCount} 帧
				</div>
			) : null}
		</div>
	);
}
