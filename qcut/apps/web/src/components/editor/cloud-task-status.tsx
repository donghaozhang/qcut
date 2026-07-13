import {
	CheckCircle2,
	CircleAlert,
	CirclePause,
	LoaderCircle,
	RotateCcw,
	Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
	type CloudTaskStatus as TaskStatus,
	useCloudTaskStore,
} from "@/stores/cloud-task-store";

const STATUS_LABELS: Record<TaskStatus, string> = {
	queued: "等待中",
	running: "处理中",
	completed: "已完成",
	failed: "失败",
	canceled: "已取消",
	interrupted: "已中断",
};

function TaskStatusIcon({ status }: { status: TaskStatus }) {
	if (status === "queued" || status === "running") {
		return (
			<LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary">
				<title>Task running</title>
			</LoaderCircle>
		);
	}
	if (status === "completed") {
		return (
			<CheckCircle2 className="size-3.5 shrink-0 text-emerald-500">
				<title>Task complete</title>
			</CheckCircle2>
		);
	}
	if (status === "interrupted") {
		return (
			<CirclePause className="size-3.5 shrink-0 text-amber-500">
				<title>Task interrupted</title>
			</CirclePause>
		);
	}
	return (
		<CircleAlert className="size-3.5 shrink-0 text-destructive">
			<title>Task stopped</title>
		</CircleAlert>
	);
}

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

export function CloudTaskStatus({
	taskId,
	onCancel,
	onRetry,
}: {
	taskId?: string;
	onCancel?: () => void | Promise<void>;
	onRetry?: () => void | Promise<void>;
}) {
	const task = useCloudTaskStore((state) =>
		state.tasks.find((candidate) => candidate.id === taskId)
	);
	const cancelTask = useCloudTaskStore((state) => state.cancelTask);
	const retryTask = useCloudTaskStore((state) => state.retryTask);
	if (!task) return null;
	const active = task.status === "queued" || task.status === "running";
	const canRetry =
		task.status === "failed" ||
		task.status === "canceled" ||
		task.status === "interrupted";
	const cost = task.actualCostUsd ?? task.estimatedCostUsd;
	const costLabel =
		cost === undefined
			? undefined
			: `${task.actualCostUsd === undefined ? "Est. " : ""}$${cost.toFixed(3)}`;

	const handleCancel = () => {
		cancelTask({ id: task.id });
		void onCancel?.();
	};
	const handleRetry = () => {
		retryTask({ id: task.id });
		void onRetry?.();
	};

	return (
		<div
			className={cn(
				"space-y-2 border-y border-border py-2.5",
				task.status === "failed" && "border-destructive/40"
			)}
			data-testid="cloud-task-status"
			data-task-status={task.status}
			role="status"
		>
			<div className="flex items-center gap-1.5 text-xs">
				<TaskStatusIcon status={task.status} />
				<span className="min-w-0 flex-1 truncate font-medium">
					{task.label}
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{STATUS_LABELS[task.status]}
				</span>
			</div>
			<Progress value={task.progress} className="h-1" />
			<div className="flex items-start justify-between gap-2 text-[10px] text-muted-foreground">
				<span className="min-w-0 flex-1">{task.error ?? task.message}</span>
				{costLabel ? (
					<span className="shrink-0 tabular-nums">{costLabel}</span>
				) : null}
			</div>
			{active && onCancel ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 w-full text-xs"
					onClick={handleCancel}
					onKeyDown={(event) => activateButton({ event, action: handleCancel })}
				>
					<Square className="size-3" aria-hidden="true">
						<title>Cancel task</title>
					</Square>
					取消
				</Button>
			) : null}
			{canRetry && onRetry ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 w-full text-xs"
					onClick={handleRetry}
					onKeyDown={(event) => activateButton({ event, action: handleRetry })}
				>
					<RotateCcw className="size-3.5" aria-hidden="true">
						<title>Retry task</title>
					</RotateCcw>
					{task.remoteId ? "继续" : "重试"}
				</Button>
			) : null}
		</div>
	);
}
