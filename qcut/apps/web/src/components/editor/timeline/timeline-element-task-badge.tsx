import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CloudTask, useCloudTaskStore } from "@/stores/cloud-task-store";
import type { MediaElement, TimelineElement } from "@/types/timeline";

export interface TimelineElementTaskStatus {
	state: "processing" | "error";
	label: string;
	detail?: string;
}

function statusTask({
	status,
	label,
	error,
	processingStatuses = ["processing"],
}: {
	status?: string;
	label: string;
	error?: string;
	processingStatuses?: string[];
}): TimelineElementTaskStatus | null {
	if (status === "error") return { state: "error", label, detail: error };
	if (status && processingStatuses.includes(status)) {
		return { state: "processing", label };
	}
	return null;
}

function mediaTaskStatuses({
	element,
	cloudTasks = [],
}: {
	element: MediaElement;
	cloudTasks?: CloudTask[];
}): TimelineElementTaskStatus[] {
	const masks = element.masks ?? (element.mask ? [element.mask] : []);
	const elementCloudTasks = cloudTasks.filter(
		(task) => task.payload.elementId === element.id
	);
	const candidates: Array<TimelineElementTaskStatus | null> = [
		...elementCloudTasks.map((task) => {
			if (task.status === "failed" || task.status === "interrupted") {
				return {
					state: "error" as const,
					label: task.label,
					detail: task.error ?? task.message,
				};
			}
			if (task.status === "queued" || task.status === "running") {
				return { state: "processing" as const, label: task.label };
			}
			return null;
		}),
		...masks.map((mask) =>
			statusTask({
				status: mask.tracking?.status,
				label: "Mask tracking",
				error: mask.tracking?.error,
			})
		),
		statusTask({
			status: element.customCutout?.status,
			label: "Custom cutout",
			error: element.customCutout?.error,
		}),
		statusTask({
			status: element.audio?.loudness.analysisStatus,
			label: "Loudness analysis",
			error: element.audio?.loudness.analysisError,
			processingStatuses: ["analyzing"],
		}),
		statusTask({
			status: element.audio?.denoise.status,
			label: "Audio denoise",
			error: element.audio?.denoise.error,
		}),
		statusTask({
			status: element.audio?.separation.status,
			label: "Voice separation",
			error: element.audio?.separation.error,
		}),
		statusTask({
			status: element.audio?.voiceConversion.status,
			label: "Voice conversion",
			error: element.audio?.voiceConversion.error,
		}),
		statusTask({
			status: element.audio?.cover.status,
			label: "AI cover",
			error: element.audio?.cover.error,
			processingStatuses: ["separating", "converting"],
		}),
		statusTask({
			status: element.audio?.lyrics.status,
			label: "Lyrics transcription",
			processingStatuses: ["transcribing"],
		}),
	];
	return candidates.filter(
		(candidate): candidate is TimelineElementTaskStatus => candidate !== null
	);
}

export function resolveTimelineElementTaskStatus({
	element,
	cloudTasks = [],
}: {
	element: TimelineElement;
	cloudTasks?: CloudTask[];
}): TimelineElementTaskStatus | null {
	if (element.type !== "media") return null;
	const tasks = mediaTaskStatuses({ element, cloudTasks });
	return (
		tasks.find((task) => task.state === "error") ??
		tasks.find((task) => task.state === "processing") ??
		null
	);
}

export function TimelineElementTaskBadge({
	element,
	showLabel,
}: {
	element: TimelineElement;
	showLabel: boolean;
}) {
	const cloudTasks = useCloudTaskStore((state) => state.tasks);
	const task = resolveTimelineElementTaskStatus({ element, cloudTasks });
	if (!task) return null;
	const accessibleLabel =
		task.state === "error"
			? `${task.label} failed${task.detail ? `: ${task.detail}` : ""}`
			: `${task.label} in progress`;

	return (
		<div
			className={cn(
				"pointer-events-none absolute bottom-1 right-1 z-30 flex h-5 max-w-[calc(100%-8px)] items-center gap-1 rounded-sm px-1 text-[9px] font-medium shadow-sm",
				task.state === "error"
					? "bg-destructive text-destructive-foreground"
					: "bg-black/75 text-white"
			)}
			role="status"
			aria-label={accessibleLabel}
			title={accessibleLabel}
			data-testid="timeline-task-badge"
		>
			{task.state === "error" ? (
				<CircleAlertIcon className="size-3 shrink-0" />
			) : (
				<LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
			)}
			{showLabel ? <span className="truncate">{task.label}</span> : null}
		</div>
	);
}
