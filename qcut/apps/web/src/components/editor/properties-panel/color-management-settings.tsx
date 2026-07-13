import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ColorSpace } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import {
	ColorModuleSection,
	ColorNumberControl,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

const COLOR_SPACES: Array<{ value: ColorSpace; label: string }> = [
	{ value: "auto", label: "自动" },
	{ value: "srgb", label: "sRGB" },
	{ value: "rec709", label: "Rec.709" },
	{ value: "display-p3", label: "Display P3" },
	{ value: "rec2020", label: "Rec.2020" },
	{ value: "logc3", label: "ARRI LogC3" },
	{ value: "slog3", label: "Sony S-Log3" },
	{ value: "vlog", label: "Panasonic V-Log" },
	{ value: "hlg", label: "HLG" },
	{ value: "pq", label: "PQ / ST 2084" },
];

function SelectRow({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs">{label}</span>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="h-8 w-40 text-xs" aria-label={label}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function ColorManagementSettingsPanel({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	const update = (management: typeof settings.management) =>
		onSettingsChange({ ...settings, management });
	return (
		<ColorModuleSection
			title="色彩管理"
			enabled={settings.management.enabled}
			onEnabledChange={(enabled) => update({ ...settings.management, enabled })}
			onReset={() =>
				onSettingsChange({
					...settings,
					management: { ...DEFAULT_MEDIA_COLOR_SETTINGS.management },
				})
			}
			testId="color-module-management"
		>
			<SelectRow
				label="输入色彩空间"
				value={settings.management.inputSpace}
				options={COLOR_SPACES}
				onChange={(inputSpace) =>
					update({
						...settings.management,
						inputSpace: inputSpace as ColorSpace,
					})
				}
			/>
			<SelectRow
				label="工作色彩空间"
				value={settings.management.workingSpace}
				options={[
					{ value: "rec709-linear", label: "Rec.709 Linear" },
					{ value: "acescg", label: "ACEScg" },
				]}
				onChange={(workingSpace) =>
					update({
						...settings.management,
						workingSpace: workingSpace as "rec709-linear" | "acescg",
					})
				}
			/>
			<SelectRow
				label="输出色彩空间"
				value={settings.management.outputSpace}
				options={COLOR_SPACES.filter(
					(space) => !["auto", "logc3", "slog3", "vlog"].includes(space.value)
				)}
				onChange={(outputSpace) =>
					update({
						...settings.management,
						outputSpace: outputSpace as ColorSpace,
					})
				}
			/>
			<SelectRow
				label="色调映射"
				value={settings.management.toneMapping}
				options={[
					{ value: "none", label: "无" },
					{ value: "aces", label: "ACES" },
					{ value: "hable", label: "Hable" },
					{ value: "reinhard", label: "Reinhard" },
				]}
				onChange={(toneMapping) =>
					update({
						...settings.management,
						toneMapping: toneMapping as "none" | "aces" | "hable" | "reinhard",
					})
				}
			/>
			<ColorNumberControl
				label="峰值亮度"
				value={settings.management.peakNits}
				min={100}
				max={4000}
				step={50}
				suffix="nit"
				onChange={(peakNits) => update({ ...settings.management, peakNits })}
				onInteractionStart={bindings.onInteractionStart}
				onInteractionEnd={bindings.onInteractionEnd}
			/>
		</ColorModuleSection>
	);
}
