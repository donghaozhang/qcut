import { useCallback, useEffect, useRef, useState } from "react";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import {
	type CloudTaskKind,
	useCloudTaskStore,
} from "@/stores/cloud-task-store";

interface PersistentAiTaskExecution {
	signal: AbortSignal;
	updateProgress: ({
		progress,
		message,
	}: {
		progress: number;
		message?: string;
	}) => void;
}

interface PersistentAiTaskRuntime<Result> {
	cancel: () => void;
	retry: () => Promise<Result | null>;
}

export interface PersistentAiTaskRequest<Result> {
	kind?: CloudTaskKind;
	label: string;
	payload?: Record<string, unknown>;
	startMessage?: string;
	completeMessage: string | ((result: Result) => string);
	execute: (execution: PersistentAiTaskExecution) => Promise<Result>;
	onSuccess?: (result: Result) => void | Promise<void>;
	onUndo?: (result: Result) => void | Promise<void>;
	onCancel?: () => void | Promise<void>;
	onError?: (error: Error) => void | Promise<void>;
	open?: () => void | Promise<void>;
	output?: (result: Result) => Record<string, unknown>;
	onRuntimeReady?: ({
		cancel,
		retry,
	}: PersistentAiTaskRuntime<Result>) => undefined | (() => void);
}

export interface PersistentAiTaskState {
	isRunning: boolean;
	error: string | null;
	clearError: () => void;
	runTask: <Result>(
		request: PersistentAiTaskRequest<Result>
	) => Promise<Result | null>;
}

export function usePersistentAiTask(): PersistentAiTaskState {
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const operationTokenRef = useRef(0);
	const activeTaskIdRef = useRef<string | undefined>(undefined);
	const activeControllerRef = useRef<AbortController | undefined>(undefined);

	useEffect(
		() => () => {
			operationTokenRef.current += 1;
			activeControllerRef.current?.abort();
			if (activeTaskIdRef.current) {
				useCloudTaskStore
					.getState()
					.cancelTask({ id: activeTaskIdRef.current });
			}
		},
		[]
	);

	const clearError = useCallback(() => setError(null), []);
	const runTask = useCallback(
		async <Result>(
			request: PersistentAiTaskRequest<Result>
		): Promise<Result | null> => {
			const cloudTasks = useCloudTaskStore.getState();
			const taskId = cloudTasks.createTask({
				kind: request.kind ?? "generation",
				label: request.label,
				payload: request.payload,
				message: request.startMessage ?? "正在准备 AI 任务",
			});

			const executeAttempt = async (): Promise<Result | null> => {
				const task = useCloudTaskStore
					.getState()
					.tasks.find((candidate) => candidate.id === taskId);
				if (task && !["queued", "running"].includes(task.status)) {
					useCloudTaskStore.getState().retryTask({ id: taskId });
				}
				const attemptToken = operationTokenRef.current + 1;
				operationTokenRef.current = attemptToken;
				const controller = new AbortController();
				activeTaskIdRef.current = taskId;
				activeControllerRef.current = controller;
				setIsRunning(true);
				setError(null);

				const cancel = () => {
					if (operationTokenRef.current !== attemptToken) return;
					operationTokenRef.current += 1;
					controller.abort();
					setIsRunning(false);
					useCloudTaskStore.getState().cancelTask({ id: taskId });
					void request.onCancel?.();
				};
				const retry = () => executeAttempt();
				const unregisterRuntime = request.onRuntimeReady?.({ cancel, retry });
				registerCloudTaskRuntimeActions({
					taskId,
					actions: { cancel, retry, open: request.open },
				});
				useCloudTaskStore.getState().startTask({
					id: taskId,
					message: request.startMessage ?? "正在执行 AI 任务",
				});

				try {
					const result = await request.execute({
						signal: controller.signal,
						updateProgress: ({ progress, message }) => {
							if (operationTokenRef.current !== attemptToken) return;
							useCloudTaskStore.getState().updateProgress({
								id: taskId,
								progress,
								message,
							});
						},
					});
					if (
						controller.signal.aborted ||
						operationTokenRef.current !== attemptToken
					) {
						return null;
					}
					await request.onSuccess?.(result);
					if (
						controller.signal.aborted ||
						operationTokenRef.current !== attemptToken
					) {
						return null;
					}
					useCloudTaskStore.getState().completeTask({
						id: taskId,
						message:
							typeof request.completeMessage === "function"
								? request.completeMessage(result)
								: request.completeMessage,
						output: request.output?.(result),
					});
					registerCloudTaskRuntimeActions({
						taskId,
						actions: {
							open: request.open,
							retry,
							undo: request.onUndo
								? async () => {
										await request.onUndo?.(result);
										registerCloudTaskRuntimeActions({
											taskId,
											actions: { open: request.open, retry },
										});
									}
								: undefined,
						},
					});
					return result;
				} catch (caught) {
					if (
						controller.signal.aborted ||
						operationTokenRef.current !== attemptToken
					) {
						return null;
					}
					const message =
						caught instanceof Error ? caught.message : "AI 任务失败";
					const taskError =
						caught instanceof Error ? caught : new Error(message);
					setError(message);
					useCloudTaskStore.getState().failTask({ id: taskId, error: message });
					await request.onError?.(taskError);
					return null;
				} finally {
					if (operationTokenRef.current === attemptToken) {
						setIsRunning(false);
						activeControllerRef.current = undefined;
					}
					unregisterRuntime?.();
				}
			};

			return executeAttempt();
		},
		[]
	);

	return { isRunning, error, clearError, runTask };
}
