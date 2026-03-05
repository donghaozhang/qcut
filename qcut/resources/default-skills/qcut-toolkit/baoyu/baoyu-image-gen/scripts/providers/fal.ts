import path from "node:path";
import { readFile } from "node:fs/promises";
import type { CliArgs } from "../types";

const DEFAULT_MODEL = "fal-ai/flux/dev";
const POLL_MAX_MS = 300_000;

export function getDefaultModel(): string {
	return process.env.FAL_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string | null {
	return process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY || null;
}

function getBaseUrl(): string {
	const base = process.env.FAL_BASE_URL || "https://fal.run";
	return base.replace(/\/+$/g, "");
}

function getQueueBaseUrl(): string {
	return "https://queue.fal.run";
}

const SIZE_MAP: Record<string, { width: number; height: number }> = {
	"1:1": { width: 1024, height: 1024 },
	"16:9": { width: 1344, height: 768 },
	"9:16": { width: 768, height: 1344 },
	"4:3": { width: 1152, height: 896 },
	"3:4": { width: 896, height: 1152 },
	"2.35:1": { width: 1536, height: 640 },
};

const SIZE_MAP_2K: Record<string, { width: number; height: number }> = {
	"1:1": { width: 2048, height: 2048 },
	"16:9": { width: 2048, height: 1152 },
	"9:16": { width: 1152, height: 2048 },
	"4:3": { width: 2048, height: 1536 },
	"3:4": { width: 1536, height: 2048 },
	"2.35:1": { width: 2048, height: 872 },
};

function getImageSize(args: CliArgs): { width: number; height: number } | undefined {
	if (args.size) {
		const match = args.size.match(/^(\d+)[xX*](\d+)$/);
		if (match) return { width: parseInt(match[1]!, 10), height: parseInt(match[2]!, 10) };
	}

	if (args.aspectRatio) {
		const is2k = args.quality === "2k";
		const map = is2k ? SIZE_MAP_2K : SIZE_MAP;
		const mapped = map[args.aspectRatio];
		if (mapped) return mapped;
	}

	return undefined;
}

async function readImageAsDataUrl(p: string): Promise<string> {
	const buf = await readFile(p);
	const ext = path.extname(p).toLowerCase();
	let mimeType = "image/png";
	if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
	else if (ext === ".gif") mimeType = "image/gif";
	else if (ext === ".webp") mimeType = "image/webp";
	return `data:${mimeType};base64,${buf.toString("base64")}`;
}

type FalResponse = {
	images?: { url: string; content_type?: string }[];
	image?: { url: string };
	output?: unknown;
	request_id?: string;
	status?: string;
};

type FalStatusResponse = {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	response_url?: string;
};

function getPollInterval(elapsedMs: number): number {
	if (elapsedMs < 10_000) return 500;
	if (elapsedMs < 30_000) return 2000;
	return 4000;
}

async function pollForResult(apiKey: string, endpoint: string, requestId: string): Promise<FalResponse> {
	const queueBase = getQueueBaseUrl();
	const statusUrl = `${queueBase}/${endpoint}/requests/${requestId}/status`;
	const resultUrl = `${queueBase}/${endpoint}/requests/${requestId}`;
	const start = Date.now();

	while (Date.now() - start < POLL_MAX_MS) {
		const statusRes = await fetch(statusUrl, {
			headers: { Authorization: `Key ${apiKey}` },
		});

		if (!statusRes.ok) {
			const err = await statusRes.text();
			throw new Error(`fal.ai status poll error (${statusRes.status}): ${err}`);
		}

		const status = (await statusRes.json()) as FalStatusResponse;

		if (status.status === "COMPLETED") {
			const resultRes = await fetch(status.response_url || resultUrl, {
				headers: { Authorization: `Key ${apiKey}` },
			});
			if (!resultRes.ok) {
				const err = await resultRes.text();
				throw new Error(`fal.ai result fetch error (${resultRes.status}): ${err}`);
			}
			return (await resultRes.json()) as FalResponse;
		}

		if (status.status === "FAILED") {
			throw new Error("fal.ai generation failed");
		}

		const elapsed = Date.now() - start;
		await new Promise((r) => setTimeout(r, getPollInterval(elapsed)));
	}

	throw new Error(`fal.ai generation timed out after ${POLL_MAX_MS / 1000}s`);
}

function extractImageUrl(result: FalResponse): string {
	if (result.images && result.images.length > 0 && result.images[0]!.url) {
		return result.images[0]!.url;
	}

	if (result.image && result.image.url) {
		return result.image.url;
	}

	throw new Error(`Unexpected fal.ai response format: ${JSON.stringify(result).slice(0, 500)}`);
}

async function downloadImage(url: string): Promise<Uint8Array> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to download image from fal.ai: ${res.status}`);
	const buf = await res.arrayBuffer();
	return new Uint8Array(buf);
}

export async function generateImage(
	prompt: string,
	model: string,
	args: CliArgs
): Promise<Uint8Array> {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error(
			"FAL_KEY or FAL_API_KEY is required. Get one at https://fal.ai/dashboard/keys"
		);
	}

	const input: Record<string, unknown> = { prompt };

	const imageSize = getImageSize(args);
	if (imageSize) {
		input.image_size = imageSize;
	}

	if (args.n > 1) {
		input.num_images = args.n;
	}

	if (args.referenceImages.length > 0) {
		const isEditModel = model.includes("/edit");
		if (!isEditModel) {
			throw new Error(
				`Reference images require an edit model. Use --model fal-ai/nano-banana-pro/edit or similar edit endpoint.`
			);
		}
		const imageDataUrl = await readImageAsDataUrl(args.referenceImages[0]!);
		input.image_url = imageDataUrl;
	}

	const baseUrl = getBaseUrl();
	const url = `${baseUrl}/${model}`;

	console.log(`Generating image with fal.ai (${model})...`);

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Key ${apiKey}`,
		},
		body: JSON.stringify(input),
	});

	if (!res.ok) {
		const err = await res.text();

		if (res.status === 422 || res.status === 408) {
			console.log("Sync request failed, falling back to queue mode...");
			const queueBase = getQueueBaseUrl();
			const queueUrl = `${queueBase}/${model}`;

			const queueRes = await fetch(queueUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Key ${apiKey}`,
				},
				body: JSON.stringify(input),
			});

			if (!queueRes.ok) {
				const queueErr = await queueRes.text();
				throw new Error(`fal.ai queue API error (${queueRes.status}): ${queueErr}`);
			}

			const queueData = (await queueRes.json()) as { request_id: string };
			console.log("Queued, polling for result...");
			const result = await pollForResult(apiKey, model, queueData.request_id);
			const imageUrl = extractImageUrl(result);
			return downloadImage(imageUrl);
		}

		throw new Error(`fal.ai API error (${res.status}): ${err}`);
	}

	const result = (await res.json()) as FalResponse;

	if (result.request_id && result.status && result.status !== "COMPLETED") {
		console.log("Queued, polling for result...");
		const polledResult = await pollForResult(apiKey, model, result.request_id);
		const imageUrl = extractImageUrl(polledResult);
		return downloadImage(imageUrl);
	}

	const imageUrl = extractImageUrl(result);
	console.log("Generation completed.");
	return downloadImage(imageUrl);
}
