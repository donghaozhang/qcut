import {
	CheckCircle2,
	CircleAlert,
	CirclePause,
	ListTodo,
	LoaderCircle,
	Play,
	RotateCcw,
	Square,
	Trash2,
	Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { type TranslationKey, useTranslation } from "@/lib/i18n";
import {
	clearCloudTaskRuntimeActions,
	getCloudTaskRuntimeActions,
} from "@/lib/cloud-tasks/task-runtime-actions";
import {
	type CloudTask,
	type CloudTaskStatus,
	useCloudTaskStore,
} from "@/stores/cloud-task-store";

const STATUS_LABEL_KEYS: Record<CloudTaskStatus, TranslationKey> = {
	queued: "taskCenter.status.queued",
	running: "taskCenter.status.running",
	completed: "taskCenter.status.completed",
	failed: "taskCenter.status.failed",
	canceled: "taskCenter.status.canceled",
	interrupted: "taskCenter.status.interrupted",
};

function TaskIcon({ status }: { status: CloudTaskStatus }) {
	if (status === "queued" || status === "running") {
		return <LoaderCircle className="size-3.5 animate-spin text-primary" />;
	}
	if (status === "completed") {
		return <CheckCircle2 className="size-3.5 text-emerald-500" />;
	}
	if (status === "interrupted") {
		return <CirclePause className="size-3.5 text-amber-500" />;
	}
	return <CircleAlert className="size-3.5 text-destructive" />;
}

function activate({
	event,
	action,
}: {
	event: React.KeyboardEvent<HTMLButtonElement>;
	action: () => void;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	action();
}

function TaskRow({ task }: { task: CloudTask }) {
	const { t } = useTranslation();
	const cancelTask = useCloudTaskStore((state) => state.cancelTask);
	const retryTask = useCloudTaskStore((state) => state.retryTask);
	const removeTask = useCloudTaskStore((state) => state.removeTask);
	const actions = getCloudTaskRuntimeActions({ taskId: task.id });
	const active = task.status === "queued" || task.status === "running";
	const retryable = ["failed", "canceled", "interrupted"].includes(task.status);
	const cost = task.actualCostUsd ?? task.estimatedCostUsd;

	const cancel = () => {
		cancelTask({ id: task.id });
		void actions?.cancel?.();
	};
	const retry = () => {
		retryTask({ id: task.id });
		void actions?.retry?.();
	};
	const open = () => void actions?.open?.();
	const undo = () => void actions?.undo?.();
	const remove = () => {
		clearCloudTaskRuntimeActions({ taskId: task.id });
		removeTask({ id: task.id });
	};

	return (
		<div
			className="space-y-2 border-b border-border/60 px-3 py-2.5 last:border-b-0"
			data-testid={`task-center-row-${task.id}`}
		>
			<div className="flex items-center gap-2">
				<TaskIcon status={task.status} />
				<span className="min-w-0 flex-1 truncate text-xs font-medium">
					{task.label}
				</span>
				<span className="text-[10px] text-muted-foreground">
					{t(STATUS_LABEL_KEYS[task.status])}
				</span>
			</div>
			<Progress value={task.progress} className="h-1" />
			<div className="flex items-start justify-between gap-2 text-[10px] text-muted-foreground">
				<span className="min-w-0 flex-1 line-clamp-2">
					{task.error ?? task.message}
				</span>
				{cost === undefined ? null : (
					<span className="shrink-0 tabular-nums">${cost.toFixed(3)}</span>
				)}
			</div>
			<div className="flex justify-end gap-1">
				{task.status === "completed" && actions?.undo ? (
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={undo}
						onKeyDown={(event) => activate({ event, action: undo })}
					>
						<Undo2 className="size-3" />
						{t("taskCenter.undo")}
					</Button>
				) : null}
				{actions?.open ? (
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={open}
						onKeyDown={(event) => activate({ event, action: open })}
					>
						<Play className="size-3" />
						{t("taskCenter.open")}
					</Button>
				) : null}
				{active && actions?.cancel ? (
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={cancel}
						onKeyDown={(event) => activate({ event, action: cancel })}
					>
						<Square className="size-3" />
						{t("taskCenter.cancel")}
					</Button>
				) : null}
				{retryable && actions?.retry ? (
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2 text-[10px]"
						onClick={retry}
						onKeyDown={(event) => activate({ event, action: retry })}
					>
						<RotateCcw className="size-3" />
						{t("taskCenter.retry")}
					</Button>
				) : null}
				{active ? null : (
					<Button
						type="button"
						variant="text"
						size="icon"
						className="size-6"
						aria-label={t("taskCenter.remove")}
						title={t("taskCenter.remove")}
						onClick={remove}
						onKeyDown={(event) => activate({ event, action: remove })}
					>
						<Trash2 className="size-3" />
					</Button>
				)}
			</div>
		</div>
	);
}

export function CloudTaskCenter() {
	const { t } = useTranslation();
	const tasks = useCloudTaskStore((state) => state.tasks);
	const clearFinished = useCloudTaskStore((state) => state.clearFinished);
	const activeCount = tasks.filter(
		(task) => task.status === "queued" || task.status === "running"
	).length;
	const clearEnded = () => {
		for (const task of tasks) {
			if (task.status === "queued" || task.status === "running") continue;
			clearCloudTaskRuntimeActions({ taskId: task.id });
		}
		clearFinished();
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="relative"
					aria-label={t("taskCenter.title")}
					title={t("taskCenter.title")}
					data-testid="cloud-task-center-trigger"
				>
					<ListTodo className="size-4" />
					{activeCount > 0 ? (
						<span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
							{Math.min(activeCount, 9)}
						</span>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[360px] p-0">
				<div className="flex items-center justify-between px-3 py-2">
					<DropdownMenuLabel className="p-0">
						{t("taskCenter.title")}
					</DropdownMenuLabel>
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2 text-[10px]"
						disabled={
							!tasks.some(
								(task) => !["queued", "running"].includes(task.status)
							)
						}
						onClick={clearEnded}
						onKeyDown={(event) => activate({ event, action: clearEnded })}
					>
						{t("taskCenter.clearFinished")}
					</Button>
				</div>
				<DropdownMenuSeparator className="m-0" />
				<div className="max-h-[420px] overflow-y-auto">
					{tasks.length > 0 ? (
						tasks.map((task) => <TaskRow key={task.id} task={task} />)
					) : (
						<div className="px-3 py-10 text-center text-xs text-muted-foreground">
							{t("taskCenter.empty")}
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
