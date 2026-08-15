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

	/** Media-store id of a project image used as the avatar figure. */
	figureMediaId: string | null;
	setFigureMediaId: (figureMediaId: string | null) => void;

	/** Id of a bundled portrait preset used as the avatar figure. */
	figurePresetId: string | null;
	setFigurePresetId: (figurePresetId: string | null) => void;

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

interface FigureSelection {
	figureMediaId: string | null;
	figurePresetId: string | null;
}

/** True when either figure source is selected. */
export function hasDigitalHumanFigure(figure: FigureSelection): boolean {
	return Boolean(figure.figureMediaId || figure.figurePresetId);
}

/**
 * Clearing the last figure invalidates the voice step's prerequisite, so the
 * wizard falls back rather than stranding the user on a step they can no longer
 * satisfy.
 */
function stepAfterFigureChange({
	figure,
	state,
}: {
	figure: FigureSelection;
	state: { step: DigitalHumanStep };
}): DigitalHumanStep {
	if (state.step === "voice" && !hasDigitalHumanFigure(figure)) return "figure";
	return state.step;
}

const initialState = {
	step: "figure" as DigitalHumanStep,
	figureMediaId: null,
	figurePresetId: null,
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
		if (step === "voice" && !hasDigitalHumanFigure(get())) return;
		set({ step });
	},

	// A figure comes either from a bundled preset or from a project image, never
	// both — picking one clears the other so there is a single answer to "which
	// picture is this avatar".
	setFigureMediaId: (figureMediaId) =>
		set((state) => {
			const figure = {
				figureMediaId,
				figurePresetId: figureMediaId === null ? state.figurePresetId : null,
			};
			return { ...figure, step: stepAfterFigureChange({ figure, state }) };
		}),
	setFigurePresetId: (figurePresetId) =>
		set((state) => {
			const figure = {
				figurePresetId,
				figureMediaId: figurePresetId === null ? state.figureMediaId : null,
			};
			return { ...figure, step: stepAfterFigureChange({ figure, state }) };
		}),
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
