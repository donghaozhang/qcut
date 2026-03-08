const DEFAULT_MODEL = "fal-ai/flux/dev";
const POLL_MAX_MS = 300_000;

export function hasFalCredentials(): boolean {
	return Boolean(process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY);
}

export function getDefaultFalModel(): string {
	return process.env.FAL_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string {
	const key = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;
	if (!key) {
		throw new Error("FAL_KEY or FAL_API_KEY is required.");
	}
	return key;
}

function getBaseUrl(): string {
	return (process.env.FAL_BASE_URL || "https://fal.run").replace(/\/+$/g, "");
}

function getQueueBaseUrl(): string {
	return "https://queue.fal.run";
}

function getImageSize({ aspectRatio }: { aspectRatio: string }): { width: number; height: number } {
	switch (aspectRatio) {
		case "1:1":
			return { width: 1024, height: 1024 };
		case "9:16":
			return { width: 768, height: 1344 };
		case "4:3":
			return { width: 1152, height: 896 };
		case "3:4":
			return { width: 896, height: 1152 };
		case "2.35:1":
			return { width: 1536, height: 640 };
		case "16:9":
		default:
			return { width: 1344, height: 768 };
	}
}

type FalResponse = {
	images?: Array<{ url: string }>;
	image?: { url: string };
	request_id?: string;
	status?: string;
};

type FalStatusResponse = {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	response_url?: string;
};

function getPollInterval({ elapsedMs }: { elapsedMs: number }): number {
	if (elapsedMs < 10_000) {
		return 500;
	}
	if (elapsedMs < 30_000) {
		return 2_000;
	}
	return 4_000;
}

async function pollForResult({
	apiKey,
	model,
	requestId,
}: {
	apiKey: string;
	model: string;
	requestId: string;
}): Promise<FalResponse> {
	const start = Date.now();
	const queueBase = getQueueBaseUrl();
	const statusUrl = `${queueBase}/${model}/requests/${requestId}/status`;
	const resultUrl = `${queueBase}/${model}/requests/${requestId}`;

	while (Date.now() - start < POLL_MAX_MS) {
		const response = await fetch(statusUrl, {
			headers: { Authorization: `Key ${apiKey}` },
		});
		if (!response.ok) {
			throw new Error(`fal status poll failed (${response.status}): ${await response.text()}`);
		}

		const status = (await response.json()) as FalStatusResponse;
		if (status.status === "COMPLETED") {
			const resultResponse = await fetch(status.response_url || resultUrl, {
				headers: { Authorization: `Key ${apiKey}` },
			});
			if (!resultResponse.ok) {
				throw new Error(`fal result fetch failed (${resultResponse.status}): ${await resultResponse.text()}`);
			}
			return (await resultResponse.json()) as FalResponse;
		}
		if (status.status === "FAILED") {
			throw new Error("fal generation failed");
		}

		await new Promise((resolvePromise) =>
			setTimeout(resolvePromise, getPollInterval({ elapsedMs: Date.now() - start })),
		);
	}

	throw new Error(`fal generation timed out after ${POLL_MAX_MS / 1000}s`);
}

function extractImageUrl({ result }: { result: FalResponse }): string {
	const first = result.images?.[0]?.url;
	if (first) {
		return first;
	}
	if (result.image?.url) {
		return result.image.url;
	}
	throw new Error(`Unexpected fal response: ${JSON.stringify(result).slice(0, 500)}`);
}

async function downloadImage({ url }: { url: string }): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download fal image (${response.status})`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

export async function generateFalImage({
	prompt,
	model,
	aspectRatio,
}: {
	prompt: string;
	model: string;
	aspectRatio: string;
}): Promise<Uint8Array> {
	const apiKey = getApiKey();
	const payload = {
		prompt,
		image_size: getImageSize({ aspectRatio }),
	};
	const url = `${getBaseUrl()}/${model}`;

	console.log(`Generating image with fal.ai (${model})...`);

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Key ${apiKey}`,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const text = await response.text();
		if (response.status === 422 || response.status === 408) {
			console.log("Generation failed, retrying...");
			const queueResponse = await fetch(`${getQueueBaseUrl()}/${model}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Key ${apiKey}`,
				},
				body: JSON.stringify(payload),
			});
			if (!queueResponse.ok) {
				throw new Error(`fal queue API error (${queueResponse.status}): ${await queueResponse.text()}`);
			}
			const queueData = (await queueResponse.json()) as { request_id: string };
			const queuedResult = await pollForResult({
				apiKey,
				model,
				requestId: queueData.request_id,
			});
			console.log("Generation completed.");
			return downloadImage({ url: extractImageUrl({ result: queuedResult }) });
		}

		throw new Error(`fal.ai API error (${response.status}): ${text}`);
	}

	const result = (await response.json()) as FalResponse;
	if (result.request_id && result.status && result.status !== "COMPLETED") {
		const queuedResult = await pollForResult({
			apiKey,
			model,
			requestId: result.request_id,
		});
		console.log("Generation completed.");
		return downloadImage({ url: extractImageUrl({ result: queuedResult }) });
	}

	console.log("Generation completed.");
	return downloadImage({ url: extractImageUrl({ result }) });
}
