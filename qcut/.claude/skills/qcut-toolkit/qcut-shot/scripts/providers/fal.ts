import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_MODEL = "fal-ai/nano-banana-2";
const POLL_MAX_MS = 300_000;

const CREDENTIAL_PATHS = [
	join(homedir(), ".qcut", ".env"),
	join(homedir(), ".config", "video-ai-studio", "credentials.env"),
];

function loadKeyFromFiles({ envName }: { envName: string }): string | undefined {
	for (const filePath of CREDENTIAL_PATHS) {
		if (!existsSync(filePath)) continue;
		const content = readFileSync(filePath, "utf8");
		const match = content.match(new RegExp(`^${envName}=(.+)$`, "m"));
		if (match?.[1]?.trim()) return match[1].trim();
	}
	return undefined;
}

export interface FalGeneratedImage {
	bytes: Uint8Array;
	url: string;
	model: string;
}

export function hasFalCredentials(): boolean {
	return Boolean(
		process.env.FAL_KEY ||
		process.env.FAL_API_KEY ||
		process.env.VITE_FAL_API_KEY ||
		loadKeyFromFiles({ envName: "FAL_KEY" }),
	);
}

export function getDefaultFalModel(): string {
	return process.env.FAL_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string {
	const key =
		process.env.FAL_KEY ||
		process.env.FAL_API_KEY ||
		process.env.VITE_FAL_API_KEY ||
		loadKeyFromFiles({ envName: "FAL_KEY" });
	if (!key) {
		throw new Error("FAL_KEY or FAL_API_KEY is required. Set it in your environment or ~/.qcut/.env.");
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

function trimEditSuffix({ model }: { model: string }): string {
	return model.replace(/\/edit$/u, "");
}

function supportsNativeEditModel({ model }: { model: string }): boolean {
	const baseModel = trimEditSuffix({ model });
	return baseModel === "fal-ai/nano-banana" || baseModel === "fal-ai/nano-banana-2";
}

function resolveModel({
	model,
	referenceImageUrls,
}: {
	model: string;
	referenceImageUrls?: string[];
}): string {
	const trimmedModel = model.trim();
	if ((referenceImageUrls?.length ?? 0) === 0) {
		return trimEditSuffix({ model: trimmedModel });
	}
	if (trimmedModel.endsWith("/edit")) {
		return trimmedModel;
	}
	if (supportsNativeEditModel({ model: trimmedModel })) {
		return `${trimEditSuffix({ model: trimmedModel })}/edit`;
	}
	return trimmedModel;
}

function buildPayload({
	model,
	prompt,
	aspectRatio,
	referenceImageUrls,
}: {
	model: string;
	prompt: string;
	aspectRatio: string;
	referenceImageUrls?: string[];
}): Record<string, unknown> {
	if (model === "fal-ai/nano-banana-2" || model === "fal-ai/nano-banana-2/edit") {
		return {
			prompt,
			...(referenceImageUrls && referenceImageUrls.length > 0
				? { image_urls: referenceImageUrls.slice(0, 10) }
				: {}),
			aspect_ratio: aspectRatio,
			output_format: "png",
			resolution: "2K",
			limit_generations: true,
		};
	}

	if (model === "fal-ai/nano-banana" || model === "fal-ai/nano-banana/edit") {
		return {
			prompt,
			...(referenceImageUrls && referenceImageUrls.length > 0
				? { image_urls: referenceImageUrls.slice(0, 10) }
				: {}),
			num_images: 1,
			output_format: "png",
			sync_mode: true,
		};
	}

	return {
		prompt,
		image_size: getImageSize({ aspectRatio }),
	};
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

function pollDelay({ elapsedMs }: { elapsedMs: number }): number {
	if (elapsedMs < 10_000) {
		return 500;
	}
	if (elapsedMs < 30_000) {
		return 2_000;
	}
	return 4_000;
}

async function poll({
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
			setTimeout(resolvePromise, pollDelay({ elapsedMs: Date.now() - start })),
		);
	}

	throw new Error(`fal generation timed out after ${POLL_MAX_MS / 1000}s`);
}

function imageUrl({ result }: { result: FalResponse }): string {
	const first = result.images?.[0]?.url;
	if (first) {
		return first;
	}
	if (result.image?.url) {
		return result.image.url;
	}
	throw new Error(`Unexpected fal response: ${JSON.stringify(result).slice(0, 500)}`);
}

async function download({ url }: { url: string }): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download fal image (${response.status})`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

export async function generateFalImageAsset({
	prompt,
	model,
	aspectRatio,
	referenceImageUrls,
}: {
	prompt: string;
	model: string;
	aspectRatio: string;
	referenceImageUrls?: string[];
}): Promise<FalGeneratedImage> {
	const apiKey = getApiKey();
	const resolvedModel = resolveModel({ model, referenceImageUrls });
	const payload = buildPayload({
		model: resolvedModel,
		prompt,
		aspectRatio,
		referenceImageUrls,
	});
	const url = `${getBaseUrl()}/${resolvedModel}`;

	console.log(`Generating image with fal.ai (${resolvedModel})...`);

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
			const queueResponse = await fetch(`${getQueueBaseUrl()}/${resolvedModel}`, {
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
			const queuedResult = await poll({
				apiKey,
				model: resolvedModel,
				requestId: queueData.request_id,
			});
			const generatedUrl = imageUrl({ result: queuedResult });
			console.log("Generation completed.");
			return {
				bytes: await download({ url: generatedUrl }),
				url: generatedUrl,
				model: resolvedModel,
			};
		}

		throw new Error(`fal.ai API error (${response.status}): ${text}`);
	}

	const result = (await response.json()) as FalResponse;
	if (result.request_id && result.status && result.status !== "COMPLETED") {
		const queuedResult = await poll({
			apiKey,
			model: resolvedModel,
			requestId: result.request_id,
		});
		const generatedUrl = imageUrl({ result: queuedResult });
		console.log("Generation completed.");
		return {
			bytes: await download({ url: generatedUrl }),
			url: generatedUrl,
			model: resolvedModel,
		};
	}

	const generatedUrl = imageUrl({ result });
	console.log("Generation completed.");
	return {
		bytes: await download({ url: generatedUrl }),
		url: generatedUrl,
		model: resolvedModel,
	};
}

export async function generateFalImage({
	prompt,
	model,
	aspectRatio,
	referenceImageUrls,
}: {
	prompt: string;
	model: string;
	aspectRatio: string;
	referenceImageUrls?: string[];
}): Promise<Uint8Array> {
	const result = await generateFalImageAsset({
		prompt,
		model,
		aspectRatio,
		referenceImageUrls,
	});
	return result.bytes;
}
