import { create } from "zustand";
import { toast } from "sonner";
import { generateUUID } from "@/lib/utils";
import { EFFECTS_ENABLED } from "@/config/features";
import type {
	EffectPreset,
	EffectCategory,
	EffectParameters,
	EffectInstance,
	EffectType,
	AnimatedParameter,
} from "@/types/effects";
import {
	processEffectChain,
	layerEffectChains,
	createEffectChain,
	type EffectChain,
} from "@/lib/effects/effects-chaining";
import { inferEffectType, stripCopySuffix } from "@/lib/utils/effects";
import { collectTimelineEffectState } from "@/lib/effects/timeline-effect-state";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineTrack } from "@/types/timeline";
import {
	FFmpegFilterChain,
	type EffectParameters as FFmpegEffectParameters,
} from "@/lib/ffmpeg/ffmpeg-filter-chain";

// Helper function to merge effect parameters for FFmpeg filter chains
function mergeFFmpegEffectParameters(
	...paramArrays: EffectParameters[]
): FFmpegEffectParameters {
	const merged: FFmpegEffectParameters = {};

	// Define additive parameters that should be summed, not overridden
	const additiveParams = ["brightness", "contrast", "saturation", "hue"];

	for (const params of paramArrays) {
		// Brightness - additive parameter
		if (params.brightness !== undefined) {
			merged.brightness = (merged.brightness || 0) + params.brightness;
		}

		// Contrast - additive parameter
		if (params.contrast !== undefined) {
			merged.contrast = (merged.contrast || 0) + params.contrast;
		}

		// Saturation - additive parameter
		if (params.saturation !== undefined) {
			merged.saturation = (merged.saturation || 0) + params.saturation;
		}

		// Hue - additive parameter
		if (params.hue !== undefined) {
			merged.hue = (merged.hue || 0) + params.hue;
		}

		// Blur - override parameter (last value wins)
		if (params.blur !== undefined) {
			merged.blur = params.blur;
		}

		// Grayscale - override parameter (last value wins)
		if (params.grayscale !== undefined) {
			merged.grayscale = params.grayscale;
		}

		// Invert - override parameter (last value wins)
		if (params.invert !== undefined) {
			merged.invert = params.invert;
		}
	}

	// Clamp additive values to valid ranges after merging
	if (merged.brightness !== undefined) {
		merged.brightness = Math.max(-100, Math.min(100, merged.brightness));
	}
	if (merged.contrast !== undefined) {
		merged.contrast = Math.max(-100, Math.min(100, merged.contrast));
	}
	if (merged.saturation !== undefined) {
		merged.saturation = Math.max(-100, Math.min(200, merged.saturation));
	}
	if (merged.hue !== undefined) {
		merged.hue = merged.hue % 360; // Keep hue within 0-360 degree range
	}

	return merged;
}

