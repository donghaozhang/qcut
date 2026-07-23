"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import {
	normalizeScreenRecordingCaptureMode,
	type ScreenRecordingCaptureMode,
} from "@/lib/project/screen-recording-capture-mode";
import {
	normalizeScreenRecordingQualityPreset,
	type ScreenRecordingQualityPreset,
} from "@/lib/project/screen-recording-quality";
import { useScreenRecordingPreferencesStore } from "@/stores/screen-recording-preferences-store";
import { ChevronDown, Expand, Monitor } from "lucide-react";

function qualityLabel({
	qualityPreset,
	nativeLabel,
}: {
	qualityPreset: ScreenRecordingQualityPreset;
	nativeLabel: string;
}): string {
	if (qualityPreset === "native") return nativeLabel;
	if (qualityPreset === "1440p") return "2K";
	if (qualityPreset === "2160p") return "4K";
	return "1080p";
}

export function ScreenRecordingSettingsMenu({
	disabled,
}: {
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const captureMode = useScreenRecordingPreferencesStore(
		(state) => state.captureMode
	);
	const qualityPreset = useScreenRecordingPreferencesStore(
		(state) => state.qualityPreset
	);
	const setCaptureMode = useScreenRecordingPreferencesStore(
		(state) => state.setCaptureMode
	);
	const setQualityPreset = useScreenRecordingPreferencesStore(
		(state) => state.setQualityPreset
	);
	const CaptureIcon = captureMode === "preview" ? Expand : Monitor;
	const label = qualityLabel({
		qualityPreset,
		nativeLabel: t("editor.header.recordingQualityNative"),
	});

	const handleCaptureModeChange = (value: string): void => {
		const nextMode: ScreenRecordingCaptureMode =
			normalizeScreenRecordingCaptureMode({ value });
		setCaptureMode({ captureMode: nextMode });
	};

	const handleQualityChange = (value: string): void => {
		const nextPreset: ScreenRecordingQualityPreset =
			normalizeScreenRecordingQualityPreset({ value });
		setQualityPreset({ qualityPreset: nextPreset });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-7 gap-1 px-2 text-xs"
					disabled={disabled}
					data-testid="screen-recording-settings-button"
					aria-label={t("editor.header.recordingSettings")}
					title={t("editor.header.recordingSettings")}
				>
					<CaptureIcon className="h-3.5 w-3.5" />
					<span>{label}</span>
					<ChevronDown className="h-3 w-3 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>
					{t("editor.header.recordingCaptureMode")}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={captureMode}
					onValueChange={handleCaptureModeChange}
				>
					<DropdownMenuRadioItem value="editor">
						<Monitor />
						<span>{t("editor.header.recordingCaptureEditor")}</span>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="preview">
						<Expand />
						<span>{t("editor.header.recordingCapturePreview")}</span>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuLabel>
					{t("editor.header.recordingQuality")}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={qualityPreset}
					onValueChange={handleQualityChange}
				>
					<DropdownMenuRadioItem value="native">
						<span>{t("editor.header.recordingQualityNative")}</span>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="1080p">
						<span>1080p</span>
						<span className="ml-auto text-xs text-muted-foreground">
							1920 × 1080
						</span>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="1440p">
						<span>2K</span>
						<span className="ml-auto text-xs text-muted-foreground">
							2560 × 1440
						</span>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="2160p">
						<span>4K</span>
						<span className="ml-auto text-xs text-muted-foreground">
							3840 × 2160
						</span>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
