import { useState } from "react";
import { Check, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	BUILT_IN_AUDIO_PRESETS,
	type AudioPreset,
	type AudioPresetCategory,
	applyAudioPreset,
	createAudioPreset,
	loadCustomAudioPresets,
	persistCustomAudioPresets,
} from "@/lib/audio/audio-presets";
import { activateButtonFromKeyboard } from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { AUDIO_PRESET_NAME_KEYS } from "./audio-properties-i18n";

const CATEGORY_LABEL_KEYS: Record<AudioPresetCategory, TranslationKey> = {
	voice: "audioProperties.preset.category.voice",
	music: "audioProperties.preset.category.music",
	effect: "audioProperties.preset.category.effect",
	custom: "audioProperties.preset.category.custom",
};

function localizedPresetName({
	preset,
	t,
}: {
	preset: AudioPreset;
	t: ReturnType<typeof useTranslation>["t"];
}): string {
	const key = AUDIO_PRESET_NAME_KEYS[preset.id];
	return key ? t(key) : preset.name;
}

const VOICE_PRESETS = BUILT_IN_AUDIO_PRESETS.filter(
	(preset) => preset.category === "voice"
);

export function AudioVoicePresetControls({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { t } = useTranslation();
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	const selectedPreset = VOICE_PRESETS.find(
		(preset) => preset.id === selectedPresetId
	);
	const applySelectedPreset = () => {
		if (!selectedPreset) return;
		bindings.onSettingsChange(
			applyAudioPreset({
				settings: bindings.settings,
				preset: selectedPreset,
			})
		);
		toast.success(
			t("audioProperties.preset.applied", {
				name: localizedPresetName({ preset: selectedPreset, t }),
			})
		);
	};

	return (
		<div
			className="flex items-center gap-1 border-b border-border/70 py-3"
			data-testid="audio-voice-preset-controls"
		>
			<Select
				value={selectedPresetId ?? ""}
				onValueChange={setSelectedPresetId}
			>
				<SelectTrigger
					className="h-8 min-w-0 flex-1 text-xs"
					aria-label={t("audioProperties.preset.voiceLabel")}
				>
					<SelectValue placeholder={t("audioProperties.preset.selectVoice")} />
				</SelectTrigger>
				<SelectContent>
					{VOICE_PRESETS.map((preset) => (
						<SelectItem key={preset.id} value={preset.id}>
							{localizedPresetName({ preset, t })}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="size-8 shrink-0"
				disabled={!selectedPreset}
				aria-label={t("audioProperties.preset.applyVoice")}
				title={t("audioProperties.preset.applyVoice")}
				onClick={applySelectedPreset}
				onKeyDown={(event) => activateButtonFromKeyboard({ event })}
			>
				<Check className="size-3.5" />
			</Button>
		</div>
	);
}

export function AudioPresetControls({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { t } = useTranslation();
	const [customPresets, setCustomPresets] = useState(loadCustomAudioPresets);
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	const [presetName, setPresetName] = useState("");
	const presets = [...BUILT_IN_AUDIO_PRESETS, ...customPresets];
	const selectedPreset = presets.find(
		(preset) => preset.id === selectedPresetId
	);

	const applySelectedPreset = () => {
		if (!selectedPreset) return;
		bindings.onSettingsChange(
			applyAudioPreset({
				settings: bindings.settings,
				preset: selectedPreset,
			})
		);
		toast.success(
			t("audioProperties.preset.applied", {
				name: localizedPresetName({ preset: selectedPreset, t }),
			})
		);
	};
	const saveCurrentPreset = () => {
		const preset = createAudioPreset({
			settings: bindings.settings,
			name: presetName,
		});
		const nextPresets = [preset, ...customPresets];
		try {
			persistCustomAudioPresets({ presets: nextPresets });
			setCustomPresets(nextPresets);
			setSelectedPresetId(preset.id);
			setPresetName("");
			toast.success(t("audioProperties.preset.saved"));
		} catch {
			toast.error(t("audioProperties.preset.saveFailed"));
		}
	};
	const deleteSelectedPreset = () => {
		if (!selectedPreset || selectedPreset.builtIn) return;
		const nextPresets = customPresets.filter(
			(preset) => preset.id !== selectedPreset.id
		);
		try {
			persistCustomAudioPresets({ presets: nextPresets });
			setCustomPresets(nextPresets);
			setSelectedPresetId(undefined);
			toast.success(t("audioProperties.preset.deleted"));
		} catch {
			toast.error(t("audioProperties.preset.deleteFailed"));
		}
	};

	return (
		<div
			className="space-y-2 border-b border-border/70 py-3"
			data-testid="audio-preset-controls"
		>
			<div className="flex items-center gap-1">
				<Select
					value={selectedPresetId ?? ""}
					onValueChange={setSelectedPresetId}
				>
					<SelectTrigger
						className="h-8 min-w-0 flex-1 text-xs"
						aria-label={t("audioProperties.preset.processLabel")}
					>
						<SelectValue
							placeholder={t("audioProperties.preset.selectProcess")}
						/>
					</SelectTrigger>
					<SelectContent>
						{presets.map((preset) => (
							<SelectItem key={preset.id} value={preset.id}>
								{localizedPresetName({ preset, t })} ·{" "}
								{t(CATEGORY_LABEL_KEYS[preset.category])}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					disabled={!selectedPreset}
					aria-label={t("audioProperties.preset.apply")}
					title={t("audioProperties.preset.apply")}
					onClick={applySelectedPreset}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					<Check className="size-3.5" />
				</Button>
			</div>
			<div className="flex items-center gap-1">
				<Input
					value={presetName}
					onChange={(event) => setPresetName(event.target.value)}
					placeholder={t("audioProperties.preset.namePlaceholder")}
					aria-label={t("audioProperties.preset.nameLabel")}
					className="h-8 min-w-0 flex-1 text-xs"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					aria-label={t("audioProperties.preset.save")}
					title={t("audioProperties.preset.save")}
					onClick={saveCurrentPreset}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					<Save className="size-3.5" />
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-8 shrink-0"
					disabled={!selectedPreset || selectedPreset.builtIn}
					aria-label={t("audioProperties.preset.delete")}
					title={t("audioProperties.preset.delete")}
					onClick={deleteSelectedPreset}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
