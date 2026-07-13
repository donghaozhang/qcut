/**
 * React hook for AI Content Pipeline integration
 *
 * Provides a clean interface for generating AI content (images, videos, avatars)
 * from React components with progress tracking and cancellation support.
 *
 * @module hooks/use-ai-pipeline
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { platform } from "@qcut/platform-core";
import type {
	AIPipelineProgress,
	AIPipelineGenerateOptions,
	AIPipelineResult,
	AIPipelineStatus,
} from "@/types/electron";
import { estimatePipelineTaskCostUsd } from "@/lib/cloud-tasks/task-costs";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import {
	type CloudTask,
	type CloudTaskKind,
	useCloudTaskStore,
} from "@/stores/cloud-task-store";
import { useMediaStore } from "@/stores/media/media-store";

// ============================================================================
// Types
// ============================================================================

interface UseAIPipelineOptions {
	/** Callback for progress updates */
	onProgress?: (progress: AIPipelineProgress) => void;
	/** Callback when generation completes successfully */
	onComplete?: (result: AIPipelineResult) => void;
	/** Callback when generation fails */
	onError?: (error: string) => void;
	/** Keep one persistent task per pipeline call. Disable when a parent task owns the workflow. */
	persistTasks?: boolean;
}

interface UseAIPipelineReturn {
	/** Whether the AI pipeline binary is available */
	isAvailable: boolean;
	/** Whether availability has been checked */
	isChecked: boolean;
	/** Whether a generation is currently in progress */
	isGenerating: boolean;
	/** Current progress state during generation */
	progress: AIPipelineProgress | null;
	/** Last result from generation */
	result: AIPipelineResult | null;
	/** Error message if any */
	error: string | null;
	/** Detailed pipeline status */
	status: AIPipelineStatus | null;
	/** Generate content (image, video, avatar) */
	generate: (options: AIPipelineGenerateOptions) => Promise<AIPipelineResult>;
	/** List available models */
	listModels: () => Promise<AIPipelineResult>;
	/** Estimate cost for generation */
	estimateCost: (
		model: string,
		duration?: number,
		resolution?: string
	) => Promise<AIPipelineResult>;
	/** Cancel ongoing generation */
	cancel: () => Promise<void>;
	/** Persistent task currently owned by this hook. */
	taskId: string | null;
	/** Retry the current or specified persisted task. */
	retry: (taskId?: string) => Promise<AIPipelineResult>;
	/** Check and refresh availability status */
	checkAvailability: () => Promise<boolean>;
	/** Refresh environment detection (after binary installation) */
	refreshEnvironment: () => Promise<AIPipelineStatus | null>;
}

const PIPELINE_COMMANDS = new Set<AIPipelineGenerateOptions["command"]>([
	"generate-image",
	"create-video",
	"generate-avatar",
	"generate-speech",
	"list-models",
	"estimate-cost",
	"run-pipeline",
]);

function cloudTaskKind({
	command,
}: {
	command: AIPipelineGenerateOptions["command"];
}): CloudTaskKind {
	return command === "generate-avatar" || command === "generate-speech"
		? "avatar"
		: "generation";
}

function cloudTaskLabel({
	command,
}: {
	command: AIPipelineGenerateOptions["command"];
}): string {
	const labels: Record<AIPipelineGenerateOptions["command"], string> = {
		"generate-image": "AI 图片生成",
		"create-video": "AI 视频生成",
		"generate-avatar": "数字人生成",
		"generate-speech": "语音生成",
		"list-models": "模型发现",
		"estimate-cost": "费用估算",
		"run-pipeline": "AI 内容流水线",
	};
	return labels[command];
}