// Predefined effect presets
const EFFECT_PRESETS: Array<EffectPreset & { isImplemented?: boolean }> = [
	{
		id: "brightness-increase",
		name: "Brighten",
		description: "Increase brightness",
		category: "basic",
		icon: "☀️",
		parameters: { brightness: 20 },
		isImplemented: true,
	},
	{
		id: "brightness-decrease",
		name: "Darken",
		description: "Decrease brightness",
		category: "basic",
		icon: "🌙",
		parameters: { brightness: -20 },
		isImplemented: true,
	},
	{
		id: "contrast-high",
		name: "High Contrast",
		description: "Increase contrast",
		category: "basic",
		icon: "◐",
		parameters: { contrast: 30 },
		isImplemented: true,
	},
	{
		id: "saturation-boost",
		name: "Vibrant",
		description: "Boost color saturation",
		category: "color",
		icon: "🎨",
		parameters: { saturation: 40 },
		isImplemented: true,
	},
	{
		id: "desaturate",
		name: "Muted",
		description: "Reduce color saturation",
		category: "color",
		icon: "🔇",
		parameters: { saturation: -30 },
		isImplemented: true,
	},
	{
		id: "sepia",
		name: "Sepia",
		description: "Classic sepia tone",
		category: "vintage",
		icon: "📜",
		parameters: { sepia: 80 },
		isImplemented: true,
	},
	{
		id: "grayscale",
		name: "Black & White",
		description: "Convert to grayscale",
		category: "artistic",
		icon: "⚫",
		parameters: { grayscale: 100 },
		isImplemented: true,
	},
	{
		id: "vintage-film",
		name: "Vintage Film",
		description: "Old film look",
		category: "vintage",
		icon: "🎞️",
		parameters: { vintage: 70, grain: 20, vignette: 30 },
		isImplemented: false,
	},
	{
		id: "dramatic",
		name: "Dramatic",
		description: "High drama effect",
		category: "cinematic",
		icon: "🎭",
		parameters: { dramatic: 60, contrast: 20 },
		isImplemented: false,
	},
	{
		id: "warm-filter",
		name: "Warm",
		description: "Warm color tone",
		category: "color",
		icon: "🔥",
		parameters: { warm: 50 },
		isImplemented: false,
	},
	{
		id: "cool-filter",
		name: "Cool",
		description: "Cool color tone",
		category: "color",
		icon: "❄️",
		parameters: { cool: 50 },
		isImplemented: false,
	},
	{
		id: "chromatic",
		name: "Chromatic",
		description: "Chromatic aberration effect",
		category: "distortion",
		icon: "🌈",
		parameters: { chromatic: 50 },
		isImplemented: false,
	},
	{
		id: "radiance",
		name: "Radiance",
		description: "Soft glow and radiance effect",
		category: "artistic",
		icon: "✨",
		parameters: { radiance: 60 },
		isImplemented: false,
	},
	{
		id: "cinematic",
		name: "Cinematic",
		description: "Movie-like look",
		category: "cinematic",
		icon: "🎬",
		parameters: { cinematic: 70, vignette: 20 },
		isImplemented: false,
	},
	{
		id: "blur-soft",
		name: "Soft Blur",
		description: "Gentle blur effect",
		category: "distortion",
		icon: "🌫️",
		parameters: { blur: 2 },
		isImplemented: true,
	},
	{
		id: "sharpen",
		name: "Sharpen",
		description: "Enhance edges",
		category: "basic",
		icon: "🔪",
		parameters: { sharpen: 50 },
		isImplemented: false,
	},
	{
		id: "emboss",
		name: "Emboss",
		description: "3D emboss effect",
		category: "artistic",
		icon: "🏔️",
		parameters: { emboss: 70 },
		isImplemented: false,
	},
	{
		id: "edge-detect",
		name: "Edge Detection",
		description: "Highlight edges",
		category: "artistic",
		icon: "📐",
		parameters: { edge: 80 },
		isImplemented: false,
	},
	{
		id: "pixelate",
		name: "Pixelate",
		description: "Pixelation effect",
		category: "distortion",
		icon: "🧩",
		parameters: { pixelate: 10 },
		isImplemented: false,
	},
	{
		id: "vignette",
		name: "Vignette",
		description: "Darken edges",
		category: "cinematic",
		icon: "⭕",
		parameters: { vignette: 50 },
		isImplemented: false,
	},
	{
		id: "grain",
		name: "Film Grain",
		description: "Add film grain",
		category: "vintage",
		icon: "🌾",
		parameters: { grain: 30 },
		isImplemented: false,
	},
	{
		id: "invert",
		name: "Invert",
		description: "Invert colors",
		category: "artistic",
		icon: "🔄",
		parameters: { invert: 100 },
		isImplemented: true,
	},
	// Distortion effects
	{
		id: "wave",
		name: "Wave",
		description: "Wave distortion",
		category: "distortion",
		icon: "🌊",
		parameters: { wave: 50, waveFrequency: 3, waveAmplitude: 20 },
		isImplemented: false,
	},
	{
		id: "twist",
		name: "Twist",
		description: "Twirl distortion",
		category: "distortion",
		icon: "🌀",
		parameters: { twist: 60, twistAngle: 180 },
		isImplemented: false,
	},
	{
		id: "bulge",
		name: "Bulge",
		description: "Bulge distortion",
		category: "distortion",
		icon: "🔵",
		parameters: { bulge: 50, bulgeRadius: 200 },
		isImplemented: false,
	},
	{
		id: "fisheye",
		name: "Fisheye",
		description: "Fisheye lens effect",
		category: "distortion",
		icon: "👁️",
		parameters: { fisheye: 70, fisheyeStrength: 2 },
		isImplemented: false,
	},
	// Artistic effects
	{
		id: "oil-painting",
		name: "Oil Painting",
		description: "Oil painting effect",
		category: "artistic",
		icon: "🎨",
		parameters: { oilPainting: 60, brushSize: 5 },
		isImplemented: false,
	},
	{
		id: "watercolor",
		name: "Watercolor",
		description: "Watercolor painting",
		category: "artistic",
		icon: "💧",
		parameters: { watercolor: 70, wetness: 50 },
		isImplemented: false,
	},
	{
		id: "pencil-sketch",
		name: "Pencil Sketch",
		description: "Pencil drawing effect",
		category: "artistic",
		icon: "✏️",
		parameters: { pencilSketch: 80, strokeWidth: 2 },
		isImplemented: false,
	},
	{
		id: "halftone",
		name: "Halftone",
		description: "Comic book dots",
		category: "artistic",
		icon: "⚫",
		parameters: { halftone: 50, dotSize: 4 },
		isImplemented: false,
	},
	// Transition effects
	{
		id: "fade-in",
		name: "Fade In",
		description: "Fade in transition",
		category: "transition",
		icon: "⬆️",
		parameters: { fadeIn: 100 },
	},
	{
		id: "fade-out",
		name: "Fade Out",
		description: "Fade out transition",
		category: "transition",
		icon: "⬇️",
		parameters: { fadeOut: 100 },
	},
	{
		id: "dissolve",
		name: "Dissolve",
		description: "Dissolve transition",
		category: "transition",
		icon: "💫",
		parameters: { dissolve: 50, dissolveProgress: 50 },
		isImplemented: false,
	},
	{
		id: "wipe",
		name: "Wipe",
		description: "Wipe transition",
		category: "transition",
		icon: "➡️",
		parameters: { wipe: 100, wipeDirection: "right", wipeProgress: 50 },
		isImplemented: false,
	},
	// Composite effects
	{
		id: "overlay",
		name: "Overlay",
		description: "Overlay blend",
		category: "composite",
		icon: "🔲",
		parameters: { overlay: 50, overlayOpacity: 75, blendMode: "overlay" },
		isImplemented: false,
	},
	{
		id: "multiply",
		name: "Multiply",
		description: "Multiply blend",
		category: "composite",
		icon: "✖️",
		parameters: { multiply: 100, blendMode: "multiply" },
		isImplemented: false,
	},
	{
		id: "screen",
		name: "Screen",
		description: "Screen blend",
		category: "composite",
		icon: "📺",
		parameters: { screen: 100, blendMode: "screen" },
		isImplemented: false,
	},
	{
		id: "color-dodge",
		name: "Color Dodge",
		description: "Color dodge blend",
		category: "composite",
		icon: "💡",
		parameters: { colorDodge: 80, blendMode: "color-dodge" },
		isImplemented: false,
	},
];

