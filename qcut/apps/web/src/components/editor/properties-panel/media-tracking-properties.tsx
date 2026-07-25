import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaMask, MediaMaskTrackingDirection } from "@/types/timeline";
import {
	addMaskTrackingCorrectionKeyframes,
	updateMaskTrackingStatus,
} from "@/lib/video/media-mask-tracking";
import {
	cancelActiveMaskTracking,
	resumeActiveMaskTracking,
} from "@/lib/segmentation/mask-tracking-runtime";
import { updateMediaMaskInStack } from "@/lib/video/media-mask-stack";
import { PropertyGroup } from "./property-item";
import { MediaMaskTrackingControls } from "./media-mask-tracking-controls";

function correctionCount({ mask }: { mask: MediaMask }): number {
	const frames = new Set<number>();
	for (const property of [
		"centerX",
		"centerY",
		"width",
		"height",
		"rotation",
	] as const) {
		for (const keyframe of mask.keyframes?.[property] ?? []) {
			frames.add(keyframe.frame);
		}
	}
	return frames.size;
}

export function MediaTrackingProperties({
	elementId,
	masks,
	currentFrame,
	onChange,
	onTrack,
	onOpenMasks,
}: {
	elementId: string;
	masks: MediaMask[];
	currentFrame: number;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onTrack: ({
		mask,
		direction,
	}: {
		mask: MediaMask;
		direction: MediaMaskTrackingDirection;
	}) => void;
	onOpenMasks: () => void;
}) {
	const patchMask = ({
		mask,
		updates,
		history = true,
	}: {
		mask: MediaMask;
		updates: Partial<MediaMask>;
		history?: boolean;
	}) => {
		if (!mask.id) return;
		onChange(
			updateMediaMaskInStack({
				masks,
				maskId: mask.id,
				updates,
			}),
			history
		);
	};

	return (
		<PropertyGroup title="蒙版跟踪" defaultExpanded>
			{masks.length === 0 ? (
				<div className="space-y-3 py-2 text-xs text-muted-foreground">
					<p>先创建人物、物体或几何蒙版，再选择跟踪方向。</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						onClick={onOpenMasks}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						<Plus className="size-3.5" />
						创建蒙版
					</Button>
				</div>
			) : (
				<div className="divide-y divide-border/70">
					{masks.map((mask, index) => (
						<div key={mask.id ?? `${mask.type}-${index}`} className="py-3">
							<div className="mb-2 flex items-center justify-between gap-2">
								<span className="truncate text-xs font-medium">
									{mask.name || `蒙版 ${index + 1}`}
								</span>
								<span className="shrink-0 text-[10px] text-muted-foreground">
									{correctionCount({ mask })} 个修正帧
								</span>
							</div>
							<MediaMaskTrackingControls
								mask={mask}
								onTrack={(direction) => {
									patchMask({
										mask,
										updates: {
											tracking: {
												direction,
												status: "processing",
												source: mask.type === "person" ? "mediapipe" : "sam3",
												progress: 0,
												anchorFrame: currentFrame,
											},
										},
									});
									onTrack({ mask, direction });
								}}
								onPause={() => {
									cancelActiveMaskTracking({ elementId, maskId: mask.id });
									patchMask({
										mask,
										updates: updateMaskTrackingStatus({
											mask,
											status: "paused",
										}),
									});
								}}
								onResume={() => {
									if (
										resumeActiveMaskTracking({
											elementId,
											maskId: mask.id,
										})
									) {
										return;
									}
									const direction = mask.tracking?.direction ?? "both";
									patchMask({
										mask,
										updates: updateMaskTrackingStatus({
											mask,
											status: "processing",
											progress: mask.tracking?.progress ?? 0,
										}),
									});
									onTrack({ mask, direction });
								}}
								onFixFrame={() =>
									patchMask({
										mask,
										updates: addMaskTrackingCorrectionKeyframes({
											mask,
											frame: currentFrame,
										}),
									})
								}
							/>
						</div>
					))}
				</div>
			)}
		</PropertyGroup>
	);
}
