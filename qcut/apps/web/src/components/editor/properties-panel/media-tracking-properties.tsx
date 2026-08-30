import { useState } from "react";
import {
	CircleAlert,
	CircleCheck,
	Grid2X2,
	Loader2,
	Plus,
	RefreshCw,
	ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { JianyingMotionTrackingStatus } from "@/types/electron/api-jianying-motion-tracking";
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
	return mask.tracking?.correctedFrames?.length ?? 0;
}

type TrackingSolver = "jianying-bingo" | "qcut-mask";

type StartTracking = ({
	mask,
	direction,
}: {
	mask: MediaMask;
	direction: MediaMaskTrackingDirection;
}) => void;

export function MediaTrackingProperties({
	elementId,
	masks,
	currentFrame,
	onChange,
	onTrack,
	onTrackMotion,
	onOpenMasks,
	motionTrackingStatus,
	motionTrackingStatusLoading = false,
	onRefreshMotionTrackingStatus,
}: {
	elementId: string;
	masks: MediaMask[];
	currentFrame: number;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onTrack: StartTracking;
	onTrackMotion?: StartTracking;
	onOpenMasks: () => void;
	motionTrackingStatus?: JianyingMotionTrackingStatus | null;
	motionTrackingStatusLoading?: boolean;
	onRefreshMotionTrackingStatus?: () => void;
}) {
	const [solver, setSolver] = useState<TrackingSolver>(
		onTrackMotion ? "jianying-bingo" : "qcut-mask"
	);
	const motionRuntimeAvailable = Boolean(
		motionTrackingStatus?.available && onTrackMotion
	);
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
	const launchTracking = ({
		direction,
		mask,
		solverOverride = solver,
	}: {
		direction: MediaMaskTrackingDirection;
		mask: MediaMask;
		solverOverride?: TrackingSolver;
	}) => {
		const useMotionRuntime = solverOverride === "jianying-bingo";
		if (useMotionRuntime && !motionRuntimeAvailable) return;
		patchMask({
			mask,
			updates: {
				tracking: {
					...mask.tracking,
					direction,
					status: "processing",
					source: useMotionRuntime
						? "jianying-bingo"
						: mask.type === "person"
							? "mediapipe"
							: "sam3",
					progress: 0,
					anchorFrame: currentFrame,
					error: undefined,
				},
			},
		});
		(useMotionRuntime ? onTrackMotion : onTrack)?.({ mask, direction });
	};
	const runtimeStatus = motionTrackingStatusLoading
		? {
				Icon: Loader2,
				className: "animate-spin",
				label: "正在检查本机运行时",
			}
		: motionTrackingStatus?.offlineReady
			? {
					Icon: motionTrackingStatus.available ? CircleCheck : CircleAlert,
					className: motionTrackingStatus.available
						? "text-emerald-500"
						: "text-amber-500",
					label: motionTrackingStatus.message,
				}
			: {
					Icon: CircleAlert,
					className: "text-muted-foreground",
					label:
						motionTrackingStatus?.message ??
						"仅桌面版可调用仓库外的本机研究运行时",
				};

	return (
		<PropertyGroup title="跟踪" defaultExpanded>
			<div
				className="space-y-3 border-b border-border/70 pb-3"
				data-testid="motion-tracking-panel"
			>
				<div
					className="grid grid-cols-2 gap-1.5"
					role="group"
					aria-label="跟踪模式"
				>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-8 text-xs"
						aria-pressed="true"
					>
						<ScanSearch className="size-3.5" />
						运动跟踪
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 text-xs"
						disabled
						title="平面跟踪需要独立的四点单应性求解器"
					>
						<Grid2X2 className="size-3.5" />
						平面跟踪
					</Button>
				</div>
				<Select
					value={solver}
					onValueChange={(value) => setSolver(value as TrackingSolver)}
				>
					<SelectTrigger
						className="h-8 text-xs"
						aria-label="运动跟踪求解器"
						data-testid="motion-tracking-solver"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="jianying-bingo">
							本机研究运行时 · Bingo 11.3
						</SelectItem>
						<SelectItem value="qcut-mask">QCut 蒙版分割</SelectItem>
					</SelectContent>
				</Select>
				{solver === "jianying-bingo" ? (
					<div className="flex items-start justify-between gap-2">
						<div className="flex min-w-0 items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
							<runtimeStatus.Icon
								className={`mt-0.5 size-3 shrink-0 ${runtimeStatus.className}`}
							/>
							<span>{runtimeStatus.label}</span>
						</div>
						{onRefreshMotionTrackingStatus ? (
							<Button
								type="button"
								variant="text"
								size="sm"
								className="h-6 shrink-0 px-2 text-[10px]"
								onClick={onRefreshMotionTrackingStatus}
								disabled={motionTrackingStatusLoading}
							>
								<RefreshCw className="size-3" />
								刷新
							</Button>
						) : null}
					</div>
				) : (
					<p className="text-[10px] leading-4 text-muted-foreground">
						人物使用本机分割，其他蒙版转到分割工作区继续分析。
					</p>
				)}
			</div>
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
								onTrack={
									solver === "jianying-bingo" && !motionRuntimeAvailable
										? undefined
										: (direction) => launchTracking({ mask, direction })
								}
								onPause={() => {
									void cancelActiveMaskTracking({
										elementId,
										maskId: mask.id,
									});
									patchMask({
										mask,
										updates: updateMaskTrackingStatus({
											mask,
											status: "paused",
										}),
									});
								}}
								onResume={async () => {
									const direction = mask.tracking?.direction ?? "both";
									patchMask({
										mask,
										updates: updateMaskTrackingStatus({
											mask,
											status: "processing",
											progress: mask.tracking?.progress ?? 0,
										}),
									});
									if (
										await resumeActiveMaskTracking({
											elementId,
											maskId: mask.id,
										})
									) {
										return;
									}
									launchTracking({
										mask,
										direction,
										solverOverride:
											mask.tracking?.source === "jianying-bingo"
												? "jianying-bingo"
												: "qcut-mask",
									});
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