interface EffectsStore {
	presets: EffectPreset[];
	activeEffects: Map<string, EffectInstance[]>; // elementId -> effects
	effectChains: Map<string, EffectChain[]>; // elementId -> chains
	selectedCategory: EffectCategory | "all";
	selectedEffect: EffectInstance | null;
	hydrateFromTimeline: (tracks: TimelineTrack[]) => void;

	// Actions
	applyEffect: (elementId: string, preset: EffectPreset) => void;
	removeEffect: (elementId: string, effectId: string) => void;
	updateEffectParameters: (
		elementId: string,
		effectId: string,
		parameters: EffectParameters
	) => void;
	toggleEffect: (elementId: string, effectId: string) => void;
	clearEffects: (elementId: string) => void;
	setSelectedCategory: (category: EffectCategory | "all") => void;
	setSelectedEffect: (effect: EffectInstance | null) => void;
	getElementEffects: (elementId: string) => EffectInstance[];
	getEffectsForElement: (elementId: string) => EffectInstance[]; // Alias for backward compatibility
	duplicateEffect: (elementId: string, effectId: string) => void;
	reorderEffects: (elementId: string, effectIds: string[]) => void;
	resetEffectToDefaults: (elementId: string, effectId: string) => void;
	resetEffectParameters: (elementId: string, effectId: string) => void;
	updateEffectAnimations: (
		elementId: string,
		effectId: string,
		animation: AnimatedParameter | null
	) => void;

