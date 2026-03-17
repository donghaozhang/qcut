/**
 * Gemini Embedding 2 provider.
 * Uses @google/genai SDK for native video + text embeddings.
 */

import fs from "node:fs";
import type {
	EmbeddingProvider,
	EmbeddingResult,
} from "./embedding-provider.js";
import { getDecryptedApiKeys } from "../api-key-handler.js";

const MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 768;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
	name = "gemini-embedding-2";

	private async getClient() {
		const { GoogleGenAI } = await import("@google/genai");
		const keys = await getDecryptedApiKeys();
		if (!keys.geminiApiKey) {
			throw new Error(
				"Gemini API key not configured. Set it in Settings → API Keys."
			);
		}
		return new GoogleGenAI({ apiKey: keys.geminiApiKey });
	}

	async embedText(text: string): Promise<EmbeddingResult> {
		const client = await this.getClient();
		const response = await client.models.embedContent({
			model: MODEL,
			contents: [text],
			config: { outputDimensionality: DIMENSIONS },
		});

		const vector = response.embeddings?.[0]?.values;
		if (!vector || vector.length === 0) {
			throw new Error("Gemini returned empty embedding for text");
		}

		return { vector, dimensions: vector.length };
	}

	async embedVideo(videoPath: string): Promise<EmbeddingResult> {
		const client = await this.getClient();
		const videoData = fs.readFileSync(videoPath);
		const base64 = videoData.toString("base64");

		const response = await client.models.embedContent({
			model: MODEL,
			contents: [
				{
					inlineData: {
						mimeType: "video/mp4",
						data: base64,
					},
				},
			],
			config: { outputDimensionality: DIMENSIONS },
		});

		const vector = response.embeddings?.[0]?.values;
		if (!vector || vector.length === 0) {
			throw new Error("Gemini returned empty embedding for video");
		}

		return { vector, dimensions: vector.length };
	}

	async isAvailable(): Promise<boolean> {
		try {
			const keys = await getDecryptedApiKeys();
			return !!keys.geminiApiKey;
		} catch {
			return false;
		}
	}
}
