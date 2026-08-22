import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type {
	JianyingTextAnimationLabListResult,
	JianyingTextStyleLabListResult,
} from "../../jianying-text-style-lab-contract.js";
import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "../../jianying-text-runtime-contract.js";

export interface TextLabCatalog {
	styles: JianyingTextStyleLabListResult;
	animations: JianyingTextAnimationLabListResult;
}

export type TextLabRenderer = ({
	request,
}: {
	request: JianyingTextRuntimeRenderRequest;
}) => Promise<JianyingTextRuntimeRenderResult>;

const RESULT_MARKER = "QCUT_TEXT_LAB_RESULT:";
const BUN_CHILD_SCRIPT = `
Bun.plugin({
	name: "text-lab-node-sqlite-shim",
	setup(build) {
		build.module("node:sqlite", () => {
			const { Database } = require("bun:sqlite");
			class DatabaseSync {
				constructor(path, options) {
					this.database = new Database(path, {
						readonly: Boolean(options && options.readOnly),
					});
				}
				prepare(sql) { return this.database.prepare(sql); }
				close() { this.database.close(); }
			}
			return { exports: { DatabaseSync }, loader: "object" };
		});
	},
});
const input = JSON.parse(process.env.QCUT_TEXT_LAB_CHILD_INPUT || "{}");
let result;
if (input.action === "catalog") {
	const service = await import(input.modulePath);
	result = await service.buildQCutJianyingTextLabCatalog();
} else if (input.action === "render") {
	const renderer = await import(input.modulePath);
	result = await renderer.renderJianyingText({ request: input.request });
} else {
	throw new Error("Unknown Text Lab child action.");
}
process.stdout.write("\\n${RESULT_MARKER}" + JSON.stringify(result));
`;

function isBunRuntime() {
	return Boolean((globalThis as { Bun?: unknown }).Bun);
}

async function runBunChild<TResult>({
	action,
	modulePath,
	request,
}: {
	action: "catalog" | "render";
	modulePath: string;
	request?: JianyingTextRuntimeRenderRequest;
}): Promise<TResult> {
	const { stdout } = await promisify(execFile)(
		process.execPath,
		["-e", BUN_CHILD_SCRIPT],
		{
			env: {
				...process.env,
				QCUT_TEXT_LAB_CHILD_INPUT: JSON.stringify({
					action,
					modulePath,
					...(request ? { request } : {}),
				}),
			},
			timeout: action === "render" ? 600_000 : 120_000,
			maxBuffer: 64 * 1024 * 1024,
		}
	);
	const markerIndex = stdout.lastIndexOf(RESULT_MARKER);
	if (markerIndex < 0) {
		throw new Error("Text Lab child process returned no structured result.");
	}
	return JSON.parse(
		stdout.slice(markerIndex + RESULT_MARKER.length)
	) as TResult;
}

export async function loadTextLabCatalogDefault(): Promise<TextLabCatalog> {
	if (isBunRuntime()) {
		return runBunChild<TextLabCatalog>({
			action: "catalog",
			modulePath: path.join(
				__dirname,
				"..",
				"..",
				"jianying-text-lab-service.js"
			),
		});
	}
	const service = await import("../../jianying-text-lab-service.js");
	return service.buildQCutJianyingTextLabCatalog();
}

export const renderTextLabDefault: TextLabRenderer = async ({ request }) => {
	if (isBunRuntime()) {
		return runBunChild<JianyingTextRuntimeRenderResult>({
			action: "render",
			modulePath: path.join(
				__dirname,
				"..",
				"..",
				"jianying-text-runtime",
				"render.js"
			),
			request,
		});
	}
	const renderer = await import("../../jianying-text-runtime/render.js");
	return renderer.renderJianyingText({ request });
};
