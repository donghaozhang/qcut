import { spawn } from "node:child_process";
import path from "node:path";

const PROCESS_TIMEOUT_MS = 15 * 60_000;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;

interface ProcessResult {
	stderr: string;
	stdout: string;
}

function appendBounded({ current, chunk }: { current: string; chunk: Buffer }) {
	return `${current}${chunk.toString("utf8")}`.slice(-MAX_PROCESS_OUTPUT_BYTES);
}

export function motionTrackingAbortError() {
	const error = new Error("运动跟踪已取消");
	error.name = "AbortError";
	return error;
}

export async function runMotionTrackingProcess({
	acceptedExitCodes = [0],
	args,
	command,
	signal,
	timeoutMs = PROCESS_TIMEOUT_MS,
}: {
	acceptedExitCodes?: number[];
	args: string[];
	command: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}): Promise<ProcessResult> {
	if (signal?.aborted) throw motionTrackingAbortError();
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stderr = "";
		let stdout = "";
		let aborted = false;
		let settled = false;
		let timedOut = false;
		const terminate = () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGKILL");
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			terminate();
		}, timeoutMs);
		timeout.unref();
		const cleanup = () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", handleAbort);
		};
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const handleAbort = () => {
			aborted = true;
			terminate();
		};
		signal?.addEventListener("abort", handleAbort, { once: true });
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout = appendBounded({ current: stdout, chunk });
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = appendBounded({ current: stderr, chunk });
		});
		child.on("error", (error) =>
			fail(aborted ? motionTrackingAbortError() : error)
		);
		child.on("close", (code, exitSignal) => {
			if (settled) return;
			if (timedOut) {
				fail(
					new Error(
						`${path.basename(command)} 超过 ${Math.round(timeoutMs / 1000)} 秒未完成`
					)
				);
				return;
			}
			if (aborted) {
				fail(motionTrackingAbortError());
				return;
			}
			if (code === null || !acceptedExitCodes.includes(code)) {
				fail(
					new Error(
						`${path.basename(command)} 失败 (${exitSignal ?? code ?? "unknown"}): ${(stderr || stdout).trim()}`
					)
				);
				return;
			}
			settled = true;
			cleanup();
			resolve({ stderr, stdout });
		});
	});
}
