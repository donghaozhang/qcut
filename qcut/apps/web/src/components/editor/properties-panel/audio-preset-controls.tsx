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
	applyAudioPreset,
	createAudioPreset,
	loadCustomAudioPresets,
	persistCustomAudioPresets,
} from "@/lib/audio/audio-presets";
import { activateButtonFromKeyboard } from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";

const CATEGORY_LABELS = {
	voice: "人声",
	music: "音乐",
	effect: "音效",
	custom: "自定义",
} as const;

const VOICE_PRESETS = BUILT_IN_AUDIO_PRESETS.filter(
	(preset) => preset.category === "voice"
);

export function AudioVoicePresetControls({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
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
		toast.success(`已应用 ${selectedPreset.name}`);
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
					aria-label="人声预设"
				>
					<SelectValue placeholder="选择人声预设" />
				</SelectTrigger>
				<SelectContent>
					{VOICE_PRESETS.map((preset) => (
						<SelectItem key={preset.id} value={preset.id}>
							{preset.name}
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
				aria-label="应用人声预设"
				title="应用人声预设"
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
		toast.success(`已应用 ${selectedPreset.name}`);
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
			toast.success("音频预设已保存");
		} catch {
			toast.error("无法保存音频预设");
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
			toast.success("音频预设已删除");
		} catch {
			toast.error("无法删除音频预设");
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
						aria-label="音频处理预设"
					>
						<SelectValue placeholder="选择处理预设" />
					</SelectTrigger>
					<SelectContent>
						{presets.map((preset) => (
							<SelectItem key={preset.id} value={preset.id}>
								{preset.name} · {CATEGORY_LABELS[preset.category]}
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
					aria-label="应用音频预设"
					title="应用音频预设"
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
					placeholder="预设名称"
					aria-label="音频预设名称"
					className="h-8 min-w-0 flex-1 text-xs"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					aria-label="保存音频预设"
					title="保存音频预设"
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
					aria-label="删除自定义音频预设"
					title="删除自定义音频预设"
					onClick={deleteSelectedPreset}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
