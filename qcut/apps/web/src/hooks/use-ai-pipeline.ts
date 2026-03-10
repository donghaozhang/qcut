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
	/** Check and refresh availability status */
	checkAvailability: () => Promise<boolean>;
	/** Refresh environment detection (after binary installation) */
	refreshEnvironment: () => Promise<AIPipelineStatus | null>;
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

	const sessionIdRef = useRef<string | null>(null);
	const { onProgress, onComplete, onError } = options;

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
				onProgress?.(progressData);
			}
		});

		return cleanup;
	}, [onProgress]);

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

	/**
	 * Generate AI content
	 */
	const generate = useCallback(
		async (
			generateOptions: AIPipelineGenerateOptions
		): Promise<AIPipelineResult> => {
			if (!isAvailable) {
				const unavailableResult: AIPipelineResult = {
					success: false,
					error: "AI Pipeline not available",
				};
				setResult(unavailableResult);
				onError?.(unavailableResult.error!);
				return unavailableResult;
			}

			setIsGenerating(true);
			setProgress({
				stage: "starting",
				percent: 0,
				message: "Initializing...",
			});
			setError(null);
			setResult(null);

			// Generate session ID for cancellation
			const sessionId =
				generateOptions.sessionId ||
				`ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			sessionIdRef.current = sessionId;

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
					onComplete?.(generateResult);
				} else if (generateResult.error) {
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
				onError?.(errorMessage);
				return errorResult;
			} finally {
				setIsGenerating(false);
				setProgress(null);
				sessionIdRef.current = null;
			}
		},
		[isAvailable, onComplete, onError]
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
		try {
			await platform().aiPipeline?.cancel(sessionIdRef.current);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to cancel generation";
			setError(errorMessage);
		} finally {
			sessionIdRef.current = null;
			setIsGenerating(false);
			setProgress(null);
		}
	}, []);

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
		checkAvailability,
		refreshEnvironment,
	};
}

export default useAIPipeline;
