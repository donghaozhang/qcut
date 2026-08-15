import { create } from "zustand";

/**
 * Framing presets, mirroring Jianying's 景别 row. These describe how tightly the
 * generated figure is cropped, not which model produces it.
 */
export type DigitalHumanShotSize = "wide" | "medium" | "close" | "closeup";

/** The panel is a two-step wizard: pick the figure, then write the voiceover. */
export type DigitalHumanStep = "figure" | "voice";

interface DigitalHumanState {
	step: DigitalHumanStep;
	setStep: (step: DigitalHumanStep) => void;

	/** Media-store id of the image used as the avatar figure. */
	figureMediaId: string | null;
	setFigureMediaId: (figureMediaId: string | null) => void;

	shotSize: DigitalHumanShotSize;
	setShotSize: (shotSize: DigitalHumanShotSize) => void;

	/** CSS colour for a flat background, or null when no colour is applied. */
	backgroundColor: string | null;
	/** Media-store id of the image used as the background, or null. */
	backgroundMediaId: string | null;
	setBackgroundColor: (backgroundColor: string | null) => void;
	setBackgroundMediaId: (backgroundMediaId: string | null) => void;
	clearBackground: () => void;

	script: string;
	setScript: (script: string) => void;

	voiceModel: string;
	setVoiceModel: (voiceModel: string) => void;

	reset: () => void;
}

const DEFAULT_VOICE_MODEL = "chatterbox_tts";

const initialState = {
	step: "figure" as DigitalHumanStep,
	figureMediaId: null,
	shotSize: "medium" as DigitalHumanShotSize,
	backgroundColor: null,
	backgroundMediaId: null,
	script: "",
	voiceModel: DEFAULT_VOICE_MODEL,
};

export const useDigitalHumanStore = create<DigitalHumanState>((set, get) => ({
	...initialState,

	// The voice step requires a selected figure; enforce it here so callers
	// other than the wizard buttons cannot skip the prerequisite.
	setStep: (step) => {
		if (step === "voice" && !get().figureMediaId) return;
		set({ step });
	},
	setFigureMediaId: (figureMediaId) =>
		set((state) => ({
			figureMediaId,
			step:
				figureMediaId === null && state.step === "voice"
					? "figure"
					: state.step,
		})),
	setShotSize: (shotSize) => set({ shotSize }),

	// A colour and an image cannot both be the background, so selecting one
	// clears the other rather than leaving the panel with two live selections
	// and the renderer having to guess which wins.
	setBackgroundColor: (backgroundColor) =>
		set({ backgroundColor, backgroundMediaId: null }),
	setBackgroundMediaId: (backgroundMediaId) =>
		set({ backgroundMediaId, backgroundColor: null }),
	clearBackground: () =>
		set({ backgroundColor: null, backgroundMediaId: null }),

	setScript: (script) => set({ script }),
	setVoiceModel: (voiceModel) => set({ voiceModel }),

	reset: () => set({ ...initialState }),
}));
