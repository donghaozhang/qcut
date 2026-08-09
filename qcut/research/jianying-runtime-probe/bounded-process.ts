export interface BoundedProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;

export function runBoundedProcess({
	command,
	args,
	cwd,
	env = process.env,
	timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
}: {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
}): Promise<BoundedProcessResult> {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		return Promise.reject(
			new Error("Process timeout must be a positive integer.")
		);
	}
	return new Promise<BoundedProcessResult>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// The deadline still rejects if the process exited between checks.
			}
			reject(
				new Error(`${command} timed out after ${timeoutMs} milliseconds.`)
			);
		}, timeoutMs);
		timer.unref();
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (cause) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(cause);
		});
		child.on("close", (exitCode) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ exitCode: exitCode ?? -1, stdout, stderr });
		});
	});
}
import { spawn } from "node:child_process";
