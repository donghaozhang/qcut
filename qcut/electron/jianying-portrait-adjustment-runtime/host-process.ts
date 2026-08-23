import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const HOST_READY_TIMEOUT_MS = 30_000;
const HOST_RENDER_TIMEOUT_MS = 30_000;
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

export interface JianyingPortraitHostRenderCommand {
	requestId: string;
	timestampSeconds: number;
	inputPath: string;
	outputPath: string;
	featureParameters: string;
}

export interface JianyingPortraitHostProcess {
	pid: number;
	render: (command: JianyingPortraitHostRenderCommand) => Promise<void>;
	dispose: () => Promise<void>;
}

export interface StartJianyingPortraitHostProcessOptions {
	hostPath: string;
	runtimeRoot: string;
	modelDirectory: string;
	packagePath: string;
	frameworkDirectory: string;
	width: number;
	height: number;
}

function deferred<T>(): Deferred<T> {
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

export function encodeJianyingPortraitHostRenderCommand({
	requestId,
	timestampSeconds,
	inputPath,
	outputPath,
	featureParameters,
}: JianyingPortraitHostRenderCommand) {
	for (const [label, field] of [
		["requestId", requestId],
		["inputPath", inputPath],
		["outputPath", outputPath],
		["featureParameters", featureParameters],
	] as const) {
		assertProtocolField({ field, label });
	}
	if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
		throw new Error("timestampSeconds must be a non-negative finite number");
	}
	return [
		"render",
		requestId,
		String(timestampSeconds),
		inputPath,
		outputPath,
		featureParameters,
	].join("\t");
}

export async function startJianyingPortraitHostProcess(
	options: StartJianyingPortraitHostProcessOptions
): Promise<JianyingPortraitHostProcess> {
	const child: ChildProcessWithoutNullStreams = spawn(
		options.hostPath,
		[options.runtimeRoot, options.modelDirectory, options.packagePath],
		{
			env: {
				...process.env,
				QCUT_FRAME_WIDTH: String(options.width),
				QCUT_FRAME_HEIGHT: String(options.height),
				DYLD_LIBRARY_PATH: [
					options.frameworkDirectory,
					process.env.DYLD_LIBRARY_PATH,
				]
					.filter(Boolean)
					.join(":"),
			},
			stdio: ["pipe", "pipe", "pipe"],
		}
	);
	const ready = deferred<void>();
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
	const hostError = ({ message }: { message: string }) => {
		const detail = stderrTail.trim();
		return new Error(detail ? `${message}: ${detail}` : message);
	};
	const failHost = ({ message }: { message: string }) => {
		const error = hostError({ message });
		if (!isReady) ready.reject(error);
		rejectPending({ error });
	};

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_LIMIT);
	});
	child.on("error", (cause) => {
		failHost({ message: `剪映美颜美体宿主启动失败: ${cause.message}` });
	});
	child.on("exit", (code, signal) => {
		exited = true;
		resolveExit?.();
		if (isDisposed) return;
		failHost({
			message: `剪映美颜美体宿主意外退出 (${signal ?? code ?? "unknown"})`,
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
		if (fields[0] !== "RESULT") return;
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
			new Error(fields.slice(3).join("\t") || "剪映美颜美体渲染失败")
		);
	});

	const readyTimeout = setTimeout(() => {
		ready.reject(new Error("剪映美颜美体宿主初始化超时"));
		child.kill();
	}, HOST_READY_TIMEOUT_MS);
	try {
		await ready.promise;
	} catch (cause) {
		isDisposed = true;
		child.kill();
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
				throw new Error("剪映美颜美体宿主不可用");
			}
			if (pending.has(command.requestId)) {
				throw new Error("剪映美颜美体请求 ID 重复");
			}
			const encoded = encodeJianyingPortraitHostRenderCommand(command);
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					pending.delete(command.requestId);
					reject(new Error("剪映美颜美体单帧渲染超时"));
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
			rejectPending({ error: new Error("剪映美颜美体宿主已关闭") });
			if (!exited && child.stdin.writable) child.stdin.end("exit\n");
			const terminate = setTimeout(() => child.kill(), 1000);
			const forceKill = setTimeout(() => child.kill("SIGKILL"), 3000);
			terminate.unref();
			forceKill.unref();
			await exitPromise;
			clearTimeout(terminate);
			clearTimeout(forceKill);
		},
	};
}
