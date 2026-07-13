import {
	CheckCircle2Icon,
	CircleXIcon,
	Loader2Icon,
	RotateCcwIcon,
	SquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type CutoutTaskPhase =
	| "idle"
	| "uploading"
	| "queued"
	| "processing"
	| "downloading"
	| "analyzing"
	| "completed"
	| "canceled"
	| "error";

const ACTIVE_PHASES = new Set<CutoutTaskPhase>([
	"uploading",
	"queued",
	"processing",
	"downloading",
	"analyzing",
]);

const PHASE_LABELS: Record<Exclude<CutoutTaskPhase, "idle">, string> = {
	uploading: "上传中",
	queued: "等待中",
	processing: "处理中",
	downloading: "下载中",
	analyzing: "分析中",
	completed: "已完成",
	canceled: "已取消",
	error: "失败",
};

export function isActiveCutoutPhase({
	phase,
}: {
	phase: CutoutTaskPhase;
}): boolean {
	return ACTIVE_PHASES.has(phase);
}

export function CutoutTaskStatus({
	phase,
	progress,
	message,
	elapsedTime,
	error,
	onCancel,
	onRetry,
}: {
	phase: CutoutTaskPhase;
	progress: number;
	message: string;
	elapsedTime: number;
	error?: string;
	onCancel?: () => void;
	onRetry?: () => void;
}) {
	if (phase === "idle") return null;
	const isActive = isActiveCutoutPhase({ phase });
	const isError = phase === "error";
	const statusMessage = error || message;

	return (
		<div
			className={cn(
				"space-y-2 rounded-sm border p-2.5",
				isError && "border-destructive/40 bg-destructive/5"
			)}
			data-testid="cutout-task-status"
			role="status"
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<div className="flex min-w-0 items-center gap-1.5 font-medium">
					{isActive ? (
						<Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
					) : phase === "completed" ? (
						<CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />
					) : (
						<CircleXIcon
							className={cn(
								"size-3.5 shrink-0",
								isError ? "text-destructive" : "text-muted-foreground"
							)}
						/>
					)}
					<span>{PHASE_LABELS[phase]}</span>
				</div>
				<span className="shrink-0 text-muted-foreground">
					{Math.max(0, Math.floor(elapsedTime))}s
				</span>
			</div>

			{isActive || phase === "completed" ? (
				<Progress value={progress} className="h-1.5" />
			) : null}
			<p
				className={cn(
					"text-[11px] text-muted-foreground",
					isError && "text-destructive"
				)}
			>
				{statusMessage}
			</p>

			{isActive && onCancel ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 w-full gap-1.5 text-xs"
					onClick={onCancel}
				>
					<SquareIcon className="size-3" />
					取消
				</Button>
			) : null}
			{(phase === "error" || phase === "canceled") && onRetry ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 w-full gap-1.5 text-xs"
					onClick={onRetry}
				>
					<RotateCcwIcon className="size-3.5" />
					重试
				</Button>
			) : null}
		</div>
	);
}
