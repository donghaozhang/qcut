import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { generateUUID } from "@/lib/utils";

export const CLOUD_TASK_STORAGE_KEY = "qcut-cloud-tasks-v1";

export type CloudTaskKind =
	| "sam3"
	| "cutout"
	| "avatar"
	| "generation"
	| "scene-detection"
	| "transcription"
	| "review"
	| "audio-generation";
export type CloudTaskStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "canceled"
	| "interrupted";

export type CloudTaskValue =
	| string
	| number
	| boolean
	| null
	| CloudTaskValue[]
	| { [key: string]: CloudTaskValue };

export type CloudTaskPayload = Record<string, CloudTaskValue>;

export interface CloudTask {
	id: string;
	kind: CloudTaskKind;
	label: string;
	status: CloudTaskStatus;
	progress: number;
	message: string;
	payload: CloudTaskPayload;
	remoteId?: string;
	sessionId?: string;
	estimatedCostUsd?: number;
	actualCostUsd?: number;
	output?: CloudTaskPayload;
	error?: string;
	retryCount: number;
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	completedAt?: number;
}

export interface CreateCloudTaskInput {
	id?: string;
	kind: CloudTaskKind;
	label: string;
	payload?: Record<string, unknown>;
	estimatedCostUsd?: number;
	message?: string;
}

interface CloudTaskPersistedState {
	tasks: CloudTask[];
}

interface CloudTaskStore extends CloudTaskPersistedState {
	createTask: (input: CreateCloudTaskInput) => string;
	startTask: ({
		id,
		sessionId,
		message,
	}: {
		id: string;
		sessionId?: string;
		message?: string;
	}) => void;
	updateProgress: ({
		id,
		progress,
		message,
	}: {
		id: string;
		progress: number;
		message?: string;
	}) => void;
	attachRemote: ({ id, remoteId }: { id: string; remoteId: string }) => void;
	completeTask: ({
		id,
		message,
		output,
		actualCostUsd,
	}: {
		id: string;
		message?: string;
		output?: Record<string, unknown>;
		actualCostUsd?: number;
	}) => void;
	failTask: ({ id, error }: { id: string; error: string }) => void;
	cancelTask: ({ id }: { id: string }) => void;
	retryTask: ({ id }: { id: string }) => void;
	removeTask: ({ id }: { id: string }) => void;
	clearFinished: () => void;
	resetTasks: () => void;
}

const TASK_KINDS = new Set<CloudTaskKind>([
	"sam3",
	"cutout",
	"avatar",
	"generation",
	"scene-detection",
	"transcription",
	"review",
	"audio-generation",
]);
const TASK_STATUSES = new Set<CloudTaskStatus>([
	"queued",
	"running",
	"completed",
	"failed",
	"canceled",
	"interrupted",
]);
const SENSITIVE_KEY =
	/(authorization|password|secret|token|api.?key|credential)/i;
const FINISHED_STATUSES = new Set<CloudTaskStatus>([
	"completed",
	"failed",
	"canceled",
	"interrupted",
]);

