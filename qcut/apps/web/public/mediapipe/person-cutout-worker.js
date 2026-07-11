let segmenter = null;
let FilesetResolver = null;
let ImageSegmenter = null;
let personClassIndexes = [];
let inferenceTimestampMs = 0;

function post(message, transfer = []) {
	self.postMessage(message, transfer);
}

function loadVisionBundle(url) {
	if (FilesetResolver && ImageSegmenter) return;
	const previousExports = self.exports;
	const bundleExports = {};
	self.exports = bundleExports;
	try {
		importScripts(url);
		FilesetResolver = bundleExports.FilesetResolver;
		ImageSegmenter = bundleExports.ImageSegmenter;
		if (!FilesetResolver || !ImageSegmenter) {
			throw new Error("MediaPipe vision bundle did not expose segmentation APIs");
		}
	} finally {
		if (previousExports === undefined) delete self.exports;
		else self.exports = previousExports;
	}
}

async function initialize({ wasmRoot, modelUrl, visionBundleUrl }) {
	loadVisionBundle(visionBundleUrl);
	segmenter?.close();
	const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
	segmenter = await ImageSegmenter.createFromOptions(fileset, {
		baseOptions: {
			modelAssetPath: modelUrl,
			delegate: "CPU",
		},
		runningMode: "VIDEO",
		outputConfidenceMasks: true,
		outputCategoryMask: false,
	});
	const labels = segmenter.getLabels();
	personClassIndexes = labels.flatMap((label, index) =>
		label.trim().toLowerCase() === "background" ? [] : [index]
	);
	post({ type: "ready", labels });
}

function segmentFrame({ requestId, frame, sourceTimestampMs }) {
	try {
		if (!segmenter) throw new Error("Person segmenter has not been initialized");
		inferenceTimestampMs = Math.max(
			inferenceTimestampMs + 1,
			Math.round(sourceTimestampMs)
		);

		const startedAt = performance.now();
		const result = segmenter.segmentForVideo(frame, inferenceTimestampMs);
		const masks = result.confidenceMasks;
		const firstMask = masks?.[0];
		if (!firstMask) {
			throw new Error("MediaPipe did not return confidence masks");
		}

		try {
			const labeledIndexes = personClassIndexes.filter(
				(index) => index < masks.length
			);
			const indexes =
				masks.length === 1
					? [0]
					: labeledIndexes.length > 0
						? labeledIndexes
						: Array.from({ length: masks.length - 1 }, (_, index) => index + 1);
			const personConfidence = new Float32Array(
				firstMask.width * firstMask.height
			);
			for (const index of indexes) {
				const confidence = masks[index].getAsFloat32Array();
				for (let pixel = 0; pixel < personConfidence.length; pixel += 1) {
					personConfidence[pixel] = Math.min(
						1,
						personConfidence[pixel] + confidence[pixel]
					);
				}
			}
			post(
				{
					type: "result",
					requestId,
					personConfidence,
					width: firstMask.width,
					height: firstMask.height,
					inferenceMs: performance.now() - startedAt,
				},
				[personConfidence.buffer]
			);
		} finally {
			masks?.forEach((mask) => mask.close());
		}
	} finally {
		frame.close();
	}
}

self.addEventListener("message", async (event) => {
	const request = event.data;
	try {
		switch (request.type) {
			case "initialize":
				await initialize(request);
				break;
			case "segment":
				segmentFrame(request);
				break;
			case "reset":
				break;
			case "close":
				segmenter?.close();
				segmenter = null;
				self.close();
				break;
		}
	} catch (error) {
		post({
			type: "error",
			requestId: request.type === "segment" ? request.requestId : undefined,
			message: error instanceof Error ? error.message : String(error),
		});
	}
});
