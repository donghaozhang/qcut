import type { TranslationKey } from "@/lib/i18n";

export const TEXT_ANIMATION_PHASES = ["entrance", "exit", "loop"] as const;

export type TextAnimationPhase = (typeof TEXT_ANIMATION_PHASES)[number];

export type TextAnimationPreviewKind =
	| "none"
	| "fade"
	| "typewriter"
	| "slide-up"
	| "slide-right-blur"
	| "rotate-fly"
	| "scale"
	| "orbit"
	| "bounce-up"
	| "pop"
	| "laser"
	| "heart-bounce"
	| "rotate"
	| "slide-down"
	| "slide-right"
	| "blur"
	| "pulse"
	| "float"
	| "bounce"
	| "heartbeat"
	| "shimmer"
	| "wave"
	| "flicker"
	| "breathe";

export interface TextAnimationPresetDefinition {
	id: string;
	phase: TextAnimationPhase;
	nameKey: TranslationKey;
	previewKind: TextAnimationPreviewKind;
	defaultDuration: number;
	defaultDelay: number;
	defaultIntensity: number;
	searchTerms: readonly string[];
}
