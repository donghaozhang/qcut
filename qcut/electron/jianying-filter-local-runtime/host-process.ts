import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const HOST_READY_TIMEOUT_MS = 20_000;
const HOST_RENDER_TIMEOUT_MS = 20_000;
const STDERR_TAIL_LIMIT = 16 * 1024;

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: Error) => void;
}

interface PendingRender {
	resolve: () => void;
	reject: (reason: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

export interface JianyingFilterHostRenderCommand {
	requestId: string;
	timestampSeconds: number;
	inputPath: string;
	outputPath: string;
	maskPath?: string;
}

export interface JianyingFilterHostProcess {
	pid: number;
	render: (command: JianyingFilterHostRenderCommand) => Promise<void>;
	dispose: () => Promise<void>;
}

export interface StartJianyingFilterHostProcessOptions {
	bridgePath: string;
	effectLibraryPath: string;
	modelDirectory: string;
	packagePath: string;
	bootstrapInputPath: string;
	bootstrapOutputPath: string;
	frameworkDirectory: string;
	skipAlgorithm?: boolean;
	captureMask?: boolean;
}

function createDeferred<T>(): Deferred<T> {
	let resolvePromise: ((value: T) => void) | undefined;
	let rejectPromise: ((reason: Error) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		resolve: (value) => resolvePromise?.(value),
		reject: (reason) => rejectPromise?.(reason),
	};
}

function assertProtocolField({
	field,
	label,
}: {
	field: string;
	label: string;
}) {
	if (!field || /[\t\r\n]/.test(field)) {
		throw new Error(`${label} contains unsupported control characters`);
	}
}

export function encodeJianyingFilterHostRenderCommand({
	requestId,
	timestampSeconds,
	inputPath,
	outputPath,
	maskPath,
}: JianyingFilterHostRenderCommand) {
	assertProtocolField({ field: requestId, label: "requestId" });
	assertProtocolField({ field: inputPath, label: "inputPath" });
	assertProtocolField({ field: outputPath, label: "outputPath" });
	if (maskPath) assertProtocolField({ field: maskPath, label: "maskPath" });
	if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
		throw new Error("timestampSeconds must be a non-negative finite number");
	}
	return [
		"render",
		requestId,
		String(timestampSeconds),
		inputPath,
		outputPath,
		maskPath ?? "-",
	].join("\t");
}

function appendStderrTail({
	current,
	chunk,
}: {
	current: string;
	chunk: string;
}) {
	return `${current}${chunk}`.slice(-STDERR_TAIL_LIMIT);
}

function hostFailureMessage({
	message,
	stderrTail,
}: {
	message: string;
	stderrTail: string;
}) {
	const detail = stderrTail.trim();
	return detail ? `${message}: ${detail}` : message;
}

function spawnHost({
	bridgePath,
	effectLibraryPath,
	modelDirectory,
	packagePath,
	bootstrapInputPath,
	bootstrapOutputPath,
	frameworkDirectory,
	skipAlgorithm = false,
	captureMask = true,
}: StartJianyingFilterHostProcessOptions): ChildProcessWithoutNullStreams {
	const argumentsList = [
		effectLibraryPath,
		modelDirectory,
		packagePath,
		bootstrapOutputPath,
		"core32",
		"--input",
		bootstrapInputPath,
		...(skipAlgorithm ? ["--skip-algorithm"] : []),
		...(captureMask ? ["--inspect-skin-result"] : []),
		"--server",
	];
	return spawn(bridgePath, argumentsList, {
		env: {
			...process.env,
			DYLD_LIBRARY_PATH: [frameworkDirectory, process.env.DYLD_LIBRARY_PATH]
				.filter(Boolean)
				.join(":"),
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
}

export async function startJianyingFilterHostProcess(
	options: StartJianyingFilterHostProcessOptions
): Promise<JianyingFilterHostProcess> {
	const child = spawnHost(options);
	const ready = createDeferred<void>();
	const pending = new Map<string, PendingRender>();
	let stderrTail = "";
	let isReady = false;
	let isDisposed = false;
	let exited = false;
	let resolveExit: (() => void) | undefined;
	const exitPromise = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});

	const rejectPending = ({ error }: { error: Error }) => {
		for (const render of pending.values()) {
			clearTimeout(render.timeout);
			render.reject(error);
		}
		pending.clear();
	};
	const failHost = ({ message }: { message: string }) => {
		const error = new Error(hostFailureMessage({ message, stderrTail }));
		if (!isReady) ready.reject(error);
		rejectPending({ error });
	};

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderrTail = appendStderrTail({ current: stderrTail, chunk });
	});
	child.on("error", (cause) => {
		failHost({ message: `剪映本机滤镜宿主启动失败: ${cause.message}` });
	});
	child.on("exit", (code, signal) => {
		exited = true;
		resolveExit?.();
		if (isDisposed) return;
		failHost({
			message: `剪映本机滤镜宿主意外退出 (${signal ?? code ?? "unknown"})`,
		});
	});

