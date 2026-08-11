/**
 * Utility-process entry point for the Filter Lab metadata scan. The
 * synchronous SQLite sweep over the Jianying cache databases (~seconds on a
 * large cache) runs here so the Electron main thread stays responsive; the
 * main-process side lives in jianying-filter-metadata-host.ts.
 */
import { scanJianyingFilterMetadata } from "./jianying-filter-metadata.js";
import {
	serializeJianyingFilterMetadataScan,
	type JianyingFilterMetadataScanRequest,
} from "./jianying-filter-metadata-transfer.js";

// Electron augments `process` with `parentPort` inside a utility process,
// but the base Node.js types don't include it.
const parentPort = (
	process as unknown as {
		parentPort?: import("node:worker_threads").MessagePort;
	}
).parentPort;

if (!parentPort) {
	console.error(
		"[JianyingFilterMetadata] No parentPort — must run as a utility process"
	);
	process.exit(1);
}

parentPort.on(
	"message",
	async (
		event:
			| { data?: JianyingFilterMetadataScanRequest }
			| JianyingFilterMetadataScanRequest
	) => {
		const request =
			(event as { data?: JianyingFilterMetadataScanRequest }).data ??
			(event as JianyingFilterMetadataScanRequest);
		if (request?.type !== "scan") return;
		try {
			const scan = await scanJianyingFilterMetadata({
				references: request.references,
				...(request.databaseRoot ? { databaseRoot: request.databaseRoot } : {}),
			});
			parentPort.postMessage({
				type: "result",
				scan: serializeJianyingFilterMetadataScan(scan),
			});
		} catch (error) {
			parentPort.postMessage({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
);

parentPort.postMessage({ type: "ready" });
