import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	IndependentFilterRequest,
	IndependentFilterResult,
} from "./contract.js";
import type { IndependentFilterSession } from "./session.js";
import { resolveSoftGlowHost } from "./soft-glow-bridge.js";
import {
	SOFT_GLOW_PROVIDER,
	SOFT_GLOW_RESOURCE,
	SOFT_GLOW_INTENSITY_MODE,
	validateSoftGlowFrame,
} from "./soft-glow-contract.js";

export interface SoftGlowSessionOptions {
	width: number;
	height: number;
	intensity: number;
	lut: Uint8Array;
	signal?: AbortSignal;
}

export async function createSoftGlowSession({
	width,
	height,
	intensity,
	lut,
	signal,
}: SoftGlowSessionOptions): Promise<IndependentFilterSession> {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 1 ||
		height < 1 ||
		width > 4096 ||
		height > 4096 ||
		width * height > 1920 * 1080
	)
		throw new Error(
			"Independent cinematic soft glow dimensions exceed the 1080p frame limit."
		);
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100)
		throw new Error(
			"Independent cinematic soft glow intensity must be between 0 and 100."
		);
	if (!(lut instanceof Uint8Array) || lut.length !== 512 * 512 * 4)
		throw new Error(
			"Independent cinematic soft glow requires a complete RGBA LUT atlas."
		);
	signal?.throwIfAborted();
	const host = await resolveSoftGlowHost();
	signal?.throwIfAborted();
	const directory = await mkdtemp(join(tmpdir(), "qcut-soft-glow-"));
	try {
		const lutPath = join(directory, "atlas.rgba");
		await writeFile(lutPath, lut, { mode: 0o600 });
		signal?.throwIfAborted();
		const child = spawn(
			host,
			[
				"--lut",
				lutPath,
				"--width",
				String(width),
				"--height",
				String(height),
				"--intensity",
				String(intensity / 100),
				"--intensity-mode",
				SOFT_GLOW_INTENSITY_MODE,
			],
			{
				stdio: ["pipe", "pipe", "pipe"],
				env: {
					...process.env,
					DYLD_LIBRARY_PATH: "",
					DYLD_INSERT_LIBRARIES: "",
					DYLD_FRAMEWORK_PATH: "",
				},
			}
		);
		let failure: Error | undefined;
		let closed = false;
		let stderr = "";
		let pending = 0;
		let tail: Promise<unknown> = Promise.resolve();
		let disposePromise: Promise<void> | undefined;
		let resolveExit: () => void = () => {};
		const exited = new Promise<void>((resolve) => {
			resolveExit = resolve;
		});
		let waiting:
			| {
					bytes: Buffer;
					offset: number;
					resolve: (bytes: Buffer) => void;
					reject: (error: Error) => void;
					timer: NodeJS.Timeout;
			  }
			| undefined;
		const fail = (error: Error) => {
			failure ??= error;
			if (waiting) {
				clearTimeout(waiting.timer);
				waiting.reject(failure);
				waiting = undefined;
			}
		};
		const terminate = (error: Error) => {
			fail(error);
			child.kill("SIGKILL");
		};
		const abort = () => {
			terminate(
				new Error("Independent cinematic soft glow rendering cancelled.")
			);
		};
		signal?.addEventListener("abort", abort, { once: true });
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-4096);
		});
		child.stdout.on("data", (chunk: Buffer) => {
			if (!waiting || chunk.length > waiting.bytes.length - waiting.offset) {
				terminate(
					new Error(
						"Independent cinematic soft glow returned an invalid frame length."
					)
				);
				return;
			}
			chunk.copy(waiting.bytes, waiting.offset);
			waiting.offset += chunk.length;
			if (waiting.offset === waiting.bytes.length) {
				const completed = waiting;
				waiting = undefined;
				clearTimeout(completed.timer);
				completed.resolve(completed.bytes);
			}
		});
		child.on("error", (error) => {
			fail(error);
			resolveExit();
		});
		child.stdin.on("error", terminate);
		child.stdout.on("error", terminate);
		child.stderr.on("error", terminate);
		child.on("close", (code) => {
			fail(
				new Error(
					`Independent cinematic soft glow host closed (${code}). ${stderr}`
				)
			);
			resolveExit();
		});
		const dispose = () => {
			disposePromise ??= (async () => {
				closed = true;
				signal?.removeEventListener("abort", abort);
				fail(new Error("Independent cinematic soft glow session disposed."));
				child.kill("SIGKILL");
				await exited;
				await tail;
				await rm(directory, { recursive: true, force: true });
			})();
			return disposePromise;
		};
		return {
			dispose,
			render(request: IndependentFilterRequest) {
				try {
					validateSoftGlowFrame(request);
					if (
						request.width !== width ||
						request.height !== height ||
						request.intensity !== intensity
					)
						throw new Error(
							"Independent cinematic soft glow frame parameters do not match the session."
						);
					if (closed || failure)
						throw (
							failure ??
							new Error("Independent cinematic soft glow session is closed.")
						);
					if (pending >= 4)
						throw new Error("Independent cinematic soft glow queue is full.");
				} catch (error) {
					return Promise.reject(error);
				}
				const input = new Uint8Array(request.rgba);
				pending += 1;
				const operation = tail
					.then(async (): Promise<IndependentFilterResult> => {
						if (closed || failure)
							throw (
								failure ??
								new Error("Independent cinematic soft glow session is closed.")
							);
						const response = new Promise<Buffer>((resolve, reject) => {
							const timer = setTimeout(() => {
								terminate(
									new Error(
										`Independent cinematic soft glow timed out. ${stderr}`
									)
								);
							}, 60_000);
							waiting = {
								bytes: Buffer.allocUnsafe(input.length),
								offset: 0,
								resolve,
								reject,
								timer,
							};
						});
						const written = new Promise<void>((resolve, reject) => {
							child.stdin.write(input, (error) => {
								if (error) {
									terminate(error);
									reject(error);
								} else resolve();
							});
						});
						const [rgba] = await Promise.all([response, written]);
						if (closed || failure)
							throw (
								failure ??
								new Error("Independent cinematic soft glow session is closed.")
							);
						signal?.throwIfAborted();
						return {
							provider: SOFT_GLOW_PROVIDER,
							resourceId: SOFT_GLOW_RESOURCE,
							width,
							height,
							rgba: new Uint8Array(rgba),
						};
					})
					.finally(() => {
						pending -= 1;
					});
				tail = operation.catch(() => {});
				return operation;
			},
		};
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
}
