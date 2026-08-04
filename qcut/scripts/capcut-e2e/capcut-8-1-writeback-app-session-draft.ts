import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { CapCut81WritebackAppReceiptPhase } from "./capcut-8-1-writeback-app-receipt-contract.js";
import {
	hasControlledSentinel,
	isJsonRecord,
} from "./capcut-8-1-writeback-verification-fixture.js";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";

const MAXIMUM_ACTIVE_MIRROR_BYTES = 256 * 1024 * 1024;

function resolveActiveMirrorPath({
	draftDirectory,
	relativePath,
}: {
	draftDirectory: string;
	relativePath: string;
}): string {
	const normalizedPath = normalize(relativePath);
	if (
		relativePath.length === 0 ||
		relativePath.includes("\0") ||
		isAbsolute(relativePath) ||
		normalizedPath !== relativePath ||
		normalizedPath === ".." ||
		normalizedPath.startsWith(`..${sep}`)
	) {
		throw new Error(
			"CapCut writeback active mirror path must stay inside the draft."
		);
	}
	return join(draftDirectory, normalizedPath);
}

export interface CapCut81WritebackDraftDirectoryBinding {
	canonicalPath: string;
	device: string;
	inode: string;
}

export async function captureCapCut81WritebackDraftDirectoryBinding({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<CapCut81WritebackDraftDirectoryBinding> {
	if (!isAbsolute(draftDirectory)) {
		throw new Error("CapCut writeback app draft path must be absolute.");
	}
	const requestedPath = resolve(draftDirectory);
	const [canonicalPath, stats] = await Promise.all([
		realpath(requestedPath),
		lstat(requestedPath, { bigint: true }),
	]);
	if (
		canonicalPath !== requestedPath ||
		stats.isSymbolicLink() ||
		!stats.isDirectory()
	) {
		throw new Error(
			"CapCut writeback app draft must be a canonical directory without symbolic links."
		);
	}
	return {
		canonicalPath,
		device: stats.dev.toString(),
		inode: stats.ino.toString(),
	};
}

export async function assertCapCut81WritebackDraftDirectoryBinding({
	binding,
}: {
	binding: CapCut81WritebackDraftDirectoryBinding;
}): Promise<void> {
	const current = await captureCapCut81WritebackDraftDirectoryBinding({
		draftDirectory: binding.canonicalPath,
	});
	if (
		current.canonicalPath !== binding.canonicalPath ||
		current.device !== binding.device ||
		current.inode !== binding.inode
	) {
		throw new Error("CapCut writeback app draft directory identity changed.");
	}
}

export function assertDraftBelongsToDedicatedStore({
	dedicatedTestHomeDirectory,
	draftDirectory,
}: {
	dedicatedTestHomeDirectory: string;
	draftDirectory: string;
}): void {
	const storeDirectory = join(
		dedicatedTestHomeDirectory,
		"Movies",
		"CapCut",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
	const pathFromStore = relative(storeDirectory, draftDirectory);
	if (
		pathFromStore.length === 0 ||
		pathFromStore.startsWith("..") ||
		isAbsolute(pathFromStore) ||
		pathFromStore.includes("/")
	) {
		throw new Error(
			"CapCut writeback app draft must be one direct child of the dedicated disposable store."
		);
	}
}

function parseMirrorJson({
	bytes,
	label,
}: {
	bytes: Buffer;
	label: string;
}): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error(`${label} must contain valid JSON.`);
	}
	if (!isJsonRecord(parsed) || !hasControlledSentinel({ content: parsed })) {
		throw new Error(
			`${label} does not preserve the controlled unknown sentinel.`
		);
	}
	return parsed;
}

export async function captureCapCut81WritebackAppPhase({
	activeMirrorRelativePaths,
	activeMirrorTemplates,
	capturedAtIso,
	draftBinding,
	phase,
}: {
	activeMirrorRelativePaths: readonly [string, string, string, string];
	activeMirrorTemplates: readonly [string, string, string, string];
	capturedAtIso: string;
	draftBinding: CapCut81WritebackDraftDirectoryBinding;
	phase: CapCut81WritebackAppReceiptPhase["phase"];
}): Promise<CapCut81WritebackAppReceiptPhase> {
	await assertCapCut81WritebackDraftDirectoryBinding({ binding: draftBinding });
	const snapshots = await Promise.all(
		activeMirrorRelativePaths.map(async (relativePath, index) => {
			const template = activeMirrorTemplates[index];
			if (template === undefined) {
				throw new Error("CapCut writeback active mirror template is missing.");
			}
			const snapshot = await readRegularFileSnapshot({
				label: `CapCut writeback ${phase} mirror ${template}`,
				maximumBytes: MAXIMUM_ACTIVE_MIRROR_BYTES,
				path: resolveActiveMirrorPath({
					draftDirectory: draftBinding.canonicalPath,
					relativePath,
				}),
			});
			parseMirrorJson({
				bytes: snapshot.bytes,
				label: `CapCut writeback ${phase} mirror ${template}`,
			});
			return {
				bytes: snapshot.bytes,
				mirror: {
					byteLength: snapshot.bytes.length,
					sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
					template,
				},
			};
		})
	);
	const first = snapshots[0];
	if (!first || snapshots.some(({ bytes }) => !bytes.equals(first.bytes))) {
		throw new Error(`CapCut writeback ${phase} active mirrors do not match.`);
	}
	const [firstMirror, secondMirror, thirdMirror, fourthMirror] = snapshots.map(
		({ mirror }) => mirror
	);
	if (!firstMirror || !secondMirror || !thirdMirror || !fourthMirror) {
		throw new Error("CapCut writeback app phase requires four active mirrors.");
	}
	return {
		activeMirrors: [firstMirror, secondMirror, thirdMirror, fourthMirror],
		capturedAtIso,
		phase,
		unknownSentinelPreserved: true,
	};
}
