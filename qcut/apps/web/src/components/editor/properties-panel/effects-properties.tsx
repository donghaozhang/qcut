import { useCallback } from "react";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PropertyGroup } from "@/components/editor/properties-panel/property-item";
import { Trash2, Copy } from "lucide-react";
import { getParameterRange } from "@/constants/effect-parameter-ranges";
import type { EffectInstance, EffectParameters } from "@/types/effects";

const EMPTY_EFFECTS: EffectInstance[] = [];

// Labels only; numeric ranges come from getParameterRange()
const PARAMETER_LABELS: Partial<Record<keyof EffectParameters, string>> = {
	// Transform parameters
	opacity: "Opacity",
	scale: "Scale",
	rotate: "Rotate",
	skewX: "Skew X",
	skewY: "Skew Y",

	// Basic color adjustments
	brightness: "Brightness",
	contrast: "Contrast",
	saturation: "Saturation",
	hue: "Hue Rotation",
	gamma: "Gamma",

	// Blur effects
	blur: "Blur",

	// Color effects
	sepia: "Sepia",
	grayscale: "Grayscale",
	invert: "Invert",

	// Style effects
	vintage: "Vintage",
	dramatic: "Dramatic",
	warm: "Warm",
	cool: "Cool",
	cinematic: "Cinematic",

	// Enhancement effects
	vignette: "Vignette",
	grain: "Grain",
	sharpen: "Sharpen",
	emboss: "Emboss",
	edge: "Edge Detection",
	pixelate: "Pixelate",

	// Distortion effects
	wave: "Wave",
	waveFrequency: "Wave Frequency",
	waveAmplitude: "Wave Amplitude",
	twist: "Twist",
	twistAngle: "Twist Angle",
	bulge: "Bulge",
	bulgeRadius: "Bulge Radius",
	fisheye: "Fisheye",
	fisheyeStrength: "Fisheye Strength",
	ripple: "Ripple",
	swirl: "Swirl",

	// Artistic effects
	oilPainting: "Oil Painting",
	brushSize: "Brush Size",
	watercolor: "Watercolor",
	wetness: "Wetness",
	pencilSketch: "Pencil Sketch",
	strokeWidth: "Stroke Width",
	halftone: "Halftone",
	dotSize: "Dot Size",

	// Transition effects
	fadeIn: "Fade In",
	fadeOut: "Fade Out",
	dissolve: "Dissolve",
	dissolveProgress: "Dissolve Progress",
	wipe: "Wipe",
	// wipeDirection is a string enum, not a number - handled separately
	wipeProgress: "Wipe Progress",

	// Composite effects
	overlay: "Overlay",
	overlayOpacity: "Overlay Opacity",
	multiply: "Multiply",
	screen: "Screen",
	colorDodge: "Color Dodge",
	// blendMode is a string enum, not a number - handled separately
};

/** Chinese labels for the package slider keys Jianying effects declare. */
const JIANYING_ADJUST_LABELS: Record<string, string> = {
	effects_adjust_speed: "速度",
	effects_adjust_intensity: "强度",
	effects_adjust_luminance: "亮度",
	effects_adjust_blur: "模糊",
	effects_adjust_background_animation: "背景动画",
	effects_adjust_filter: "滤镜",
	effects_adjust_size: "大小",
	effects_adjust_color: "颜色",
	effects_adjust_range: "范围",
	effects_adjust_distortion: "扭曲",
	effects_adjust_number: "数量",
	effects_adjust_rotate: "旋转",
	effects_adjust_texture: "纹理",
	effects_adjust_noise: "噪点",
	effects_adjust_sharpen: "锐化",
	effects_adjust_horizontal_shift: "水平偏移",
	effects_adjust_vertical_shift: "垂直偏移",
	effects_adjust_horizontal_chromatic: "水平色散",
	effects_adjust_vertical_chromatic: "垂直色散",
};

function jianyingAdjustLabel(key: string): string {
	return JIANYING_ADJUST_LABELS[key] ?? key.replace(/^effects_adjust_/, "");
}

interface EffectsPropertiesProps {
	elementId: string;
}

