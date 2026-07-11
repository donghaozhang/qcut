import { useRef, useState } from "react";
import { AudioLines, LoaderCircle, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AudioStemName } from "@/types/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "@/lib/audio/audio-properties";
import {
	AudioModuleSection,
	AudioNumberControl,
	activateButtonFromKeyboard,
} from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";

const STEM_LABELS: Partial<Record<AudioStemName, string>> = {
	vocals: "Vocals",
	instrumental: "Instrumental",
	drums: "Drums",
	bass: "Bass",
	other: "Other",
	guitar: "Guitar",
	piano: "Piano",
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Audio processing failed";
}

export function AudioSeparationSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const {
		settings,
		onSettingsChange,
		onRunSeparation,
		onInteractionStart,
		onInteractionEnd,
	} = bindings;
	const stemEntries = Object.entries(
		settings.separation.stemMediaIds ?? {}
	).filter(
		(entry): entry is [AudioStemName, string] => typeof entry[1] === "string"
	);
	return (
		<AudioModuleSection
			title="Voice separation"
			enabled={settings.separation.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					separation: { ...settings.separation, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...settings,
					separation: {
						...settings.separation,
						enabled: false,
						stemGains: Object.fromEntries(
							stemEntries.map(([stem]) => [stem, 1])
						),
						error: undefined,
					},
				})
			}
			testId="audio-module-separation"
			disableChildrenWhenOff={false}
		>
			{stemEntries.map(([stem]) => (
				<AudioNumberControl
					key={stem}
					label={STEM_LABELS[stem] ?? stem}
					value={(settings.separation.stemGains?.[stem] ?? 1) * 100}
					min={0}
					max={100}
					step={1}
					suffix="%"
					onChange={(value) =>
						onSettingsChange({
							...settings,
							separation: {
								...settings.separation,
								stemGains: {
									...settings.separation.stemGains,
									[stem]: value / 100,
								},
							},
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
			))}
			{stemEntries.length > 0 ? (
				<div className="flex items-center justify-between gap-2">
					<ToggleGroup
						type="single"
						value={settings.separation.enabled ? "stems" : "original"}
						onValueChange={(value) => {
							if (value !== "stems" && value !== "original") return;
							onSettingsChange({
								...settings,
								separation: {
									...settings.separation,
									enabled: value === "stems",
								},
							});
						}}
						variant="outline"
						size="sm"
						aria-label="Separation result source"
					>
						<ToggleGroupItem value="original" className="h-7 text-[10px]">
							Original
						</ToggleGroupItem>
						<ToggleGroupItem value="stems" className="h-7 text-[10px]">
							Stems
						</ToggleGroupItem>
					</ToggleGroup>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="size-7"
						aria-label="Remove separated stems"
						title="Remove separated stems"
						onClick={() =>
							onSettingsChange({
								...settings,
								separation: {
									...DEFAULT_MEDIA_AUDIO_SETTINGS.separation,
								},
							})
						}
						onKeyDown={(event) => activateButtonFromKeyboard({ event })}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<span className="text-[10px] text-muted-foreground">
					{settings.separation.status === "ready"
						? `${stemEntries.length} stems ready`
						: settings.separation.error || "Demucs 6-stem separation"}
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={settings.separation.status === "processing"}
					onClick={() =>
						void onRunSeparation().catch((error) =>
							toast.error(errorMessage(error))
						)
					}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					{settings.separation.status === "processing" ? (
						<LoaderCircle className="size-3 animate-spin" />
					) : (
						<AudioLines className="size-3" />
					)}
					{settings.separation.status === "ready"
						? "Separate again"
						: "Separate"}
				</Button>
			</div>
		</AudioModuleSection>
	);
}

export function AudioVoiceConversionSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { settings, onSettingsChange, onRunVoiceConversion } = bindings;
	const [targetVoiceUrl, setTargetVoiceUrl] = useState("");
	const [targetVoiceFile, setTargetVoiceFile] = useState<File>();
	const fileInputRef = useRef<HTMLInputElement>(null);
	return (
		<AudioModuleSection
			title="Voice conversion"
			enabled={settings.voiceConversion.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					voiceConversion: { ...settings.voiceConversion, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...settings,
					voiceConversion: {
						...settings.voiceConversion,
						enabled: false,
						error: undefined,
					},
				})
			}
			testId="audio-module-voice-conversion"
			disableChildrenWhenOff={false}
		>
			<Input
				value={targetVoiceUrl}
				onChange={(event) => setTargetVoiceUrl(event.target.value)}
				placeholder="Target voice URL (optional)"
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept="audio/*"
				className="sr-only"
				onChange={(event) => setTargetVoiceFile(event.target.files?.[0])}
			/>
			<div className="flex items-center justify-between gap-2">
				<Button
					type="button"
					variant="text"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					<Upload className="size-3" />
					<span className="max-w-28 truncate">
						{targetVoiceFile?.name ?? "Reference"}
					</span>
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={settings.voiceConversion.status === "processing"}
					onClick={() =>
						void onRunVoiceConversion({
							targetVoiceUrl,
							targetVoiceFile,
						}).catch((error) => toast.error(errorMessage(error)))
					}
					onKeyDown={(event) => activateButtonFromKeyboard({ event })}
				>
					{settings.voiceConversion.status === "processing" ? (
						<LoaderCircle className="size-3 animate-spin" />
					) : (
						<AudioLines className="size-3" />
					)}
					{settings.voiceConversion.status === "ready"
						? "Convert again"
						: "Convert"}
				</Button>
			</div>
			{settings.voiceConversion.sourceMediaId ? (
				<div className="flex items-center justify-between gap-2">
					<ToggleGroup
						type="single"
						value={settings.voiceConversion.enabled ? "converted" : "original"}
						onValueChange={(value) => {
							if (value !== "converted" && value !== "original") return;
							onSettingsChange({
								...settings,
								voiceConversion: {
									...settings.voiceConversion,
									enabled: value === "converted",
								},
							});
						}}
						variant="outline"
						size="sm"
						aria-label="Voice conversion result source"
					>
						<ToggleGroupItem value="original" className="h-7 text-[10px]">
							Original
						</ToggleGroupItem>
						<ToggleGroupItem value="converted" className="h-7 text-[10px]">
							Converted
						</ToggleGroupItem>
					</ToggleGroup>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="size-7"
						aria-label="Remove voice conversion result"
						title="Remove voice conversion result"
						onClick={() =>
							onSettingsChange({
								...settings,
								voiceConversion: {
									...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceConversion,
								},
							})
						}
						onKeyDown={(event) => activateButtonFromKeyboard({ event })}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			) : null}
			{settings.voiceConversion.error ? (
				<p className="text-[10px] text-destructive">
					{settings.voiceConversion.error}
				</p>
			) : null}
		</AudioModuleSection>
	);
}

export function AudioAiVoiceSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	return (
		<>
			<AudioSeparationSettings bindings={bindings} />
			<AudioVoiceConversionSettings bindings={bindings} />
		</>
	);
}
