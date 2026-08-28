import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JianyingFilterLabRenderLocalEffectResult } from "../jianying-filter-lab-contract.js";
import type { JianyingFilterLocalRuntimeInspection } from "../jianying-filter-local-runtime/runtime-discovery.js";
import { resolveJianyingPortraitAdjustmentHost } from "../jianying-portrait-adjustment-runtime/bridge-resolver.js";
import {
	startJianyingPortraitHostProcess,
	type JianyingPortraitHostProcess,
} from "../jianying-portrait-adjustment-runtime/host-process.js";

export interface JianyingFilterSwingRenderSession {
	processId: number;
	render: ({
		rgba,
		timestampSeconds,
	}: {
		rgba: Uint8Array;
		timestampSeconds?: number;
	}) => Promise<JianyingFilterLabRenderLocalEffectResult>;
	dispose: () => Promise<void>;
}

function readyRuntimePaths({
	runtime,
}: {
	runtime: JianyingFilterLocalRuntimeInspection;
}) {
	if (
		runtime.status.state !== "ready" ||
		!runtime.frameworkDirectory ||
		!runtime.modelDirectory
	) {
		throw new Error(runtime.status.message);
	}
	return {
		frameworkDirectory: runtime.frameworkDirectory,
		modelDirectory: runtime.modelDirectory,
		runtimeRoot: path.dirname(runtime.frameworkDirectory),
	};
}

function intensityParameters({ intensity }: { intensity: number }) {
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) {
		throw new Error("Native Swing filter intensity must be between 0 and 100");
	}
	return JSON.stringify({ intensity: Number((intensity / 100).toFixed(6)) });
}

export async function createJianyingFilterSwingRenderSession({
	resourceId,
	packagePath,
	width,
	height,
	runtime,
	intensity,
}: {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	runtime: JianyingFilterLocalRuntimeInspection;
	intensity: number;
}): Promise<JianyingFilterSwingRenderSession> {
	const frameBytes = width * height * 4;
	if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) {
		throw new Error("Native Swing filter dimensions are invalid");
	}
	const featureParameters = intensityParameters({ intensity });
	const runtimePaths = readyRuntimePaths({ runtime });
	const hostPath = await resolveJianyingPortraitAdjustmentHost();
	if (!hostPath)
		throw new Error("QCut native Swing filter host is unavailable");
	const temporaryDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-filter-swing-")
	);
	let host: JianyingPortraitHostProcess | null = null;
	try {
		host = await startJianyingPortraitHostProcess({
			hostPath,
			...runtimePaths,
			packagePath,
			width,
			height,
		});
	} catch (cause) {
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw cause;
	}

	const activeHost = host;
	let disposed = false;
	return {
		processId: activeHost.pid,
		render: async ({ rgba, timestampSeconds = 0 }) => {
			if (disposed) throw new Error("Native Swing filter session is closed");
			if (rgba.byteLength !== frameBytes) {
				throw new Error("Native Swing filter frame dimensions changed");
			}
			if (intensity === 0) {
				return {
					provider: "jianying-local-effect-v1",
					resourceId,
					width,
					height,
					rgba: new Uint8Array(rgba),
				};
			}
			const requestId = randomUUID();
			const inputPath = path.join(
				temporaryDirectory,
				`${requestId}-input.rgba`
			);
			const outputPath = path.join(
				temporaryDirectory,
				`${requestId}-output.rgba`
			);
			try {
				await writeFile(inputPath, rgba, { mode: 0o600 });
				await activeHost.render({
					requestId,
					timestampSeconds,
					inputPath,
					outputPath,
					featureParameters,
				});
				const output = await readFile(outputPath);
				if (output.byteLength !== frameBytes) {
					throw new Error("Native Swing filter returned an invalid frame");
				}
				return {
					provider: "jianying-local-effect-v1",
					resourceId,
					width,
					height,
					rgba: new Uint8Array(output),
				};
			} finally {
				await Promise.all([
					rm(inputPath, { force: true }),
					rm(outputPath, { force: true }),
				]);
			}
		},
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			await activeHost.dispose();
			await rm(temporaryDirectory, { recursive: true, force: true });
		},
	};
}

export const jianyingFilterSwingRenderTestUtils = {
	intensityParameters,
};
