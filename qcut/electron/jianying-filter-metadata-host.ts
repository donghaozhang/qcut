/**
 * Main-process host for the Filter Lab metadata scan. Forks a short-lived
 * Electron utility process per scan so the synchronous SQLite sweep (~1.7s
 * on a large Jianying cache) never blocks the main thread, and coalesces the
 * handler's three catalog resolvers onto one scan per reference list.
 */
import { join } from "node:path";
import {
	scanJianyingFilterMetadata,
	type JianyingFilterCategoryCatalog,
	type JianyingFilterKnownCatalog,
	type JianyingFilterMetadataScan,
} from "./jianying-filter-metadata.js";
import {
	deserializeJianyingFilterMetadataScan,
	type JianyingFilterMetadataChildMessage,
} from "./jianying-filter-metadata-transfer.js";
import type { JianyingLutReference } from "./native-pipeline/filters/filter-lab-lut.js";

const SCAN_TIMEOUT_MS = 60_000;

/** Distinguishes a hung/slow sweep from fork failures and child crashes. */
export class JianyingFilterMetadataScanTimeoutError extends Error {
	constructor() {
		super("剪映滤镜元数据扫描超时");
		this.name = "JianyingFilterMetadataScanTimeoutError";
	}
}

export function emptyJianyingFilterMetadataScan(): JianyingFilterMetadataScan {
	return {
		titles: new Map(),
		categories: { order: [], byResourceId: new Map() },
		knownCatalog: { order: [], filters: [] },
	};
}

/** The slice of Electron's UtilityProcess the host needs; narrow for tests. */
export interface JianyingFilterMetadataChild {
	postMessage(message: unknown): void;
	kill(): boolean;
	once(event: "exit", listener: (code: number) => void): unknown;
	on(
		event: "message",
		listener: (message: JianyingFilterMetadataChildMessage) => void
	): unknown;
}

async function forkMetadataChild(): Promise<JianyingFilterMetadataChild> {
	// Imported lazily so consumers that inject their own resolvers (tests,
	// non-Electron tooling) never touch the electron binding.
	const { utilityProcess } = await import("electron");
	return utilityProcess.fork(
		join(__dirname, "jianying-filter-metadata-process.js")
	);
}

/**
 * Runs one metadata scan in a dedicated utility process. The child announces
 * itself with `ready` (so no request can race its listener setup), receives
 * the scan request, and is killed as soon as it answers or misbehaves.
 */
export async function runJianyingFilterMetadataScan({
	references,
	databaseRoot,
	forkChild = forkMetadataChild,
}: {
	references: JianyingLutReference[];
	databaseRoot?: string;
	forkChild?: () => Promise<JianyingFilterMetadataChild>;
}): Promise<JianyingFilterMetadataScan> {
	const child = await forkChild();
	return await new Promise((resolve, reject) => {
		let settled = false;
		const settle = (action: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				child.kill();
			} catch {
				// The child already exited on its own.
			}
			action();
		};
		const timer = setTimeout(
			() => settle(() => reject(new JianyingFilterMetadataScanTimeoutError())),
			SCAN_TIMEOUT_MS
		);
		child.once("exit", (code) =>
			settle(() =>
				reject(new Error(`剪映滤镜元数据扫描进程提前退出(code ${code})`))
			)
		);
		child.on("message", (message) => {
			if (message.type === "ready") {
				child.postMessage({
					type: "scan",
					references,
					...(databaseRoot ? { databaseRoot } : {}),
				});
				return;
			}
			if (message.type === "result") {
				settle(() =>
					resolve(deserializeJianyingFilterMetadataScan(message.scan))
				);
				return;
			}
			settle(() => reject(new Error(message.message)));
		});
	});
}

/**
 * Child failures degrade in two tiers. A fork error or instant crash falls
 * back to the in-process scan — one blocking sweep, no worse than the
 * pre-utility-process behaviour. A timeout means the sweep itself is proven
 * pathological (stalled volume, enormous cache), so replaying it on the main
 * thread would freeze the UI for just as long; those degrade to an empty
 * scan instead, which the handler already treats as best-effort decoration.
 */
export async function runScanWithFallback({
	references,
	runScan = runJianyingFilterMetadataScan,
	runLocalScan = scanJianyingFilterMetadata,
}: {
	references: JianyingLutReference[];
	runScan?: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterMetadataScan>;
	runLocalScan?: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterMetadataScan>;
}): Promise<JianyingFilterMetadataScan> {
	try {
		return await runScan({ references });
	} catch (error) {
		if (error instanceof JianyingFilterMetadataScanTimeoutError) {
			console.warn(
				"[FilterLab] 元数据扫描超时,降级为空目录数据以保护主进程:",
				error.message
			);
			return emptyJianyingFilterMetadataScan();
		}
		console.warn(
			"[FilterLab] 元数据扫描子进程失败,回退到主进程执行:",
			error instanceof Error ? error.message : error
		);
		return runLocalScan({ references });
	}
}

export interface JianyingFilterMetadataResolvers {
	resolveTitles: (input: {
		references: JianyingLutReference[];
	}) => Promise<Map<string, string>>;
	resolveCategories: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterCategoryCatalog>;
	resolveKnownFilters: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterKnownCatalog>;
}

/**
 * Default resolvers for the Filter Lab handler: the three catalog views come
 * from a single utility-process scan per reference list instead of three
 * separate full cache-database sweeps on the main thread. Coalescing keys on
 * the reference-array identity, which the handler shares across all three
 * calls of one catalog build.
 */
export function createJianyingFilterMetadataResolvers({
	runScan = runScanWithFallback,
}: {
	runScan?: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterMetadataScan>;
} = {}): JianyingFilterMetadataResolvers {
	const scans = new WeakMap<
		JianyingLutReference[],
		Promise<JianyingFilterMetadataScan>
	>();
	const scanFor = (references: JianyingLutReference[]) => {
		let pending = scans.get(references);
		if (!pending) {
			pending = runScan({ references });
			scans.set(references, pending);
		}
		return pending;
	};
	return {
		resolveTitles: ({ references }) =>
			scanFor(references).then(({ titles }) => titles),
		resolveCategories: ({ references }) =>
			scanFor(references).then(({ categories }) => categories),
		resolveKnownFilters: ({ references }) =>
			scanFor(references).then(({ knownCatalog }) => knownCatalog),
	};
}
