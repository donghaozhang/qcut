import type { BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
	assertCapCutGuiFileIdentityUnchanged,
	captureCapCutGuiFileIdentity,
	type CapCutGuiFileIdentity,
} from "./gui-regression-file-identity.js";

export interface CapCutGuiSessionDirectoryReport {
	canonicalPath: string | null;
	identity: CapCutGuiFileIdentity | null;
	ownerUid: number | null;
	path: string;
	status: "absent" | "present";
}

interface CapCutGuiSessionDirectoryRuntime {
	lstatPath: ({ path }: { path: string }) => Promise<BigIntStats>;
	realpathPath: ({ path }: { path: string }) => Promise<string>;
}

function isMissingPathError({ error }: { error: unknown }): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

async function readDirectoryStats({
	path,
	runtime,
}: {
	path: string;
	runtime: CapCutGuiSessionDirectoryRuntime;
}): Promise<BigIntStats | null> {
	try {
		return await runtime.lstatPath({ path });
	} catch (error) {
		if (isMissingPathError({ error })) return null;
		throw error;
	}
}

function assertRealDirectory({
	path,
	stats,
}: {
	path: string;
	stats: BigIntStats;
}): void {
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error(
			`CapCut session directory must be a real directory: ${path}`
		);
	}
}

export async function inspectCanonicalSessionDirectoryWithRuntime({
	allowMissing,
	path,
	runtime,
}: {
	allowMissing: boolean;
	path: string;
	runtime: CapCutGuiSessionDirectoryRuntime;
}): Promise<CapCutGuiSessionDirectoryReport> {
	const requestedPath = resolve(path);
	const beforeStats = await readDirectoryStats({
		path: requestedPath,
		runtime,
	});
	if (!beforeStats) {
		const afterStats = await readDirectoryStats({
			path: requestedPath,
			runtime,
		});
		if (afterStats) {
			throw new Error("CapCut session directory appeared during inspection.");
		}
		if (!allowMissing) throw new Error(`ENOENT: ${requestedPath}`);
		return {
			canonicalPath: null,
			identity: null,
			ownerUid: null,
			path: requestedPath,
			status: "absent",
		};
	}
	assertRealDirectory({ path: requestedPath, stats: beforeStats });
	const beforeIdentity = captureCapCutGuiFileIdentity({ stats: beforeStats });
	const canonicalPath = await runtime.realpathPath({ path: requestedPath });
	const afterStats = await readDirectoryStats({ path: requestedPath, runtime });
	if (!afterStats) {
		throw new Error("CapCut session directory disappeared during inspection.");
	}
	assertRealDirectory({ path: requestedPath, stats: afterStats });
	const canonicalPathAfter = await runtime.realpathPath({
		path: requestedPath,
	});
	const identity = captureCapCutGuiFileIdentity({ stats: afterStats });
	assertCapCutGuiFileIdentityUnchanged({
		after: identity,
		before: beforeIdentity,
		label: "CapCut session directory",
	});
	if (canonicalPath !== requestedPath || canonicalPathAfter !== requestedPath) {
		throw new Error(
			`CapCut session directory must not traverse symbolic links: ${requestedPath}`
		);
	}
	return {
		canonicalPath,
		identity,
		ownerUid: identity.ownerUid,
		path: requestedPath,
		status: "present",
	};
}

export function inspectCanonicalSessionDirectory({
	allowMissing,
	path,
}: {
	allowMissing: boolean;
	path: string;
}): Promise<CapCutGuiSessionDirectoryReport> {
	return inspectCanonicalSessionDirectoryWithRuntime({
		allowMissing,
		path,
		runtime: {
			lstatPath: async ({ path: targetPath }) =>
				lstat(targetPath, { bigint: true }),
			realpathPath: async ({ path: targetPath }) => realpath(targetPath),
		},
	});
}
