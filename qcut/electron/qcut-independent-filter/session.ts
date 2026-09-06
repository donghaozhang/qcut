import { spawn } from "node:child_process";
import { parseFilterLabRenderLocalEffectRequest } from "../jianying-filter-lab-request.js";
import {
	loadIndependentFogLut,
	validateIndependentFilterIdentity,
} from "./assets.js";
import { resolveIndependentFilterHost } from "./bridge.js";
import { encodeIndependentCube, type IndependentCube } from "./lut-data.js";
import {
	encodeIndependentGraph,
	type IndependentGraphData,
} from "./graph-data.js";
import {
	QCUT_FOG_PROVIDER,
	QCUT_LUT_PROVIDER,
	QCUT_GRAPH_PROVIDER,
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
	type IndependentFilterRequest,
	type IndependentFilterResult,
	type IndependentFilterIdentity,
} from "./contract.js";

export interface IndependentFilterSession {
	render: (
		request: IndependentFilterRequest
	) => Promise<IndependentFilterResult>;
	dispose: () => Promise<void>;
}

type SessionOptions =
	| { lutPath: string; cube?: never; graph?: never; identity?: never }
	| {
			graph: IndependentGraphData;
			identity: IndependentFilterIdentity;
			cube?: never;
			lutPath?: never;
	  }
	| {
			cube: IndependentCube;
			identity: IndependentFilterIdentity;
			lutPath?: never;
			graph?: never;
	  };

export async function createIndependentFilterSession(
	options: SessionOptions
): Promise<IndependentFilterSession> {
	const identity = {
		...(options.identity ?? {
			resourceId: QCUT_FOG_RESOURCE,
			version: QCUT_FOG_VERSION,
		}),
	};
	const cubeSize = options.graph?.cube.size ?? options.cube?.size;
	if (
		options.graph &&
		(options.graph.profile.resourceId !== identity.resourceId ||
			options.graph.profile.version !== identity.version)
	)
		throw new Error("Graph data does not match the requested filter identity.");
	const graphMode = Boolean(options.graph);
	const provider = options.graph
		? QCUT_GRAPH_PROVIDER
		: options.cube
			? QCUT_LUT_PROVIDER
			: QCUT_FOG_PROVIDER;
	const lutData = options.graph
		? encodeIndependentGraph({ graph: options.graph })
		: options.cube
			? encodeIndependentCube({ cube: options.cube })
			: loadIndependentFogLut({ filePath: options.lutPath });
	const [host, lut] = await Promise.all([
		resolveIndependentFilterHost(),
		lutData,
	]);
	const child = spawn(
		host,
		cubeSize ? [graphMode ? "--graph" : "--cube", String(cubeSize)] : [],
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
	let stderr = "";
	let buffered = Buffer.alloc(0);
	let waiting:
		| {
				size: number;
				resolve: (bytes: Buffer) => void;
				reject: (error: Error) => void;
				timer: NodeJS.Timeout;
		  }
		| undefined;
	let closed = false;
	let queued = 0;
	let tail: Promise<unknown> = Promise.resolve();
	let resolveExit: () => void = () => {};
	const exited = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});
	const reject = (error: Error) => {
		failure ??= error;
		if (waiting) {
			clearTimeout(waiting.timer);
			waiting.reject(error);
			waiting = undefined;
		}
	};
	const consume = () => {
		if (!waiting || buffered.length < waiting.size) return;
		const current = waiting;
		waiting = undefined;
		clearTimeout(current.timer);
		const bytes = buffered.subarray(0, current.size);
		buffered = buffered.subarray(current.size);
		current.resolve(bytes);
	};
	const read = ({ size }: { size: number }) =>
		new Promise<Buffer>((resolve, rejectRead) => {
			if (failure || closed) {
				rejectRead(failure ?? new Error("QCut Metal session is closed."));
				return;
			}
			if (waiting) {
				rejectRead(new Error("Overlapping Metal protocol reads."));
				return;
			}
			const timer = setTimeout(() => {
				reject(new Error(`QCut Metal timed out. ${stderr}`));
				child.kill("SIGKILL");
			}, 20_000);
			waiting = { size, resolve, reject: rejectRead, timer };
			consume();
		});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = (stderr + chunk.toString()).slice(-4096);
	});
	child.stdout.on("data", (chunk: Buffer) => {
		buffered = Buffer.concat([buffered, chunk]);
		if (buffered.length > 1920 * 1080 * 4 + 4) {
			reject(new Error("Invalid Metal frame response."));
			child.kill("SIGKILL");
			return;
		}
		consume();
	});
	child.on("error", (error) => {
		reject(error);
		resolveExit();
	});
	child.stdin.on("error", reject);
	child.on("close", (code) => {
		reject(new Error(`QCut Metal host closed (${code}). ${stderr}`));
		resolveExit();
	});
	const write = ({ bytes }: { bytes: Uint8Array }) =>
		new Promise<void>((resolve, rejectWrite) => {
			child.stdin.write(bytes, (error) =>
				error ? rejectWrite(error) : resolve()
			);
		});
	const dispose = async () => {
		if (!closed) {
			closed = true;
			reject(new Error("QCut Metal session disposed."));
			child.kill("SIGKILL");
		}
		await exited;
	};
	try {
		const response = read({ size: 4 });
		const [, ready] = await Promise.all([write({ bytes: lut }), response]);
		if (ready.readUInt32LE() !== 0x51464d31)
			throw new Error("Unsupported Metal host protocol.");
	} catch (error) {
		await dispose();
		throw error;
	}
	return {
		dispose,
		render(request) {
			try {
				if (
					request.resourceId !== identity.resourceId ||
					request.version !== identity.version
				)
					throw new Error(
						"Independent frame does not match the loaded LUT version."
					);
				if (!cubeSize) validateIndependentFilterIdentity(request);
				parseFilterLabRenderLocalEffectRequest({ request });
				if (closed || failure)
					throw failure ?? new Error("QCut Metal session is closed.");
				if (queued >= 8) throw new Error("QCut Metal render queue is full.");
			} catch (error) {
				return Promise.reject(error);
			}
			queued += 1;
			const { width, height, intensity } = request;
			const input = new Uint8Array(request.rgba);
			const operation = tail
				.then(async (): Promise<IndependentFilterResult> => {
					if (failure || closed)
						throw failure ?? new Error("QCut Metal session is closed.");
					const header = Buffer.alloc(12);
					header.writeUInt32LE(width, 0);
					header.writeUInt32LE(height, 4);
					header.writeFloatLE(intensity / 100, 8);
					const response = read({ size: input.length });
					const [, rgba] = await Promise.all([
						write({ bytes: Buffer.concat([header, input]) }),
						response,
					]);
					return {
						provider,
						resourceId: identity.resourceId,
						width,
						height,
						rgba: new Uint8Array(rgba),
					};
				})
				.finally(() => {
					queued -= 1;
				});
			tail = operation.catch(() => {});
			return operation;
		},
	};
}

export function createIndependentFrameRequest({
	rgba,
	width,
	height,
	intensity,
}: {
	rgba: Uint8Array;
	width: number;
	height: number;
	intensity: number;
}): IndependentFilterRequest {
	return {
		rgba,
		width,
		height,
		intensity,
		resourceId: QCUT_FOG_RESOURCE,
		version: QCUT_FOG_VERSION,
	};
}
