import type { AudioStemName } from "@/types/timeline";
import {
	handleFalResponse,
	makeFalRequestQueued,
} from "@/lib/ai-video/core/fal-request";
import { convertSpeech } from "@/lib/ai-video/generators/speech";
import { CHATTERBOX_CONFIG } from "@/components/editor/media-panel/views/ai/constants/ai-constants";

const AI_DENOISE_ENDPOINT = "fal-ai/deepfilternet3";
const STEM_SEPARATION_ENDPOINT = "fal-ai/demucs";
const DEMUCS_STEMS = [
	"vocals",
	"drums",
	"bass",
	"other",
	"guitar",
	"piano",
] as const satisfies AudioStemName[];

export interface RemoteAudioFile {
	url: string;
	contentType?: string;
	fileName?: string;
	fileSize?: number;
	duration?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function parseRemoteAudioFile({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): RemoteAudioFile {
	const file = asRecord(value);
	if (!file || typeof file.url !== "string" || file.url.length === 0) {
		throw new Error(`${label} did not return an audio URL`);
	}
	return {
		url: file.url,
		contentType:
			typeof file.content_type === "string" ? file.content_type : undefined,
		fileName: typeof file.file_name === "string" ? file.file_name : undefined,
		fileSize: typeof file.file_size === "number" ? file.file_size : undefined,
		duration: typeof file.duration === "number" ? file.duration : undefined,
	};
}

async function queuedAudioRequest({
	endpoint,
	payload,
	signal,
	operation,
}: {
	endpoint: string;
	payload: Record<string, unknown>;
	signal?: AbortSignal;
	operation: string;
}): Promise<Record<string, unknown>> {
	const response = await makeFalRequestQueued(endpoint, payload, {
		proxyFirst: true,
		signal,
		timeout: 10 * 60 * 1000,
	});
	await handleFalResponse(response, operation);
	const body = asRecord(await response.json());
	if (!body) throw new Error(`${operation} returned an invalid response`);
	return asRecord(body.data) ?? body;
}

export async function enhanceSpeechAudio({
	audioUrl,
	signal,
}: {
	audioUrl: string;
	signal?: AbortSignal;
}): Promise<RemoteAudioFile> {
	const result = await queuedAudioRequest({
		endpoint: AI_DENOISE_ENDPOINT,
		payload: { audio_url: audioUrl, audio_format: "wav", bitrate: "192k" },
		signal,
		operation: "AI speech denoise",
	});
	return parseRemoteAudioFile({
		value: result.audio_file,
		label: "AI speech denoise",
	});
}

export async function separateAudioStems({
	audioUrl,
	signal,
}: {
	audioUrl: string;
	signal?: AbortSignal;
}): Promise<Partial<Record<AudioStemName, RemoteAudioFile>>> {
	const result = await queuedAudioRequest({
		endpoint: STEM_SEPARATION_ENDPOINT,
		payload: {
			audio_url: audioUrl,
			model: "htdemucs_6s",
			stems: DEMUCS_STEMS,
			shifts: 1,
			overlap: 0.25,
			output_format: "wav",
		},
		signal,
		operation: "Audio stem separation",
	});
	const stems: Partial<Record<AudioStemName, RemoteAudioFile>> = {};
	for (const stem of DEMUCS_STEMS) {
		if (!result[stem]) continue;
		stems[stem] = parseRemoteAudioFile({
			value: result[stem],
			label: `${stem} stem`,
		});
	}
	if (Object.keys(stems).length === 0) {
		throw new Error("Audio stem separation returned no stems");
	}
	return stems;
}

export async function convertClipVoice({
	sourceAudioUrl,
	targetVoiceAudioUrl,
	signal,
}: {
	sourceAudioUrl: string;
	targetVoiceAudioUrl?: string;
	signal?: AbortSignal;
}): Promise<RemoteAudioFile> {
	const result = await convertSpeech({
		endpoint: CHATTERBOX_CONFIG.S2S.ENDPOINT,
		sourceAudioUrl,
		targetVoiceAudioUrl,
		signal,
	});
	return {
		url: result.audioUrl,
		contentType: result.contentType,
		fileName: result.fileName,
		fileSize: result.fileSize,
		duration: result.duration,
	};
}

export const AUDIO_AI_ENDPOINTS = {
	denoise: AI_DENOISE_ENDPOINT,
	separation: STEM_SEPARATION_ENDPOINT,
	voiceConversion: CHATTERBOX_CONFIG.S2S.ENDPOINT,
} as const;
