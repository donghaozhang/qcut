// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJianyingFilterPackage } from "../jianying-filter-download.js";
import type { JianyingKnownFilter } from "../jianying-filter-metadata.js";

let workspace = "";
let managedRoot = "";

/**
 * Builds a real zip so the safety check parses real archive bytes. jszip, not
 * a spawned `zip`: the CLI does not exist on Windows CI runners, and STORE
 * compression keeps the byte layout amenable to the traversal test's
 * same-length name rewrite.
 */
async function buildZip({
	entries,
}: {
	entries: { name: string; body: string }[];
}): Promise<Buffer> {
	const zip = new JSZip();
	for (const entry of entries) {
		zip.file(entry.name, entry.body);
	}
	return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

function filterFor({
	data,
	resourceId = "7127664822921022734",
	version,
}: {
	data: Buffer;
	resourceId?: string;
	version?: string;
}): JianyingKnownFilter {
	return {
		resourceId,
		title: "蓝调",
		categories: ["风景"],
		version: version ?? createHash("md5").update(data).digest("hex"),
		packageUrls: ["https://example.invalid/package.zip"],
	};
}

function respondWith({ data }: { data: Buffer }) {
	return vi.fn(async () => ({
		ok: true,
		status: 200,
		headers: new Headers({ "content-length": String(data.byteLength) }),
		// Buffers can be views into a shared pool, so slice by this view's own
		// range — `.buffer` alone would hand back unrelated bytes.
		arrayBuffer: async () =>
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
	})) as unknown as typeof fetch;
}

describe("Jianying filter package download", () => {
	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), "qcut-filter-download-"));
		managedRoot = join(workspace, "managed");
	});

	afterEach(async () => {
		vi.unstubAllGlobals();
		await rm(workspace, { recursive: true, force: true });
	});

	it("unpacks a verified package into the version directory discovery scans", async () => {
		const data = await buildZip({
			entries: [{ name: "filter.cube.vf", body: "cube-bytes" }],
		});
		const filter = filterFor({ data });
		vi.stubGlobal("fetch", respondWith({ data }));

		const result = await downloadJianyingFilterPackage({
			filter,
			managedRoot,
		});

		// <root>/<resourceId>/<version> is exactly the layout
		// listJianyingLutReferences walks.
		expect(result.packagePath).toBe(
			join(managedRoot, filter.resourceId, filter.version ?? "")
		);
		await expect(
			readFile(join(result.packagePath, "filter.cube.vf"), "utf8")
		).resolves.toBe("cube-bytes");
		// The staging directory must not survive a success.
		await expect(
			readFile(join(`${result.packagePath}.downloading`, "filter.cube.vf"))
		).rejects.toThrow();
	});

	it("refuses a package whose bytes do not match the catalog hash", async () => {
		const data = await buildZip({
			entries: [{ name: "filter.cube.vf", body: "cube-bytes" }],
		});
		const filter = filterFor({ data, version: "0".repeat(32) });
		vi.stubGlobal("fetch", respondWith({ data }));

		await expect(
			downloadJianyingFilterPackage({ filter, managedRoot })
		).rejects.toThrow("滤镜包校验失败");
		// A failed verification must leave nothing behind for discovery.
		await expect(
			readFile(join(managedRoot, filter.resourceId, "0".repeat(32)))
		).rejects.toThrow();
	});

	it("refuses a package containing a path traversal entry", async () => {
		const data = await buildZip({
			entries: [{ name: "filter.cube.vf", body: "cube-bytes" }],
		});
		// Rewrite the stored name to escape the destination directory. The
		// replacement is the same length so the zip's offsets stay valid and the
		// entry really is listed rather than rejected as a corrupt archive.
		const poisoned = Buffer.from(
			data.toString("binary").replaceAll("filter.cube.vf", "../escaped.vff"),
			"binary"
		);
		const filter = filterFor({ data: poisoned });
		vi.stubGlobal("fetch", respondWith({ data: poisoned }));

		await expect(
			downloadJianyingFilterPackage({ filter, managedRoot })
		).rejects.toThrow("不安全路径");
		await expect(readFile(join(workspace, "escaped.vf"))).rejects.toThrow();
	});

	it("refuses to download without a version hash to verify against", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const filter: JianyingKnownFilter = {
			resourceId: "7127664822921022734",
			title: "蓝调",
			categories: ["风景"],
			packageUrls: ["https://example.invalid/package.zip"],
		};

		await expect(
			downloadJianyingFilterPackage({ filter, managedRoot })
		).rejects.toThrow("缺少版本哈希");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports a missing managed root instead of writing to Jianying's cache", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const filter = filterFor({ data: Buffer.from("x") });

		await expect(
			downloadJianyingFilterPackage({ filter, managedRoot: null })
		).rejects.toThrow("仅在 QCut 桌面版中可用");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