function pipelineOptionsFromTask({
	task,
}: {
	task: CloudTask;
}): AIPipelineGenerateOptions | null {
	const command = task.payload.command;
	const args = task.payload.args;
	if (
		typeof command !== "string" ||
		!PIPELINE_COMMANDS.has(command as AIPipelineGenerateOptions["command"]) ||
		typeof args !== "object" ||
		args === null ||
		Array.isArray(args)
	) {
		return null;
	}
	const primitiveArgs: AIPipelineGenerateOptions["args"] = {};
	for (const [key, value] of Object.entries(args)) {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			primitiveArgs[key] = value;
		}
	}
	return {
		command: command as AIPipelineGenerateOptions["command"],
		args: primitiveArgs,
		projectId:
			typeof task.payload.projectId === "string"
				? task.payload.projectId
				: undefined,
		autoImport:
			typeof task.payload.autoImport === "boolean"
				? task.payload.autoImport
				: undefined,
	};
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for integrating with the AI Content Pipeline
 *
 * @example
 * ```tsx
 * const { isAvailable, generate, progress, cancel } = useAIPipeline({
 *   onProgress: (p) => console.log(`${p.percent}%: ${p.message}`),
 *   onComplete: (result) => console.log('Generated:', result.outputPath),
 *   onError: (error) => console.error('Failed:', error),
 * });
 *
 * const handleGenerate = async () => {
 *   const result = await generate({
 *     command: 'create-video',
 *     args: { prompt: 'A sunset over the ocean', model: 'sora-2' },
 *   });
 * };
 * ```
 */