function isTaskActive({ task }: { task: CloudTask }): boolean {
	return task.status === "queued" || task.status === "running";
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function sanitizeUrl({ value }: { value: string }): string {
	if (!/^https?:\/\//i.test(value)) return value.slice(0, 8_000);
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname}`.slice(0, 8_000);
	} catch {
		return value.slice(0, 8_000);
	}
}

function sanitizeValue({
	value,
	depth,
}: {
	value: unknown;
	depth: number;
}): CloudTaskValue | undefined {
	if (depth > 6 || value === undefined) return undefined;
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value === "string") return sanitizeUrl({ value });
	if (Array.isArray(value)) {
		return value
			.map((candidate) => sanitizeValue({ value: candidate, depth: depth + 1 }))
			.filter(
				(candidate): candidate is CloudTaskValue => candidate !== undefined
			)
			.slice(0, 200);
	}
	const record = asRecord({ value });
	if (!record) return undefined;
	const sanitized: CloudTaskPayload = {};
	for (const [key, candidate] of Object.entries(record)) {
		if (SENSITIVE_KEY.test(key)) continue;
		const safeValue = sanitizeValue({ value: candidate, depth: depth + 1 });
		if (safeValue !== undefined) sanitized[key] = safeValue;
	}
	return sanitized;
}

export function sanitizeCloudTaskPayload({
	payload,
}: {
	payload: Record<string, unknown>;
}): CloudTaskPayload {
	return (sanitizeValue({ value: payload, depth: 0 }) ??
		{}) as CloudTaskPayload;
}

function finiteNumber({ value }: { value: unknown }): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function normalizeTask({
	value,
	now,
}: {
	value: unknown;
	now: number;
}): CloudTask | undefined {
	const record = asRecord({ value });
	if (!record) return undefined;
	if (
		typeof record.id !== "string" ||
		!record.id ||
		typeof record.kind !== "string" ||
		!TASK_KINDS.has(record.kind as CloudTaskKind) ||
		typeof record.label !== "string" ||
		!record.label ||
		typeof record.status !== "string" ||
		!TASK_STATUSES.has(record.status as CloudTaskStatus)
	) {
		return undefined;
	}
	const persistedStatus = record.status as CloudTaskStatus;
	const interrupted =
		persistedStatus === "queued" || persistedStatus === "running";
	const status: CloudTaskStatus = interrupted ? "interrupted" : persistedStatus;
	return {
		id: record.id,
		kind: record.kind as CloudTaskKind,
		label: record.label.slice(0, 160),
		status,
		progress: Math.max(
			0,
			Math.min(100, finiteNumber({ value: record.progress }) ?? 0)
		),
		message: interrupted
			? "QCut 关闭时任务被中断，请重试。"
			: typeof record.message === "string"
				? record.message.slice(0, 500)
				: "",
		payload: sanitizeCloudTaskPayload({
			payload: asRecord({ value: record.payload }) ?? {},
		}),
		remoteId: typeof record.remoteId === "string" ? record.remoteId : undefined,
		sessionId:
			typeof record.sessionId === "string" ? record.sessionId : undefined,
		estimatedCostUsd: finiteNumber({ value: record.estimatedCostUsd }),
		actualCostUsd: finiteNumber({ value: record.actualCostUsd }),
		output: asRecord({ value: record.output })
			? sanitizeCloudTaskPayload({
					payload: asRecord({ value: record.output }) ?? {},
				})
			: undefined,
		error:
			typeof record.error === "string"
				? record.error.slice(0, 2_000)
				: undefined,
		retryCount: Math.max(
			0,
			Math.floor(finiteNumber({ value: record.retryCount }) ?? 0)
		),
		createdAt: finiteNumber({ value: record.createdAt }) ?? now,
		updatedAt: interrupted
			? now
			: (finiteNumber({ value: record.updatedAt }) ?? now),
		startedAt: finiteNumber({ value: record.startedAt }),
		completedAt: finiteNumber({ value: record.completedAt }),
	};
}

export function normalizeCloudTaskPersistedState({
	value,
	now = Date.now(),
}: {
	value: unknown;
	now?: number;
}): CloudTaskPersistedState {
	const record = asRecord({ value });
	const rawTasks = Array.isArray(record?.tasks) ? record.tasks : [];
	const tasks: CloudTask[] = [];
	const seenIds = new Set<string>();
	for (const rawTask of rawTasks) {
		const task = normalizeTask({ value: rawTask, now });
		if (!task || seenIds.has(task.id)) continue;
		seenIds.add(task.id);
		tasks.push(task);
	}
	return {
		tasks: tasks
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.slice(0, 100),
	};
}

function updateTask({
	tasks,
	id,
	update,
}: {
	tasks: CloudTask[];
	id: string;
	update: (task: CloudTask) => CloudTask;
}): CloudTask[] {
	return tasks.map((task) => (task.id === id ? update(task) : task));
}

export const useCloudTaskStore = create<CloudTaskStore>()(
	persist(
		(set) => ({
			tasks: [],
			createTask: (input) => {
				const id = input.id ?? generateUUID();
				const now = Date.now();
				const task: CloudTask = {
					id,
					kind: input.kind,
					label: input.label,
					status: "queued",
					progress: 0,
					message: input.message ?? "Queued",
					payload: sanitizeCloudTaskPayload({ payload: input.payload ?? {} }),
					estimatedCostUsd: input.estimatedCostUsd,
					retryCount: 0,
					createdAt: now,
					updatedAt: now,
				};
				set(({ tasks }) => ({
					tasks: [
						task,
						...tasks.filter((candidate) => candidate.id !== id),
					].slice(0, 100),
				}));
				return id;
			},
			startTask: ({ id, sessionId, message }) => {
				const now = Date.now();
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) =>
							isTaskActive({ task })
								? {
										...task,
										status: "running",
										message: message ?? "正在启动",
										sessionId: sessionId ?? task.sessionId,
										startedAt: task.startedAt ?? now,
										updatedAt: now,
										error: undefined,
									}
								: task,
					}),
				}));
			},
			updateProgress: ({ id, progress, message }) => {
				const now = Date.now();
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) =>
							isTaskActive({ task })
								? {
										...task,
										status: "running",
										progress: Math.max(0, Math.min(99, progress)),
										message: message ?? task.message,
										updatedAt: now,
									}
								: task,
					}),
				}));
			},
			attachRemote: ({ id, remoteId }) => {
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) => ({ ...task, remoteId, updatedAt: Date.now() }),
					}),
				}));
			},
			completeTask: ({ id, message, output, actualCostUsd }) => {
				const now = Date.now();
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) =>
							isTaskActive({ task })
								? {
										...task,
										status: "completed",
										progress: 100,
										message: message ?? "已完成",
										output: output
											? sanitizeCloudTaskPayload({ payload: output })
											: task.output,
										actualCostUsd: actualCostUsd ?? task.actualCostUsd,
										completedAt: now,
										updatedAt: now,
										error: undefined,
									}
								: task,
					}),
				}));
			},
			failTask: ({ id, error }) => {
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) =>
							isTaskActive({ task })
								? {
										...task,
										status: "failed",
										message: "失败",
										error: error.slice(0, 2_000),
										updatedAt: Date.now(),
									}
								: task,
					}),
				}));
			},
			cancelTask: ({ id }) => {
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) =>
							isTaskActive({ task })
								? {
										...task,
										status: "canceled",
										message: "已取消",
										updatedAt: Date.now(),
									}
								: task,
					}),
				}));
			},
			retryTask: ({ id }) => {
				set(({ tasks }) => ({
					tasks: updateTask({
						tasks,
						id,
						update: (task) => ({
							...task,
							status: "queued",
							progress: 0,
							message: task.remoteId
								? "Ready to resume remote task"
								: "Ready to retry",
							retryCount: task.retryCount + 1,
							updatedAt: Date.now(),
							completedAt: undefined,
							error: undefined,
						}),
					}),
				}));
			},
			removeTask: ({ id }) => {
				set(({ tasks }) => ({
					tasks: tasks.filter((task) => task.id !== id),
				}));
			},
			clearFinished: () => {
				set(({ tasks }) => ({
					tasks: tasks.filter((task) => !FINISHED_STATUSES.has(task.status)),
				}));
			},
			resetTasks: () => set({ tasks: [] }),
		}),
		{
			name: CLOUD_TASK_STORAGE_KEY,
			version: 1,
			storage: createJSONStorage(() => localStorage),
			partialize: ({ tasks }) => ({ tasks }),
			merge: (persisted, current) => ({
				...current,
				...normalizeCloudTaskPersistedState({ value: persisted }),
			}),
		}
	)
);
