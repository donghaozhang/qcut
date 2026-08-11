import type {
	VideoColorMultiPassOperation,
	VideoColorMultiPassSettings,
} from "./color-settings";
import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "./color-lut-file";

export interface VideoColorMultiPassGraph {
	filterSteps: string[];
	outputLabel: string;
	applied: boolean;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function appendSingleInputFilter({
	filterSteps,
	inputLabel,
	outputLabel,
	filter,
}: {
	filterSteps: string[];
	inputLabel: string;
	outputLabel: string;
	filter: string;
}) {
	filterSteps.push(`[${inputLabel}]${filter}[${outputLabel}]`);
}

function buildLutPass({
	pass,
	settings,
	overall,
}: {
	pass: Extract<VideoColorMultiPassOperation, { kind: "lut" }>;
	settings: VideoColorMultiPassSettings;
	overall: number;
}) {
	const filePath = materializeVideoCubeLut({
		name: `${settings.name} multi-pass`,
		cube: pass.cube,
		intensity: clamp({ value: pass.intensity * overall, min: 0, max: 100 }),
		skinProtection: 0,
	});
	return `lut3d=file='${escapeFfmpegFilterPath(filePath)}':interp=tetrahedral`;
}

function vignetteAngle({
	amount,
	softness,
}: {
	amount: number;
	softness: number;
}) {
	const softnessFactor =
		0.75 + clamp({ value: softness, min: 0, max: 100 }) / 400;
	return clamp({
		value: Math.PI / 2 - (Math.PI / 3) * amount * softnessFactor,
		min: Math.PI / 20,
		max: Math.PI / 2,
	});
}

export function buildVideoColorMultiPassGraph({
	settings,
	inputLabel,
	labelPrefix,
}: {
	settings: VideoColorMultiPassSettings | undefined;
	inputLabel: string;
	labelPrefix: string;
}): VideoColorMultiPassGraph {
	if (
		!settings?.enabled ||
		settings.intensity <= 0 ||
		settings.passes.length === 0
	) {
		return { filterSteps: [], outputLabel: inputLabel, applied: false };
	}
	const overall = clamp({ value: settings.intensity / 100, min: 0, max: 1 });
	const prefix = labelPrefix.replace(/[^a-zA-Z0-9_]/g, "_");
	const filterSteps: string[] = [];
	let current = inputLabel;
	let labelIndex = 0;
	const nextLabel = ({ name }: { name: string }) =>
		`${prefix}_multi_${name}_${labelIndex++}`;

	for (const pass of settings.passes) {
		if (pass.kind === "fog-blend") {
			const base = nextLabel({ name: "fog_base" });
			const blurInput = nextLabel({ name: "fog_input" });
			const blurred = nextLabel({ name: "fog_blurred" });
			const output = nextLabel({ name: "fog_mix" });
			const radius = clamp({
				value: pass.radius * overall,
				min: 0.01,
				max: 20,
			});
			const amount = clamp({
				value: (pass.amount / 100) * overall,
				min: 0,
				max: 1,
			});
			filterSteps.push(`[${current}]split=2[${base}][${blurInput}]`);
			appendSingleInputFilter({
				filterSteps,
				inputLabel: blurInput,
				outputLabel: blurred,
				filter: `gblur=sigma=${radius.toFixed(4)}`,
			});
			filterSteps.push(
				`[${base}][${blurred}]blend=all_expr='A*(1-${amount.toFixed(6)})+B*${amount.toFixed(6)}':shortest=1[${output}]`
			);
			current = output;
			continue;
		}

		const output = nextLabel({ name: pass.kind.replace(/-/g, "_") });
		if (pass.kind === "sharpen") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: `unsharp=5:5:${clamp({ value: pass.amount * overall, min: 0, max: 2 }).toFixed(4)}`,
			});
		} else if (pass.kind === "bilateral-blur") {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter:
					`smartblur=luma_radius=${clamp({ value: pass.radius, min: 0.1, max: 5 }).toFixed(3)}:` +
					`luma_strength=${overall.toFixed(4)}:` +
					`luma_threshold=${Math.round(clamp({ value: pass.threshold, min: -30, max: 30 }))}`,
			});
		} else if (pass.kind === "vignette") {
			const amount = clamp({
				value: (pass.amount / 100) * overall,
				min: 0,
				max: 1,
			});
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: `vignette=angle=${vignetteAngle({ amount, softness: pass.softness }).toFixed(6)}:eval=frame`,
			});
		} else {
			appendSingleInputFilter({
				filterSteps,
				inputLabel: current,
				outputLabel: output,
				filter: buildLutPass({ pass, settings, overall }),
			});
		}
		current = output;
	}

	return {
		filterSteps,
		outputLabel: current,
		applied: filterSteps.length > 0,
	};
}