export function useAIPipeline(
	options: UseAIPipelineOptions = {}
): UseAIPipelineReturn {
	const [isAvailable, setIsAvailable] = useState(false);
	const [isChecked, setIsChecked] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [progress, setProgress] = useState<AIPipelineProgress | null>(null);
	const [result, setResult] = useState<AIPipelineResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<AIPipelineStatus | null>(null);
	const [taskId, setTaskId] = useState<string | null>(null);

	const sessionIdRef = useRef<string | null>(null);
	const taskIdRef = useRef<string | null>(null);
	const lastOptionsRef = useRef<AIPipelineGenerateOptions | null>(null);
	const { onProgress, onComplete, onError, persistTasks = true } = options;

	// Set up progress listener
	useEffect(() => {
		if (!platform().aiPipeline?.onProgress) return;

		const cleanup = platform().aiPipeline.onProgress((progressData) => {
			// Only update if this is our session or no session filter
			if (
				!sessionIdRef.current ||
				progressData.sessionId === sessionIdRef.current
			) {
				setProgress(progressData);
				if (persistTasks && taskIdRef.current) {
					useCloudTaskStore.getState().updateProgress({
						id: taskIdRef.current,
						progress: progressData.percent,
						message: progressData.message,
					});
				}
				onProgress?.(progressData);
			}
		});

		return cleanup;
	}, [onProgress, persistTasks]);

	/**
	 * Check if AI pipeline is available
	 */
	const checkAvailability = useCallback(async (): Promise<boolean> => {
		try {
			const response = await platform().aiPipeline?.check();
			const available = response?.available ?? false;
			setIsAvailable(available);
			setIsChecked(true);

			if (!available && response?.error) {
				setError(response.error);
			} else {
				setError(null);
			}

			// Also fetch detailed status
			const statusResponse = await platform().aiPipeline?.status();
			if (statusResponse) {
				setStatus(statusResponse);
			}

			return available;
		} catch {
			setIsAvailable(false);
			setIsChecked(true);
			setError("Failed to check AI pipeline availability");
			return false;
		}
	}, []);

	// Check availability on mount
	useEffect(() => {
		checkAvailability();
	}, [checkAvailability]);

	/**
	 * Refresh environment detection
	 */
	const refreshEnvironment =
		useCallback(async (): Promise<AIPipelineStatus | null> => {
			try {
				const response = await platform().aiPipeline?.refresh();
				if (response) {
					setStatus(response);
					setIsAvailable(response.available);
					if (!response.available && response.error) {
						setError(response.error);
					} else {
						setError(null);
					}
				}
				return response ?? null;
			} catch {
				setError("Failed to refresh AI pipeline environment");
				return null;
			}
		}, []);

	const cancelSession = useCallback(
		async ({
			sessionId,
			currentTaskId,
			persistTask,
		}: {
			sessionId: string;
			currentTaskId?: string;
			persistTask: boolean;
		}): Promise<void> => {
			try {
				await platform().aiPipeline?.cancel(sessionId);
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "取消生成失败";
				setError(errorMessage);
			} finally {
				if (persistTask && currentTaskId) {
					useCloudTaskStore.getState().cancelTask({ id: currentTaskId });
				}
				if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
				setIsGenerating(false);
				setProgress(null);
			}
		},
		[]
	);

	/**
	 * Generate AI content
	 */
	const runGeneration = useCallback(
		async ({
			generateOptions,
			existingTaskId,
		}: {
			generateOptions: AIPipelineGenerateOptions;
			existingTaskId?: string;
		}): Promise<AIPipelineResult> => {
			const cloudTasks = useCloudTaskStore.getState();
			const persistCurrentTask = persistTasks || existingTaskId !== undefined;
			const currentTaskId = persistCurrentTask
				? (existingTaskId ??
					cloudTasks.createTask({
						kind: cloudTaskKind({ command: generateOptions.command }),
						label: cloudTaskLabel({ command: generateOptions.command }),
						payload: {
							command: generateOptions.command,
							args: generateOptions.args,
							projectId: generateOptions.projectId,
							autoImport: generateOptions.autoImport,
						},
						estimatedCostUsd: estimatePipelineTaskCostUsd({
							options: generateOptions,
						}),
					}))
				: undefined;
			taskIdRef.current = currentTaskId ?? null;
			setTaskId(currentTaskId ?? null);
			lastOptionsRef.current = generateOptions;
			if (!isAvailable) {
				const unavailableResult: AIPipelineResult = {
					success: false,
					error: "AI 流水线不可用",
				};
				if (currentTaskId) {
					cloudTasks.failTask({
						id: currentTaskId,
						error: unavailableResult.error ?? "AI 流水线不可用",
					});
				}
				setResult(unavailableResult);
				onError?.(unavailableResult.error!);
				return unavailableResult;
			}

			setIsGenerating(true);
			setProgress({
				stage: "starting",
				percent: 0,
				message: "正在初始化...",
			});
			setError(null);
			setResult(null);

			// Generate session ID for cancellation
			const sessionId =
				generateOptions.sessionId ||
				`ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			sessionIdRef.current = sessionId;
			if (currentTaskId) {
				cloudTasks.startTask({
					id: currentTaskId,
					sessionId,
					message: "正在初始化...",
				});
			}
			const retryCurrent = () => {
				if (!currentTaskId) return;
				const current = useCloudTaskStore
					.getState()
					.tasks.find((candidate) => candidate.id === currentTaskId);
				if (current?.status !== "queued") {
					useCloudTaskStore.getState().retryTask({ id: currentTaskId });
				}
				return runGeneration({
					generateOptions,
					existingTaskId: currentTaskId,
				});
			};
			if (currentTaskId) {
				registerCloudTaskRuntimeActions({
					taskId: currentTaskId,
					actions: {
						cancel: () =>
							cancelSession({
								sessionId,
								currentTaskId,
								persistTask: true,
							}),
						retry: retryCurrent,
					},
				});
			}

			try {
				const generateResult = await platform().aiPipeline?.generate({
					...generateOptions,
					sessionId,
				});

				if (!generateResult) {
					throw new Error("No response from AI pipeline");
				}

				setResult(generateResult);

				if (generateResult.success) {
					const taskStatus = currentTaskId
						? useCloudTaskStore
								.getState()
								.tasks.find((candidate) => candidate.id === currentTaskId)
								?.status
						: undefined;
					if (currentTaskId && taskStatus !== "canceled") {
						useCloudTaskStore.getState().completeTask({
							id: currentTaskId,
							message: "生成完成",
							actualCostUsd: generateResult.cost,
							output: {
								outputPath: generateResult.outputPath,
								outputPaths: generateResult.outputPaths,
								mediaId: generateResult.mediaId,
								importedPath: generateResult.importedPath,
							},
						});
					}
					const outputPath =
						generateResult.importedPath ?? generateResult.outputPath;
					const canUndoImport = Boolean(
						generateOptions.autoImport &&
							generateOptions.projectId &&
							generateResult.mediaId
					);
					if (currentTaskId)
						registerCloudTaskRuntimeActions({
							taskId: currentTaskId,
							actions: {
								retry: retryCurrent,
								open: outputPath
									? () => platform().shell?.showItemInFolder(outputPath)
									: undefined,
								undo: canUndoImport
									? async () => {
											await useMediaStore
												.getState()
												.removeMediaItem(
													generateOptions.projectId!,
													generateResult.mediaId!
												);
											useCloudTaskStore.getState().completeTask({
												id: currentTaskId,
												message: "已撤销本次素材导入",
												output: {
													outputPath: generateResult.outputPath,
													undone: true,
												},
											});
											registerCloudTaskRuntimeActions({
												taskId: currentTaskId,
												actions: {
													retry: retryCurrent,
													open: outputPath
														? () =>
																platform().shell?.showItemInFolder(outputPath)
														: undefined,
												},
											});
										}
									: undefined,
							},
						});
					onComplete?.(generateResult);
				} else if (generateResult.error) {
					if (currentTaskId) {
						useCloudTaskStore.getState().failTask({
							id: currentTaskId,
							error: generateResult.error,
						});
					}
					setError(generateResult.error);
					onError?.(generateResult.error);
				}

				return generateResult;
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				const errorResult: AIPipelineResult = {
					success: false,
					error: errorMessage,
				};
				setError(errorMessage);
				setResult(errorResult);
				if (currentTaskId) {
					useCloudTaskStore.getState().failTask({
						id: currentTaskId,
						error: errorMessage,
					});
				}
				onError?.(errorMessage);
				return errorResult;
			} finally {
				setIsGenerating(false);
				setProgress(null);
				if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
			}
		},
		[cancelSession, isAvailable, onComplete, onError, persistTasks]
	);

	const generate = useCallback(
		(generateOptions: AIPipelineGenerateOptions) =>
			runGeneration({ generateOptions }),
		[runGeneration]
	);

	const retry = useCallback(
		async (retryTaskId?: string): Promise<AIPipelineResult> => {
			const requestedTaskId = retryTaskId ?? taskIdRef.current;
			const task = useCloudTaskStore
				.getState()
				.tasks.find((candidate) => candidate.id === requestedTaskId);
			const retryOptions = retryTaskId
				? task
					? pipelineOptionsFromTask({ task })
					: null
				: (lastOptionsRef.current ??
					(task ? pipelineOptionsFromTask({ task }) : null));
			if (!requestedTaskId || !retryOptions) {
				return { success: false, error: "This task cannot be retried" };
			}
			if (task?.status !== "queued") {
				useCloudTaskStore.getState().retryTask({ id: requestedTaskId });
			}
			return runGeneration({
				generateOptions: retryOptions,
				existingTaskId: requestedTaskId,
			});
		},
		[runGeneration]
	);

	/**
	 * List available models
	 */
	const listModels = useCallback(async (): Promise<AIPipelineResult> => {
		if (!isAvailable) {
			return { success: false, error: "AI Pipeline not available" };
		}
		try {
			const response = await platform().aiPipeline?.listModels();
			if (!response || Array.isArray(response)) {
				return { success: false, error: "API not available" };
			}
			return response as AIPipelineResult;
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to list models";
			return { success: false, error: errorMessage };
		}
	}, [isAvailable]);

	/**
	 * Estimate generation cost
	 */
	const estimateCost = useCallback(
		async (
			model: string,
			duration?: number,
			resolution?: string
		): Promise<AIPipelineResult> => {
			if (!isAvailable) {
				return { success: false, error: "AI Pipeline not available" };
			}
			try {
				const response = await platform().aiPipeline?.estimateCost({
					model,
					duration,
					resolution,
				});
				return (
					(response as AIPipelineResult) ?? {
						success: false,
						error: "API not available",
					}
				);
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Failed to estimate cost";
				return { success: false, error: errorMessage };
			}
		},
		[isAvailable]
	);

	/**
	 * Cancel ongoing generation
	 */
	const cancel = useCallback(async (): Promise<void> => {
		if (!sessionIdRef.current) return;
		await cancelSession({
			sessionId: sessionIdRef.current,
			currentTaskId: taskIdRef.current ?? undefined,
			persistTask: persistTasks,
		});
	}, [cancelSession, persistTasks]);

	return {
		isAvailable,
		isChecked,
		isGenerating,
		progress,
		result,
		error,
		status,
		generate,
		listModels,
		estimateCost,
		cancel,
		taskId,
		retry,
		checkAvailability,
		refreshEnvironment,
	};
}

export default useAIPipeline;
