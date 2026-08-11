// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createJianyingFilterMetadataResolvers,
	JianyingFilterMetadataScanTimeoutError,
	runJianyingFilterMetadataScan,
	runScanWithFallback,
	type JianyingFilterMetadataChild,
} from "../jianying-filter-metadata-host";
import {
	deserializeJianyingFilterMetadataScan,
	serializeJianyingFilterMetadataScan,
	type JianyingFilterMetadataChildMessage,
} from "../jianying-filter-metadata-transfer";
import type { JianyingFilterMetadataScan } from "../jianying-filter-metadata";
import type { JianyingLutReference } from "../native-pipeline/filters/filter-lab-lut";

function createReference({ resourceId }: { resourceId: string }) {
	return {
		lutId: `${resourceId}/v/filter.cube.vf`,
		resourceId,
		version: "aa000000000000000000000000000000",
		fileName: "filter.cube.vf",
		filePath: "/private/filter.cube.vf",
		role: "single",
		size: 16,
	} as JianyingLutReference;
}

function sampleScan(): JianyingFilterMetadataScan {
	return {
		titles: new Map([["7100000000000000001/aa", "晴空"]]),
		categories: {
			order: ["🍉夏日", "影视级"],
			byResourceId: new Map([["7100000000000000001", ["🍉夏日"]]]),
		},
		knownCatalog: {
			order: ["🍉夏日"],
			filters: [
				{
					resourceId: "7100000000000000001",
					title: "晴空",
					categories: ["🍉夏日"],
				},
			],
		},
	};
}

/** A scripted stand-in for the utility process. */
function createFakeChild({
	respond,
}: {
	respond?: (
		request: unknown,
		post: (message: JianyingFilterMetadataChildMessage) => void
	) => void;
}) {
	let onMessage: (message: JianyingFilterMetadataChildMessage) => void =
		() => {};
	let onExit: (code: number) => void = () => {};
	const child: JianyingFilterMetadataChild & {
		killed: boolean;
		emitExit: (code: number) => void;
	} = {
		killed: false,
		postMessage: (request) => {
			respond?.(request, (message) => onMessage(message));
		},
		kill: () => {
			child.killed = true;
			return true;
		},
		once: (_event, listener) => {
			onExit = listener;
			return child;
		},
		on: (_event, listener) => {
			onMessage = listener;
			// The real child announces readiness once its listener is attached.
			queueMicrotask(() => onMessage({ type: "ready" }));
			return child;
		},
		emitExit: (code: number) => onExit(code),
	};
	return child;
}

describe("jianying filter metadata transfer", () => {
	it("round-trips a scan through serialization", () => {
		const scan = sampleScan();
		const restored = deserializeJianyingFilterMetadataScan(
			serializeJianyingFilterMetadataScan(scan)
		);
		expect(restored).toEqual(scan);
		expect(restored.titles).toBeInstanceOf(Map);
		expect(restored.categories.byResourceId).toBeInstanceOf(Map);
	});
});

describe("runJianyingFilterMetadataScan", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends the scan request after ready and resolves the child's result", async () => {
		const scan = sampleScan();
		const requests: unknown[] = [];
		const child = createFakeChild({
			respond: (request, post) => {
				requests.push(request);
				post({
					type: "result",
					scan: serializeJianyingFilterMetadataScan(scan),
				});
			},
		});
		const references = [createReference({ resourceId: "7100000000000000001" })];
		const result = await runJianyingFilterMetadataScan({
			references,
			databaseRoot: "/tmp/ressdk_db",
			forkChild: async () => child,
		});
		expect(result).toEqual(scan);
		expect(requests).toEqual([
			{ type: "scan", references, databaseRoot: "/tmp/ressdk_db" },
		]);
		expect(child.killed).toBe(true);
	});

	it("rejects when the child reports an error", async () => {
		const child = createFakeChild({
			respond: (_request, post) => post({ type: "error", message: "boom" }),
		});
		await expect(
			runJianyingFilterMetadataScan({
				references: [],
				forkChild: async () => child,
			})
		).rejects.toThrow("boom");
		expect(child.killed).toBe(true);
	});

	it("rejects when the child exits before answering", async () => {
		const child = createFakeChild({});
		const pending = runJianyingFilterMetadataScan({
			references: [],
			forkChild: async () => child,
		});
		// Let the fork promise resolve and the exit listener attach first.
		await new Promise((resolve) => setTimeout(resolve, 0));
		child.emitExit(1);
		await expect(pending).rejects.toThrow("提前退出");
	});

	it("rejects when the child never answers within the timeout", async () => {
		vi.useFakeTimers();
		const child = createFakeChild({ respond: () => {} });
		const pending = runJianyingFilterMetadataScan({
			references: [],
			forkChild: async () => child,
		});
		pending.catch(() => {});
		// Let the fork promise and ready microtask settle before advancing time.
		await Promise.resolve();
		await Promise.resolve();
		vi.advanceTimersByTime(60_000);
		await expect(pending).rejects.toThrow("超时");
		expect(child.killed).toBe(true);
	});
});

describe("runScanWithFallback", () => {
	it("returns the child scan without touching the local scan", async () => {
		const scan = sampleScan();
		const runLocalScan = vi.fn();
		const result = await runScanWithFallback({
			references: [],
			runScan: async () => scan,
			runLocalScan,
		});
		expect(result).toBe(scan);
		expect(runLocalScan).not.toHaveBeenCalled();
	});

	it("degrades to an empty scan on timeout without a local retry", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const runLocalScan = vi.fn();
		const result = await runScanWithFallback({
			references: [],
			runScan: async () => {
				throw new JianyingFilterMetadataScanTimeoutError();
			},
			runLocalScan,
		});
		expect(result.titles.size).toBe(0);
		expect(result.categories.order).toEqual([]);
		expect(result.knownCatalog).toEqual({ order: [], filters: [] });
		expect(runLocalScan).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("falls back to the in-process scan on other child failures", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const scan = sampleScan();
		const runLocalScan = vi.fn(async () => scan);
		const result = await runScanWithFallback({
			references: [],
			runScan: async () => {
				throw new Error("fork failed");
			},
			runLocalScan,
		});
		expect(result).toBe(scan);
		expect(runLocalScan).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});

describe("createJianyingFilterMetadataResolvers", () => {
	it("shares one scan across the three resolvers for one reference list", async () => {
		const scan = sampleScan();
		const runScan = vi.fn(async () => scan);
		const resolvers = createJianyingFilterMetadataResolvers({ runScan });
		const references = [createReference({ resourceId: "7100000000000000001" })];
		const [titles, categories, knownCatalog] = await Promise.all([
			resolvers.resolveTitles({ references }),
			resolvers.resolveCategories({ references }),
			resolvers.resolveKnownFilters({ references }),
		]);
		expect(runScan).toHaveBeenCalledTimes(1);
		expect(titles).toBe(scan.titles);
		expect(categories).toBe(scan.categories);
		expect(knownCatalog).toBe(scan.knownCatalog);
	});

	it("scans again for a different reference list", async () => {
		const runScan = vi.fn(async () => sampleScan());
		const resolvers = createJianyingFilterMetadataResolvers({ runScan });
		await resolvers.resolveTitles({
			references: [createReference({ resourceId: "1" })],
		});
		await resolvers.resolveTitles({
			references: [createReference({ resourceId: "2" })],
		});
		expect(runScan).toHaveBeenCalledTimes(2);
	});
});
