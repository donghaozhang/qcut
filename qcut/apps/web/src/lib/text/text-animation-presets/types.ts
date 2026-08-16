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
	| "flip"
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
	| "breathe"
	| "ring-orbit"
	| "jitter"
	| "vortex"
	| "pendulum"
	| "zoom-each"
	| "wave-squeeze"
	| "fold"
	| "arc-up"
	| "spiral-down"
	| "elastic-out"
	| "fly-up-out"
	| "flicker-scatter"
	| "random-fly-out"
	| "shrink-shake"
	| "particle-shatter"
	| "confetti-burst"
	| "lucky-bag"
	| "color-bounce"
	| "glow-pulse"
	| "petal-wipe";

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
