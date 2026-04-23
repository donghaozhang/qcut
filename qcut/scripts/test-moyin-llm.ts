/**
 * Standalone smoke test for `electron/moyin-llm.ts`.
 *
 * Exercises the actual shipped code path used by the Electron IPC handler
 * (distinct from the CLI handler in `cli-handlers-moyin.ts`). Run this when
 * you want to confirm the Moyin IPC layer works without launching Electron.
 *
 * Usage:  bun run scripts/test-moyin-llm.ts [--model gmi-glm-5.1]
 */

import { callLLM, resolveLlmProvider } from "../dist/electron/moyin-llm.js";
import {
	loadEnvFile,
	getKey,
} from "../dist/electron/native-pipeline/infra/key-manager.js";
import { setSessionTokenProvider } from "../dist/electron/native-pipeline/infra/proxy-client.js";

loadEnvFile();
setSessionTokenProvider(async () => getKey("QCUT_AUTH_TOKEN") ?? "");

const modelArg = process.argv.indexOf("--model");
const modelValue = modelArg !== -1 ? process.argv[modelArg + 1] : undefined;
if (modelArg !== -1 && (!modelValue || modelValue.startsWith("-"))) {
	console.error("Error: --model flag requires a non-empty value");
	process.exit(1);
}
const model = modelValue ?? "gmi-glm-5.1";

async function main(): Promise<void> {
	console.log(
		`resolveLlmProvider(${JSON.stringify(model)}) =`,
		resolveLlmProvider(model)
	);

	const start = Date.now();
	const reply = await callLLM(
		"You are a terse assistant. Reply with a single short sentence.",
		"Say hello.",
		{ model, maxTokens: 512 }
	);
	const duration = ((Date.now() - start) / 1000).toFixed(2);
	console.log(`callLLM OK (${duration}s):`);
	console.log(`  ${reply.slice(0, 200)}`);
}

main().catch((err) => {
	console.error(
		"callLLM FAILED:",
		err instanceof Error ? err.message : String(err)
	);
	process.exit(1);
});
