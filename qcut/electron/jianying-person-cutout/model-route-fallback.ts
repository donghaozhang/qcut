import type { PersonCutoutModelRoute } from "./mask-cache.js";

interface RouteRuntime {
	modelRoute: PersonCutoutModelRoute;
}

export async function executePersonCutoutRouteWithFallback<
	Runtime extends RouteRuntime,
	Result,
>({
	execute,
	onFallback,
	portraitRuntime,
	selectedRuntime,
}: {
	execute: (runtime: Runtime) => Promise<Result>;
	onFallback?: (error: unknown) => void;
	portraitRuntime: Runtime;
	selectedRuntime: Runtime;
}) {
	try {
		return {
			didFallback: false,
			result: await execute(selectedRuntime),
			runtime: selectedRuntime,
		};
	} catch (error) {
		if (
			selectedRuntime.modelRoute === "portrait-gru" ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw error;
		}
		onFallback?.(error);
		return {
			didFallback: true,
			result: await execute(portraitRuntime),
			runtime: portraitRuntime,
		};
	}
}
