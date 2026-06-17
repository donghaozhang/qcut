import { readFileSync } from "node:fs";
import * as path from "node:path";

export type OpenRouterMediaKind = "image" | "video";

export type OpenRouterContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } }
	| { type: "video_url"; video_url: { url: string } };

export function isRemoteUrl({ input }: { input: string }): boolean {
	return /^https?:\/\//i.test(input);
}

function getMediaMimeType({ input }: { input: string }): string {
	const ext = path.extname(input).toLowerCase();
	switch (ext) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		case ".gif":
			return "image/gif";
		case ".mp4":
			return "video/mp4";
		case ".mov":
			return "video/quicktime";
		case ".webm":
			return "video/webm";
		default:
			return "application/octet-stream";
	}
}

export function toOpenRouterMediaUrl({ input }: { input: string }): string {
	if (isRemoteUrl({ input }) || input.startsWith("data:")) return input;
	const media = readFileSync(input);
	const mimeType = getMediaMimeType({ input });
	return `data:${mimeType};base64,${media.toString("base64")}`;
}

export function buildOpenRouterSingleMediaContent({
	prompt,
	mediaUrl,
	mediaKind,
}: {
	prompt: string;
	mediaUrl: string;
	mediaKind: OpenRouterMediaKind;
}): OpenRouterContentPart[] {
	const mediaPart: OpenRouterContentPart =
		mediaKind === "video"
			? { type: "video_url", video_url: { url: mediaUrl } }
			: { type: "image_url", image_url: { url: mediaUrl } };
	return [{ type: "text", text: prompt }, mediaPart];
}

export function buildOpenRouterMultiImageContent({
	prompt,
	imageUrls,
}: {
	prompt: string;
	imageUrls: string[];
}): OpenRouterContentPart[] {
	return [
		{ type: "text", text: prompt },
		...imageUrls.map((url) => ({
			type: "image_url" as const,
			image_url: { url },
		})),
	];
}
