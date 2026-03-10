// Domain types re-exported from @qcut/editor-core
export type {
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionRequest,
	TranscriptionError,
	CaptionSegment,
	CaptionTrackData,
	TranscriptionStatus,
	TranscriptionProgress,
	CaptionFormat,
	CaptionExportOptions,
} from "@qcut/editor-core";

// ---------------------------------------------------------------------------
// UI-specific types (stay in apps/web, not in editor-core)
// ---------------------------------------------------------------------------

export type Language = {
	code: string;
	name: string;
	nativeName: string;
	flag: string;
};

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