	const lines = createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		if (!line.startsWith("QCUT\t")) return;
		const fields = line.slice(5).split("\t");
		if (fields[0] === "READY" && fields[1] === "1") {
			isReady = true;
			ready.resolve();
			return;
		}
		if (fields[0] === "RESULT") {
			const requestId = fields[1] ?? "";
			const render = pending.get(requestId);
			if (!render) return;
			pending.delete(requestId);
			clearTimeout(render.timeout);
			if (fields[2] === "0") {
				render.resolve();
				return;
			}
			render.reject(
				new Error(fields.slice(3).join("\t") || "剪映本机滤镜渲染失败")
			);
			return;
		}
		if (fields[0] === "ERROR") {
			failHost({
				message: fields.slice(2).join("\t") || "剪映本机滤镜协议错误",
			});
		}
	});

	const readyTimeout = setTimeout(() => {
		ready.reject(new Error("剪映本机滤镜宿主初始化超时"));
		child.kill();
	}, HOST_READY_TIMEOUT_MS);
	try {
		await ready.promise;
	} catch (cause) {
		isDisposed = true;
		child.kill();
		// The caller removes the temporary package/bootstrap files as soon as
		// startup rejects, so wait until the host has actually terminated. A
		// failed spawn emits `error` without `exit` and never has a pid — it
		// needs no wait.
		if (child.pid !== undefined && !exited) {
			const forceKill = setTimeout(() => child.kill("SIGKILL"), 1000);
			forceKill.unref();
			await exitPromise;
			clearTimeout(forceKill);
		}
		throw cause;
	} finally {
		clearTimeout(readyTimeout);
	}

	return {
		pid: child.pid ?? -1,
		render: async (command) => {
			if (isDisposed || exited || !child.stdin.writable) {
				throw new Error("剪映本机滤镜宿主不可用");
			}
			if (pending.has(command.requestId)) {
				throw new Error("剪映本机滤镜请求 ID 重复");
			}
			const encoded = encodeJianyingFilterHostRenderCommand(command);
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					pending.delete(command.requestId);
					reject(new Error("剪映本机滤镜单帧渲染超时"));
					child.kill();
				}, HOST_RENDER_TIMEOUT_MS);
				pending.set(command.requestId, { resolve, reject, timeout });
				child.stdin.write(`${encoded}\n`, (error) => {
					if (!error) return;
					const render = pending.get(command.requestId);
					if (!render) return;
					pending.delete(command.requestId);
					clearTimeout(render.timeout);
					render.reject(error);
				});
			});
		},
		dispose: async () => {
			if (isDisposed) return exitPromise;
			isDisposed = true;
			rejectPending({ error: new Error("剪映本机滤镜宿主已关闭") });
			if (!exited && child.stdin.writable) {
				child.stdin.end("shutdown\n");
			}
			const forceKill = setTimeout(() => child.kill(), 1000);
			forceKill.unref();
			await exitPromise;
			clearTimeout(forceKill);
		},
	};
}

export const jianyingFilterHostProcessTestUtils = {
	appendStderrTail,
};
