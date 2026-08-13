#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "../../electron/jianying-text-runtime-contract";
import { renderJianyingText } from "../../electron/jianying-text-runtime/render";

function argumentValue({
	name,
	args,
}: {
	name: string;
	args: string[];
}): string {
	const index = args.indexOf(name);
	const value = index >= 0 ? args[index + 1] : undefined;
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

async function main() {
	const args = process.argv.slice(2);
	const requestPath = argumentValue({ name: "--request", args });
	const responsePath = argumentValue({ name: "--response", args });
	const request = JSON.parse(
		await readFile(requestPath, "utf8")
	) as JianyingTextRuntimeRenderRequest;
	const response: JianyingTextRuntimeRenderResult = await renderJianyingText({
		request,
	});
	await writeFile(responsePath, `${JSON.stringify(response)}\n`, "utf8");
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.stack : String(error));
	process.exitCode = 1;
});
