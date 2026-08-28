import type { PersonCutoutModelRoute } from "./mask-cache.js";

interface RouteRuntime {
	modelRoute: PersonCutoutModelRoute;
}

export async function executePersonCutoutRouteWithFallback<
	Runtime extends RouteRuntime,
	Result,
>({
	execute,
	fallbackRuntimes = [],
	onFallback,
	portraitRuntime,
	selectedRuntime,
}: {
	execute: (runtime: Runtime) => Promise<Result>;
	fallbackRuntimes?: Runtime[];
	onFallback?: (event: {
		error: unknown;
		failedRuntime: Runtime;
		nextRuntime: Runtime;
	}) => void;
	portraitRuntime: Runtime;
	selectedRuntime: Runtime;
}) {
	const orderedRuntimes = [
		selectedRuntime,
		...fallbackRuntimes,
		portraitRuntime,
	].filter((runtime, index, runtimes) => runtimes.indexOf(runtime) === index);
	const executeAt = async ({
		index,
	}: {
		index: number;
	}): Promise<{
		didFallback: boolean;
		result: Result;
		runtime: Runtime;
	}> => {
		const runtime = orderedRuntimes[index];
		if (!runtime) throw new Error("人物抠像运行时链为空");
		try {
			return {
				didFallback: index > 0,
				result: await execute(runtime),
				runtime,
			};
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") throw error;
			const nextRuntime = orderedRuntimes[index + 1];
			if (!nextRuntime || runtime.modelRoute === "portrait-gru") throw error;
			onFallback?.({ error, failedRuntime: runtime, nextRuntime });
			return executeAt({ index: index + 1 });
		}
	};
	return executeAt({ index: 0 });
}
