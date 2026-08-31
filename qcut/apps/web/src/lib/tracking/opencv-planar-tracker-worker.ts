import {
	OpenCvPlanarTrackerError,
	OpenCvPlanarTrackerKernel,
	type OpenCvPlanarRuntime,
} from "./opencv-planar-tracker-kernel";
import {
	OPENCV_PLANAR_PROVIDER_VERSION,
	type PlanarTrackerWorkerRequest,
	type PlanarTrackerWorkerResponse,
} from "./planar-tracker-protocol";

interface PlanarWorkerScope {
	cv?: unknown;
	onmessage: ((event: MessageEvent<PlanarTrackerWorkerRequest>) => void) | null;
	postMessage: (message: PlanarTrackerWorkerResponse) => void;
}

const workerScope = self as unknown as PlanarWorkerScope;
let kernelPromise: Promise<OpenCvPlanarTrackerKernel> | undefined;

async function createKernel({
	runtimeUrl,
}: {
	runtimeUrl: string;
}): Promise<OpenCvPlanarTrackerKernel> {
	// The UMD runtime installs a real initialization Promise on the worker global.
	await import(/* @vite-ignore */ runtimeUrl);
	const runtime = await workerScope.cv;
	if (
		runtime === null ||
		(typeof runtime !== "object" && typeof runtime !== "function")
	) {
		throw new OpenCvPlanarTrackerError({
			code: "provider-unavailable",
			message: "The bundled OpenCV runtime did not initialize.",
		});
	}
	const cv = runtime as OpenCvPlanarRuntime;
	if (
		typeof cv.GFTTDetector !== "function" ||
		typeof cv.calcOpticalFlowPyrLK !== "function" ||
		typeof cv.findHomography !== "function"
	) {
		throw new OpenCvPlanarTrackerError({
			code: "provider-unavailable",
			message: "The bundled OpenCV runtime lacks planar tracking APIs.",
		});
	}
	return new OpenCvPlanarTrackerKernel({ cv });
}

async function loadKernel({
	runtimeUrl,
}: {
	runtimeUrl: string;
}): Promise<OpenCvPlanarTrackerKernel> {
	if (kernelPromise) return kernelPromise;
	const pending = createKernel({ runtimeUrl });
	kernelPromise = pending;
	try {
		return await pending;
	} catch (cause) {
		if (kernelPromise === pending) kernelPromise = undefined;
		throw cause;
	}
}

async function handleRequest({
	request,
}: {
	request: PlanarTrackerWorkerRequest;
}): Promise<void> {
	try {
		if (request.type === "initialize") {
			await loadKernel({ runtimeUrl: request.runtimeUrl });
			workerScope.postMessage({
				id: request.id,
				result: { providerVersion: OPENCV_PLANAR_PROVIDER_VERSION },
				type: "initialized",
			});
			return;
		}
		if (!kernelPromise) {
			throw new OpenCvPlanarTrackerError({
				code: "provider-unavailable",
				message: "OpenCV planar worker was not initialized.",
			});
		}
		const kernel = await kernelPromise;
		if (request.type === "begin") {
			workerScope.postMessage({
				id: request.id,
				result: kernel.begin({
					configuration: request.configuration,
					frame: request.frame,
					seedQuad: request.seedQuad,
				}),
				type: "begun",
			});
			return;
		}
		if (request.type === "track") {
			workerScope.postMessage({
				id: request.id,
				result: kernel.track({ frame: request.frame }),
				type: "tracked",
			});
			return;
		}
		if (request.type === "reset") {
			kernel.reset();
			workerScope.postMessage({ id: request.id, type: "reset" });
			return;
		}
		kernel.dispose();
		workerScope.postMessage({ id: request.id, type: "disposed" });
	} catch (cause) {
		workerScope.postMessage({
			code: cause instanceof OpenCvPlanarTrackerError ? cause.code : undefined,
			id: request.id,
			message:
				cause instanceof Error ? cause.message : "OpenCV planar worker failed.",
			type: "error",
		});
	}
}

let requestQueue = Promise.resolve();
workerScope.onmessage = (event) => {
	requestQueue = requestQueue.then(() =>
		handleRequest({ request: event.data })
	);
};
