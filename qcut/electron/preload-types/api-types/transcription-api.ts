import type {
	CancelResult,
	AIFillerWordItem,
	AnalyzeFillersResult,
} from "../supporting-types";

/** Transcription and filler-word analysis. */
export interface TranscriptionAPI {
	transcribe: {
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
		cancel: (id: string) => Promise<CancelResult>;
		elevenlabs: (options: {
			audioPath: string;
			language?: string;
			diarize?: boolean;
			tagAudioEvents?: boolean;
			keyterms?: string[];
		}) => Promise<{
			text: string;
			language_code: string;
			language_probability: number;
			words: Array<{
				text: string;
				start: number;
				end: number;
				type: "word" | "spacing" | "audio_event" | "punctuation";
				speaker_id: string | null;
			}>;
		}>;
		uploadToFal: (filePath: string) => Promise<{ url: string }>;
	};

	analyzeFillers: (options: {
		words: AIFillerWordItem[];
		languageCode: string;
	}) => Promise<AnalyzeFillersResult>;
}
