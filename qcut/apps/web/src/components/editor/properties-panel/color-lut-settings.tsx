import { useRef } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	COLOR_LUT_PRESETS,
	buildPresetCube,
	parseLutFile,
	type ColorLutPresetId,
} from "@/lib/color/color-lut";
import {
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

const LUT_KEYFRAME_PROPERTIES = [
	"lut.intensity",
	"lut.skinProtection",
] as const;

export function ColorLutSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const { settings, onSettingsChange } = bindings;
	const selectPreset = (id: ColorLutPresetId) => {
		const preset = COLOR_LUT_PRESETS.find((candidate) => candidate.id === id);
		if (!preset) return;
		onSettingsChange({
			...settings,
			filter: { ...DEFAULT_MEDIA_COLOR_SETTINGS.filter },
			lut: {
				...settings.lut,
				enabled: id !== "none",
				presetId: id,
				name: preset.name,
				cube: id === "none" ? undefined : buildPresetCube({ id }),
			},
		});
	};
	const importCube = async (file: File) => {
		try {
			const parsed = parseLutFile({
				text: await file.text(),
				fallbackName: file.name,
			});
			onSettingsChange({
				...settings,
				filter: { ...DEFAULT_MEDIA_COLOR_SETTINGS.filter },
				lut: {
					...settings.lut,
					enabled: true,
					presetId: "custom",
					name: parsed.name,
					cube: parsed.cube,
				},
			});
			toast.success(`已导入 ${parsed.name}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "无法导入 LUT");
		}
	};
	return (
		<ColorModuleSection
			title="LUT"
			enabled={settings.lut.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					filter: { ...DEFAULT_MEDIA_COLOR_SETTINGS.filter },
					lut: { ...settings.lut, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeColorKeyframes({
						settings,
						properties: [...LUT_KEYFRAME_PROPERTIES],
					}),
					filter: { ...DEFAULT_MEDIA_COLOR_SETTINGS.filter },
					lut: { ...DEFAULT_MEDIA_COLOR_SETTINGS.lut },
				})
			}
			testId="color-module-lut"
		>
			<div className="flex items-center gap-2">
				<Select
					value={
						settings.lut.presetId === "custom"
							? "custom"
							: settings.lut.presetId
					}
					onValueChange={(value) => {
						if (value === "custom") return;
						selectPreset(value as ColorLutPresetId);
					}}
				>
					<SelectTrigger
						className="h-8 min-w-0 flex-1 text-xs"
						aria-label="LUT 预设"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{settings.lut.presetId === "custom" ? (
							<SelectItem value="custom">{settings.lut.name}</SelectItem>
						) : null}
						{COLOR_LUT_PRESETS.map((preset) => (
							<SelectItem key={preset.id} value={preset.id}>
								{preset.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input
					ref={fileInput}
					type="file"
					accept=".cube,.3dl,text/plain"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void importCube(file);
						event.target.value = "";
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8"
					title="导入 LUT"
					aria-label="导入 LUT"
					onClick={() => fileInput.current?.click()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ")
							fileInput.current?.click();
					}}
				>
					<Upload className="size-3.5" />
				</Button>
			</div>
			<ColorKeyframedControl property="lut.intensity" bindings={bindings} />
			<ColorKeyframedControl
				property="lut.skinProtection"
				bindings={bindings}
			/>
		</ColorModuleSection>
	);
}
