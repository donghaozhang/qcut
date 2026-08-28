import type { PersonCutoutModelRoute } from "./mask-cache.js";
import { executePersonCutoutRouteWithFallback } from "./model-route-fallback.js";

interface PersonCutoutInferenceRuntime {
	modelRoute: PersonCutoutModelRoute;
}

export async function executePersonCutoutInferencePipeline<
	Runtime extends PersonCutoutInferenceRuntime,
	InferenceResult,
	FinalResult,
>({
	executeInference,
	fallbackRuntimes = [],
	finalize,
	onFallback,
	portraitRuntime,
	selectedRuntime,
}: {
	executeInference: (runtime: Runtime) => Promise<InferenceResult>;
	fallbackRuntimes?: Runtime[];
	finalize: (input: {
		inferenceResult: InferenceResult;
		runtime: Runtime;
	}) => Promise<FinalResult>;
	onFallback?: (event: {
		error: unknown;
		failedRuntime: Runtime;
		nextRuntime: Runtime;
	}) => void;
	portraitRuntime: Runtime;
	selectedRuntime: Runtime;
}) {
	const inferenceAttempt = await executePersonCutoutRouteWithFallback({
		execute: executeInference,
		fallbackRuntimes,
		onFallback,
		portraitRuntime,
		selectedRuntime,
	});
	const finalResult = await finalize({
		inferenceResult: inferenceAttempt.result,
		runtime: inferenceAttempt.runtime,
	});
	return { finalResult, inferenceAttempt };
}
