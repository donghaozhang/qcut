import { setTimeout as delay } from "node:timers/promises";
import { runComposeWorkerOnce } from "../packages/license-server/src/compose/worker";
import { createOpenRouterComposeProvider } from "../electron/native-pipeline/compose/providers/openrouter-compose-provider";
import {
	validateComposePatch,
	hasComposeValidationErrors,
} from "../electron/native-pipeline/compose/compose-protocol";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

async function work(): Promise<void> {
	controller.signal.throwIfAborted();
	const result = await runComposeWorkerOnce({
		signal: controller.signal,
		plan: async ({ snapshot, intent, signal }) => {
			const provider = createOpenRouterComposeProvider({
				fetchImpl: fetch,
				apiKey: process.env.OPENROUTER_API_KEY,
				model: process.env.QCUT_COMPOSE_MODEL ?? "google/gemini-2.5-flash",
			});
			const job = await provider.createJob({ snapshot, intent });
			const completed = await provider.pollJob({
				job,
				snapshot,
				intent,
				signal,
			});
			if (completed.status !== "completed")
				throw new Error("Compose planning failed.");
			const patch = await provider.downloadPatch({ job: completed });
			if (
				hasComposeValidationErrors({
					issues: validateComposePatch({ snapshot, patch }),
				})
			)
				throw new Error("Invalid Compose patch.");
			return { operations: patch.operations };
		},
	});
	if (result) console.log(JSON.stringify(result));
	await delay(result ? 100 : 2000, undefined, { signal: controller.signal });
	return work();
}

if (import.meta.main) {
	if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY)
		throw new Error(
			"Compose worker requires DATABASE_URL and OPENROUTER_API_KEY."
		);
	try {
		await work();
	} catch (error) {
		if (!controller.signal.aborted) throw error;
	}
}