	// Effect Chaining
	createChain: (elementId: string, name: string, effectIds: string[]) => void;
	removeChain: (elementId: string, chainId: string) => void;
	updateChainBlendMode: (
		elementId: string,
		chainId: string,
		blendMode: EffectChain["blendMode"]
	) => void;
	toggleEffectInChain: (
		elementId: string,
		chainId: string,
		effectId: string
	) => void;
	getProcessedEffects: (
		elementId: string,
		currentTime?: number
	) => EffectParameters;
	moveEffectInChain: (
		elementId: string,
		effectId: string,
		newIndex: number
	) => void;

	// FFmpeg Filter Chain Support
	getFFmpegFilterChain: (elementId: string) => string;
}

let hydratingFromTimeline = false;

export const useEffectsStore = create<EffectsStore>((set, get) => ({
	presets: EFFECT_PRESETS,
	activeEffects: new Map(),
	effectChains: new Map(),
	selectedCategory: "all",
	selectedEffect: null,
	hydrateFromTimeline: (tracks) => {
		const timelineState = collectTimelineEffectState({ tracks });
		hydratingFromTimeline = true;
		set(timelineState);
		hydratingFromTimeline = false;
	},

	applyEffect: (elementId, preset) => {
		console.log(
			`🎨 EFFECTS STORE: Applying effect "${preset.name}" to element ${elementId}`
		);

		if (!EFFECTS_ENABLED) {
			console.warn(
				`❌ EFFECTS STORE: Effects disabled - cannot apply ${preset.name}`
			);
			toast.error("Effects are currently disabled");
			return;
		}

		const newEffect: EffectInstance = {
			id: generateUUID(),
			name: preset.name,
			effectType: inferEffectType(preset.parameters),
			parameters: { ...preset.parameters },
			duration: 0, // Will be set based on element duration
			enabled: true,
		};

		set((state) => {
			const effects = state.activeEffects.get(elementId) || [];
			const newMap = new Map(state.activeEffects);
			newMap.set(elementId, [...effects, newEffect]);
			return { activeEffects: newMap };
		});

		console.log(
			`✅ EFFECTS STORE: Successfully applied effect "${preset.name}" (ID: ${newEffect.id}) to element ${elementId}`
		);
		toast.success(`Applied ${preset.name} effect`);
	},

	removeEffect: (elementId, effectId) => {
		console.log(
			`🗑️ EFFECTS STORE: Removing effect ${effectId} from element ${elementId}`
		);

		set((state) => {
			const effects = state.activeEffects.get(elementId) || [];
			const effectToRemove = effects.find((e) => e.id === effectId);
			const newEffects = effects.filter((e) => e.id !== effectId);
			const newMap = new Map(state.activeEffects);

			if (newEffects.length === 0) {
				newMap.delete(elementId);
				console.log(
					`🧹 EFFECTS STORE: Removed all effects from element ${elementId}`
				);
			} else {
				newMap.set(elementId, newEffects);
				console.log(
					`✅ EFFECTS STORE: Removed effect "${effectToRemove?.name || "Unknown"}" from element ${elementId}. ${newEffects.length} effects remaining.`
				);
			}

			return { activeEffects: newMap };
		});

		toast.info("Effect removed");
	},

	updateEffectParameters: (elementId, effectId, parameters) => {
		set((state) => {
			const effects = state.activeEffects.get(elementId) || [];
			const newEffects = effects.map((e) =>
				e.id === effectId
					? { ...e, parameters: { ...e.parameters, ...parameters } }
					: e
			);
			const newMap = new Map(state.activeEffects);
			newMap.set(elementId, newEffects);
			return { activeEffects: newMap };
		});
	},

	toggleEffect: (elementId, effectId) => {
		set((state) => {
			const effects = state.activeEffects.get(elementId) || [];
			const newEffects = effects.map((e) =>
				e.id === effectId ? { ...e, enabled: !e.enabled } : e
			);
			const newMap = new Map(state.activeEffects);
			newMap.set(elementId, newEffects);
			return { activeEffects: newMap };
		});
	},

	clearEffects: (elementId) => {
		set((state) => {
			const newMap = new Map(state.activeEffects);
			newMap.delete(elementId);
			return { activeEffects: newMap };
		});

		toast.info("All effects cleared");
	},

	setSelectedCategory: (category) => {
		set({ selectedCategory: category });
	},

	setSelectedEffect: (effect) => {
		set({ selectedEffect: effect });
	},

	getElementEffects: (elementId) => {
		const effects = get().activeEffects.get(elementId) || [];
		return effects;
	},

	// Alias for backward compatibility with external callers
	getEffectsForElement: (elementId) => {
		return get().activeEffects.get(elementId) || [];
	},

	duplicateEffect: (elementId, effectId) => {
		const effects = get().activeEffects.get(elementId) || [];
		const effectToDuplicate = effects.find((e) => e.id === effectId);

		if (effectToDuplicate) {
			const duplicatedEffect: EffectInstance = {
				...effectToDuplicate,
				id: generateUUID(),
				name: `${effectToDuplicate.name} (Copy)`,
			};

			set((state) => {
				const newEffects = [...effects, duplicatedEffect];
				const newMap = new Map(state.activeEffects);
				newMap.set(elementId, newEffects);
				return { activeEffects: newMap };
			});

			toast.success("Effect duplicated");
		}
	},

	reorderEffects: (elementId, effectIds) => {
		const effects = get().activeEffects.get(elementId) || [];
		const reorderedEffects = effectIds
			.map((id) => effects.find((e) => e.id === id))
			.filter((e): e is EffectInstance => e !== undefined);

		if (reorderedEffects.length === effects.length) {
			set((state) => {
				const newMap = new Map(state.activeEffects);
				newMap.set(elementId, reorderedEffects);
				return { activeEffects: newMap };
			});
		}
	},

	resetEffectToDefaults: (elementId, effectId) => {
		const effects = get().activeEffects.get(elementId) || [];
		const effectIndex = effects.findIndex((e) => e.id === effectId);

		if (effectIndex !== -1) {
			const effect = effects[effectIndex];
			// Find the original preset (strip "(Copy)" and fallback by inferred type)
			const baseName = stripCopySuffix(effect.name);
			const preset =
				EFFECT_PRESETS.find((p) => p.name === baseName) ??
				EFFECT_PRESETS.find(
					(p) => inferEffectType(p.parameters) === effect.effectType
				);

			if (preset) {
				const resetEffect: EffectInstance = {
					...effect,
					parameters: { ...preset.parameters },
				};

				const newEffects = [...effects];
				newEffects[effectIndex] = resetEffect;

				set((state) => {
					const newMap = new Map(state.activeEffects);
					newMap.set(elementId, newEffects);
					return { activeEffects: newMap };
				});

				toast.success("Effect reset to defaults");
			}
		}
	},

	resetEffectParameters: (elementId, effectId) => {
		// This is an alias for resetEffectToDefaults
		get().resetEffectToDefaults(elementId, effectId);
	},

	updateEffectAnimations: (elementId, effectId, animation) => {
		const effects = get().activeEffects.get(elementId) || [];
		const effectIndex = effects.findIndex((e) => e.id === effectId);

		if (effectIndex !== -1) {
			const effect = effects[effectIndex];
			const newEffects = [...effects];

			if (animation) {
				// Add or update animation with proper immutability
				const existing = effect.animations ? [...effect.animations] : [];
				const idx = existing.findIndex(
					(a) => a.parameter === animation.parameter
				);
				const nextAnimations =
					idx !== -1
						? existing.map((a, i) => (i === idx ? animation : a))
						: [...existing, animation];

				newEffects[effectIndex] = {
					...effect,
					animations: nextAnimations,
				};
			} else {
				// Remove all animations
				newEffects[effectIndex] = {
					...effect,
					animations: undefined,
				};
			}

			set((state) => {
				const newMap = new Map(state.activeEffects);
				newMap.set(elementId, newEffects);
				return { activeEffects: newMap };
			});
		}
	},

	// Effect Chaining Methods
	createChain: (elementId, name, effectIds) => {
		const chain = createEffectChain(
			name,
			effectIds,
			get().activeEffects.get(elementId) ?? []
		);

		set((state) => {
			const chains = state.effectChains.get(elementId) || [];
			const newMap = new Map(state.effectChains);
			newMap.set(elementId, [...chains, chain]);
			return { effectChains: newMap };
		});

		toast.success(`Created effect chain: ${name}`);
	},

	removeChain: (elementId, chainId) => {
		set((state) => {
			const chains = state.effectChains.get(elementId) || [];
			const newChains = chains.filter((c) => c.id !== chainId);
			const newMap = new Map(state.effectChains);

			if (newChains.length === 0) {
				newMap.delete(elementId);
			} else {
				newMap.set(elementId, newChains);
			}

			return { effectChains: newMap };
		});

		toast.info("Effect chain removed");
	},

	updateChainBlendMode: (elementId, chainId, blendMode) => {
		set((state) => {
			const chains = state.effectChains.get(elementId) || [];
			const newChains = chains.map((c) =>
				c.id === chainId ? { ...c, blendMode } : c
			);
			const newMap = new Map(state.effectChains);
			newMap.set(elementId, newChains);
			return { effectChains: newMap };
		});
	},

	toggleEffectInChain: (elementId, chainId, effectId) => {
		set((state) => {
			const chains = state.effectChains.get(elementId) || [];
			const newChains = chains.map((chain) => {
				if (chain.id === chainId) {
					const newEffects = chain.effects.map((effect) =>
						effect.id === effectId
							? { ...effect, enabled: !effect.enabled }
							: effect
					);
					return { ...chain, effects: newEffects };
				}
				return chain;
			});
			const newMap = new Map(state.effectChains);
			newMap.set(elementId, newChains);
			return { effectChains: newMap };
		});
	},

	getProcessedEffects: (elementId, currentTime) => {
		const chains = get().effectChains.get(elementId);
		const effects = get().activeEffects.get(elementId);

		// If there are chains, use chain processing
		if (chains && chains.length > 0) {
			return layerEffectChains(chains, currentTime);
		}

		// Otherwise, process regular effects
		if (effects && effects.length > 0) {
			return processEffectChain(effects, currentTime);
		}

		return {};
	},

	moveEffectInChain: (elementId, effectId, newIndex) => {
		const effects = get().activeEffects.get(elementId) || [];
		const effectIndex = effects.findIndex((e) => e.id === effectId);

		if (effectIndex !== -1 && effectIndex !== newIndex) {
			const newEffects = [...effects];
			const [movedEffect] = newEffects.splice(effectIndex, 1);
			newEffects.splice(newIndex, 0, movedEffect);

			set((state) => {
				const newMap = new Map(state.activeEffects);
				newMap.set(elementId, newEffects);
				return { activeEffects: newMap };
			});
		}
	},

	// FFmpeg Filter Chain Implementation
	getFFmpegFilterChain: (elementId) => {
		const effects = get().getElementEffects(elementId);
		const enabledEffects = effects.filter((e) => e.enabled);

		if (enabledEffects.length === 0) {
			console.log(
				`🎨 EFFECTS STORE: No enabled effects for element ${elementId} - returning empty filter chain`
			);
			return "";
		}

		// Merge all effect parameters
		const mergedParams = mergeFFmpegEffectParameters(
			...enabledEffects.map((e) => e.parameters)
		);

		const filterChain = FFmpegFilterChain.fromEffectParameters(mergedParams);
		return filterChain;
	},
}));

useEffectsStore.subscribe((state, previous) => {
	if (hydratingFromTimeline) return;
	const elementIds = new Set([
		...state.activeEffects.keys(),
		...previous.activeEffects.keys(),
		...state.effectChains.keys(),
		...previous.effectChains.keys(),
	]);
	const timeline = useTimelineStore.getState();
	for (const elementId of elementIds) {
		if (
			state.activeEffects.get(elementId) ===
				previous.activeEffects.get(elementId) &&
			state.effectChains.get(elementId) === previous.effectChains.get(elementId)
		) {
			continue;
		}
		timeline.setElementEffectState({
			elementId,
			effects: state.activeEffects.get(elementId) ?? [],
			effectChains: state.effectChains.get(elementId) ?? [],
			pushHistory: false,
		});
	}
});

useTimelineStore.subscribe((state, previous) => {
	if (state._tracks === previous._tracks) return;
	useEffectsStore.getState().hydrateFromTimeline(state._tracks);
});

useEffectsStore
	.getState()
	.hydrateFromTimeline(useTimelineStore.getState()._tracks);
