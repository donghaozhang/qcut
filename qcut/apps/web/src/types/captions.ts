// Caption/Transcription related types

export type TranscriptionSegment = {
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
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
};

export type TranscriptionRequest = {
  filename: string;
  language?: string;
  decryptionKey?: string;
  iv?: string;
};

export type TranscriptionError = {
  error: string;
  message?: string;
  details?: unknown;
};

// Caption element for timeline integration
export type CaptionSegment = {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  confidence?: number;
};

// Caption track data
export type CaptionTrackData = {
  id: string;
  name: string;
  language: string;
  segments: CaptionSegment[];
  source: "transcription" | "manual" | "imported";
  createdAt: string;
  updatedAt: string;
};

// Language selection
export type Language = {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
};

// Common languages for transcription
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "auto", name: "Auto-detect", nativeName: "Auto-detect", flag: "🌐" },
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
];

// Transcription process status
export type TranscriptionStatus =
  | "idle"
  | "preparing"
  | "uploading"
  | "processing"
  | "downloading"
  | "completed"
  | "error";

export type TranscriptionProgress = {
  status: TranscriptionStatus;
  progress: number; // 0-100
  message: string;
  estimatedTimeRemaining?: number; // seconds
};

// Export formats for captions
export type CaptionFormat = "srt" | "vtt" | "ass" | "ttml";

export type CaptionExportOptions = {
  format: CaptionFormat;
  includeBurnIn: boolean;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  position?: "top" | "bottom" | "center";
};
