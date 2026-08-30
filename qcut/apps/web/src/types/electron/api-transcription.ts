/**
 * Transcription and filler-word analysis sub-interfaces for ElectronAPI.
 */

import type { ElevenLabsTranscribeResult } from "./transcription";

export interface ElectronTranscriptionOps {
	transcribe: {
		/** Gemini-based transcription (segments) */
		transcribe: (request: { audioPath: string; language?: string }) => Promise<{
			text: string;
			segments: Array<{
				id: number;
				seek: number;
				start: number;
				end: number;
				text: string;
				tokens: number[];
				temperature: number;
				avg_logprob: number;
				compression_ratio: number;
				no_speech_prob: number;
			}>;
			language: string;
		}>;
		cancel: (id: string) => Promise<{
			success: boolean;
			message?: string;
			error?: string;
		}>;

		/** ElevenLabs Scribe v2 transcription via FAL AI */
		elevenlabs: (options: {
			audioPath: string;
			language?: string;
			diarize?: boolean;
			tagAudioEvents?: boolean;
			keyterms?: string[];
		}) => Promise<ElevenLabsTranscribeResult>;

		/** Upload file to FAL storage */
		uploadToFal: (filePath: string) => Promise<{ url: string }>;
	};

	analyzeFillers: (options: {
		words: Array<{
			id: string;
			text: string;
			start: number;
			end: number;
			type: "word" | "spacing";
			speaker_id?: string;
		}>;
		languageCode: string;
	}) => Promise<{
		filteredWordIds: Array<{
			id: string;
			reason: string;
			scope?: "word" | "sentence";
		}>;
		provider?: "openrouter" | "gemini" | "anthropic" | "pattern";
	}>;
}