export function EffectsProperties({ elementId }: EffectsPropertiesProps) {
	const {
		updateEffectParameters,
		updateEffectAdjustValue,
		toggleEffect,
		removeEffect,
		duplicateEffect,
	} = useEffectsStore();

	const effects = useEffectsStore(
		(s) => s.activeEffects.get(elementId) ?? EMPTY_EFFECTS
	);

	const handleParameterChange = useCallback(
		(
			effectId: string,
			parameter: keyof EffectParameters,
			value: number | string
		) => {
			updateEffectParameters(elementId, effectId, { [parameter]: value });
		},
		[elementId, updateEffectParameters]
	);

	const renderParameterControl = (
		effect: EffectInstance,
		parameter: keyof EffectParameters
	) => {
		const value = effect.parameters[parameter];
		const label = PARAMETER_LABELS[parameter] ?? String(parameter);

		// Handle string-union parameters with select controls
		if (parameter === "blendMode" && typeof value === "string") {
			return (
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span>Blend Mode</span>
						<span className="text-muted-foreground">{value}</span>
					</div>
					<Select
						value={value}
						onValueChange={(v) =>
							handleParameterChange(effect.id, parameter, v)
						}
					>
						<SelectTrigger
							className="w-full h-7 text-xs"
							aria-label="Blend Mode"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[
								"normal",
								"multiply",
								"screen",
								"overlay",
								"darken",
								"lighten",
								"color-dodge",
								"color-burn",
							].map((m) => (
								<SelectItem key={m} value={m} className="text-xs capitalize">
									{m}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			);
		}

		if (parameter === "wipeDirection" && typeof value === "string") {
			return (
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span>Wipe Direction</span>
						<span className="text-muted-foreground">{value}</span>
					</div>
					<Select
						value={value}
						onValueChange={(v) =>
							handleParameterChange(effect.id, parameter, v)
						}
					>
						<SelectTrigger
							className="w-full h-7 text-xs"
							aria-label="Wipe Direction"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{["left", "right", "up", "down"].map((d) => (
								<SelectItem key={d} value={d} className="text-xs capitalize">
									{d}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			);
		}

		if (parameter === "blurType" && typeof value === "string") {
			return (
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span>Blur Type</span>
						<span className="text-muted-foreground">{value}</span>
					</div>
					<Select
						value={value}
						onValueChange={(v) =>
							handleParameterChange(effect.id, parameter, v)
						}
					>
						<SelectTrigger
							className="w-full h-7 text-xs"
							aria-label="Blur Type"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{["gaussian", "box", "motion"].map((t) => (
								<SelectItem key={t} value={t} className="text-xs capitalize">
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			);
		}

		// Handle numeric parameters with sliders
		if (typeof value === "number") {
			const range = getParameterRange(parameter as string);
			return (
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span>{label}</span>
						<span className="text-muted-foreground">{value}</span>
					</div>
					<Slider
						value={[value]}
						onValueChange={([newValue]) =>
							handleParameterChange(effect.id, parameter, newValue)
						}
						min={range.min}
						max={range.max}
						step={range.step}
						className="w-full"
						aria-label={label}
					/>
				</div>
			);
		}

		// Skip parameters that don't have appropriate controls
		return null;
	};

	// Jianying lab effects expose the package's own normalized sliders instead
	// of QCut parameters. The values feed the export-time render request.
	const renderJianyingAdjustControls = (effect: EffectInstance) => {
		const parameters = effect.adjustParameters ?? [];
		if (effect.engine !== "jianying-local" || parameters.length === 0) {
			return null;
		}
		return (
			<div className="space-y-4">
				{parameters.map((parameter) => {
					const value =
						effect.adjustValues?.find((entry) => entry.key === parameter.key)
							?.value ?? parameter.defaultValue;
					const label = jianyingAdjustLabel(parameter.key);
					const step = (parameter.maximum - parameter.minimum) / 100 || 0.01;
					return (
						<div key={parameter.key} className="space-y-2">
							<div className="flex justify-between text-sm">
								<span>{label}</span>
								<span className="text-muted-foreground">
									{value.toFixed(2)}
								</span>
							</div>
							<Slider
								value={[value]}
								onValueChange={([newValue]) =>
									updateEffectAdjustValue(elementId, effect.id, {
										key: parameter.key,
										value: newValue,
									})
								}
								min={parameter.minimum}
								max={parameter.maximum}
								step={step}
								className="w-full"
								aria-label={label}
							/>
						</div>
					);
				})}
			</div>
		);
	};

	const renderEffectParameters = (effect: EffectInstance) => {
		if (effect.engine === "jianying-local") {
			return renderJianyingAdjustControls(effect);
		}

		// Dynamically render only the parameters that exist in the effect
		const parameters = Object.keys(effect.parameters) as Array<
			keyof EffectParameters
		>;

		return (
			<div className="space-y-4">
				{parameters.map((param) => (
					<div key={param}>{renderParameterControl(effect, param)}</div>
				))}
			</div>
		);
	};

	if (effects.length === 0) {
		return (
			<div className="p-4 text-muted-foreground text-center">
				No effects applied to this element.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{effects.map((effect) => (
				<PropertyGroup key={effect.id} title={effect.name}>
					{/* Effect Controls */}
					<div className="flex items-center justify-between mb-4">
						<Switch
							checked={effect.enabled}
							onCheckedChange={() => toggleEffect(elementId, effect.id)}
							aria-label={`Toggle ${effect.name} effect`}
						/>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="text"
								size="icon"
								aria-label={`Duplicate ${effect.name} effect`}
								onClick={() => duplicateEffect(elementId, effect.id)}
							>
								<Copy
									className="w-4 h-4"
									aria-hidden="true"
									focusable="false"
								/>
							</Button>
							<Button
								type="button"
								variant="text"
								size="icon"
								aria-label={`Remove ${effect.name} effect`}
								onClick={() => removeEffect(elementId, effect.id)}
							>
								<Trash2
									className="w-4 h-4"
									aria-hidden="true"
									focusable="false"
								/>
							</Button>
						</div>
					</div>

					{/* Parameter Controls - Dynamically rendered based on effect parameters */}
					{renderEffectParameters(effect)}
				</PropertyGroup>
			))}
		</div>
	);
}
