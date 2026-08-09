import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getJianyingTransitionPreviewCacheDir } from "./preview-cache-path.js";

export const MAX_CONCURRENT_JIANYING_PREVIEW_RENDERS = 2;
const MAX_CACHE_ENTRIES = 600;
const MAX_CACHE_BYTES = 1024 * 1024 * 1024;
const MIN_VALID_PREVIEW_BYTES = 1024;
const MAX_CAPTURED_PROCESS_OUTPUT = 16 * 1024;
const DEFAULT_PREVIEW_PROCESS_TIMEOUT_MS = 60_000;

export interface PreviewCacheArtifact {
	cacheKey: string;
	cached: boolean;
}

interface PendingPreviewJob {
	run: () => Promise<PreviewCacheArtifact>;
	resolve: (artifact: PreviewCacheArtifact) => void;
	reject: (error: unknown) => void;
}

let activeRenderCount = 0;
const pendingRenderJobs: PendingPreviewJob[] = [];
const activeJobsByKey = new Map<string, Promise<PreviewCacheArtifact>>();

function appendBounded({ current, chunk }: { current: string; chunk: Buffer }) {
	const combined = current + chunk.toString();
	return combined.length <= MAX_CAPTURED_PROCESS_OUTPUT
		? combined
		: combined.slice(-MAX_CAPTURED_PROCESS_OUTPUT);
}

export function runPreviewProcess({
	command,
	args,
	timeoutMs = DEFAULT_PREVIEW_PROCESS_TIMEOUT_MS,
}: {
	command: string;
	args: string[];
	timeoutMs?: number;
}): Promise<void> {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		return Promise.reject(
			new Error("Transition preview timeout must be a positive integer.")
		);
	}
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true,
		});
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			reject(
				new Error(`Transition preview encoding timed out after ${timeoutMs}ms.`)
			);
		}, timeoutMs);
		timer.unref();
		const settle = ({ error }: { error?: Error }): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = appendBounded({ current: stderr, chunk });
		});
		child.on("error", (error) => settle({ error }));
		child.on("close", (code) => {
			if (code === 0) {
				settle({});
				return;
			}
			settle({
				error: new Error(
					`Transition preview encoding failed (${code ?? "unknown"}): ${stderr.trim()}`
				),
			});
		});
	});
}

export function isValidPreviewFile({
	filePath,
}: {
	filePath: string;
}): boolean {
	try {
		const file = fs.statSync(filePath);
		return file.isFile() && file.size >= MIN_VALID_PREVIEW_BYTES;
	} catch {
		return false;
	}
}

function startNextPreviewJob(): void {
	if (activeRenderCount >= MAX_CONCURRENT_JIANYING_PREVIEW_RENDERS) return;
	const pending = pendingRenderJobs.shift();
	if (!pending) return;
	activeRenderCount++;
	void pending
		.run()
		.then(pending.resolve, pending.reject)
		.finally(() => {
			activeRenderCount--;
			startNextPreviewJob();
		});
	startNextPreviewJob();
}

export function enqueueJianyingPreviewRender({
	cacheKey,
	run,
}: {
	cacheKey: string;
	run: () => Promise<PreviewCacheArtifact>;
}): Promise<PreviewCacheArtifact> {
	const activeJob = activeJobsByKey.get(cacheKey);
	if (activeJob) return activeJob;
	const job = new Promise<PreviewCacheArtifact>((resolve, reject) => {
		pendingRenderJobs.push({ run, resolve, reject });
		startNextPreviewJob();
	}).finally(() => activeJobsByKey.delete(cacheKey));
	activeJobsByKey.set(cacheKey, job);
	return job;
}

export async function cleanupJianyingPreviewCache({
	keepPath,
}: {
	keepPath: string;
}): Promise<void> {
	const cacheDir = getJianyingTransitionPreviewCacheDir();
	let filenames: string[];
	try {
		filenames = await fs.promises.readdir(cacheDir);
	} catch {
		return;
	}
	const entries = (
		await Promise.all(
			filenames
				.filter((filename) => /^[a-f0-9]{64}\.mp4$/.test(filename))
				.map(async (filename) => {
					const filePath = path.join(cacheDir, filename);
					try {
						const file = await fs.promises.stat(filePath);
						return file.isFile()
							? { filePath, size: file.size, lastUsedAt: file.mtimeMs }
							: null;
					} catch {
						return null;
					}
				})
		)
	).filter((entry) => entry !== null);
	entries.sort((left, right) => left.lastUsedAt - right.lastUsedAt);
	let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
	let totalEntries = entries.length;
	const pathsToRemove: string[] = [];
	for (const entry of entries) {
		if (totalBytes <= MAX_CACHE_BYTES && totalEntries <= MAX_CACHE_ENTRIES) {
			break;
		}
		if (entry.filePath === keepPath) continue;
		pathsToRemove.push(entry.filePath);
		totalBytes -= entry.size;
		totalEntries--;
	}
	await Promise.all(
		pathsToRemove.map((filePath) => fs.promises.rm(filePath, { force: true }))
	);
}
