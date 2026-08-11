import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const MAX_CAPTURED_OUTPUT = 96 * 1024;
const activeProcesses = new Map<string, Set<ChildProcess>>();
const cancelledRequests = new Set<string>();
const cancellationExpiryTimers = new Map<string, NodeJS.Timeout>();

function appendBounded({ current, chunk }: { current: string; chunk: Buffer }) {
	const combined = current + chunk.toString();
	return combined.length <= MAX_CAPTURED_OUTPUT
		? combined
		: combined.slice(-MAX_CAPTURED_OUTPUT);
}

function addProcess({
	requestId,
	child,
}: {
	requestId: string;
	child: ChildProcess;
}) {
	const processes = activeProcesses.get(requestId) ?? new Set<ChildProcess>();
	processes.add(child);
	activeProcesses.set(requestId, processes);
}

function removeProcess({
	requestId,
	child,
}: {
	requestId: string;
	child: ChildProcess;
}) {
	const processes = activeProcesses.get(requestId);
	if (!processes) return;
	processes.delete(child);
	if (processes.size === 0) activeProcesses.delete(requestId);
}

export function throwIfJianyingTextRenderCancelled({
	requestId,
}: {
	requestId: string;
}) {
	if (cancelledRequests.has(requestId)) {
		throw new Error("Jianying text render cancelled");
	}
}

export function runJianyingTextProcess({
	requestId,
	command,
	args,
	env,
	timeoutMs,
}: {
	requestId: string;
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
	timeoutMs: number;
}) {
	throwIfJianyingTextRenderCancelled({ requestId });
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		addProcess({ requestId, child });
		let output = "";
		let settled = false;
		let timer: NodeJS.Timeout | undefined;
		const finish = ({ error }: { error?: Error }) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			removeProcess({ requestId, child });
			if (error) reject(error);
			else resolve();
		};
		child.stdout?.on("data", (chunk: Buffer) => {
			output = appendBounded({ current: output, chunk });
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			output = appendBounded({ current: output, chunk });
		});
		child.on("error", (cause) => finish({ error: cause }));
		child.on("close", (code, signal) => {
			if (cancelledRequests.has(requestId)) {
				finish({ error: new Error("Jianying text render cancelled") });
				return;
			}
			if (code === 0) {
				finish({});
				return;
			}
			finish({
				error: new Error(
					`${path.basename(command)} failed (${signal ?? code ?? "unknown"}): ${output.trim()}`
				),
			});
		});
		timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish({
				error: new Error(
					`${path.basename(command)} timed out after ${timeoutMs}ms: ${output.trim()}`
				),
			});
		}, timeoutMs);
	});
}

export function cancelJianyingTextRender({ requestId }: { requestId: string }) {
	cancelledRequests.add(requestId);
	const existingTimer = cancellationExpiryTimers.get(requestId);
	if (existingTimer) clearTimeout(existingTimer);
	const expiryTimer = setTimeout(() => {
		cancelledRequests.delete(requestId);
		cancellationExpiryTimers.delete(requestId);
	}, 60_000);
	expiryTimer.unref();
	cancellationExpiryTimers.set(requestId, expiryTimer);
	const processes = activeProcesses.get(requestId);
	if (!processes) return false;
	for (const child of processes) child.kill("SIGKILL");
	return true;
}

export function finishJianyingTextRender({ requestId }: { requestId: string }) {
	cancelledRequests.delete(requestId);
	const timer = cancellationExpiryTimers.get(requestId);
	if (timer) clearTimeout(timer);
	cancellationExpiryTimers.delete(requestId);
}
