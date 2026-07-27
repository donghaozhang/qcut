"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { DraftsStorageSection } from "@/components/global-settings/drafts-storage-section";
import { LanguageSelector } from "@/components/language-selector";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpdateSettingsSection } from "@/components/editor/properties-panel/update-settings-section";
import { openKeyboardShortcuts } from "@/components/keyboard-shortcuts-help";
import { useTranslation } from "@/lib/i18n";
import type { TimeCode } from "@/lib/time";
import { SCREEN_RECORDING_CAPTURE_MODES } from "@/lib/project/screen-recording-capture-mode";
import { SCREEN_RECORDING_QUALITY_PRESETS } from "@/lib/project/screen-recording-quality";
import {
	DEFAULT_CANVAS_OPTIONS,
	DEFAULT_FPS_OPTIONS,
	TIMECODE_FORMAT_OPTIONS,
	useAppSettingsStore,
} from "@/stores/app-settings-store";
import { useScreenRecordingPreferencesStore } from "@/stores/screen-recording-preferences-store";

/** Opens this dialog; kept in sync with electron/app-menu.ts (Cmd+,). */
export const OPEN_GLOBAL_SETTINGS_EVENT = "qcut:open-global-settings";

export function openGlobalSettings() {
	window.dispatchEvent(new CustomEvent(OPEN_GLOBAL_SETTINGS_EVENT));
}

function SettingRow({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<Label className="text-sm">{label}</Label>
				{hint ? (
					<p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
				) : null}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

/**
 * Menu-item trigger for the Global Settings dialog. The dialog itself is
 * mounted separately (menus unmount their content on close, which would
 * take an inline dialog down with them) and opens via the event.
 */
export function GlobalSettingsMenuItem() {
	const { t } = useTranslation();
	return (
		<DropdownMenuItem
			className="flex items-center gap-1.5"
			onSelect={() => openGlobalSettings()}
			data-testid="global-settings-menu-item"
		>
			<Settings className="h-4 w-4" />
			{t("settings.menu")}
		</DropdownMenuItem>
	);
}

/**
 * Unified Global Settings dialog (drafts/storage, editing defaults,
 * performance, general), mirroring the reference editor's layout.
 * Opens via `qcut:open-global-settings` (project menu and native
 * menu Cmd+, both dispatch it).
 */
export const GlobalSettingsDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const settings = useAppSettingsStore();
	const recording = useScreenRecordingPreferencesStore();

	useEffect(() => {
		const handleOpen = () => setOpen(true);
		window.addEventListener(OPEN_GLOBAL_SETTINGS_EVENT, handleOpen);
		return () =>
			window.removeEventListener(OPEN_GLOBAL_SETTINGS_EVENT, handleOpen);
	}, []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-2xl" data-testid="global-settings-dialog">
				<DialogTitle>{t("settings.title")}</DialogTitle>
				<Tabs defaultValue="drafts" className="mt-2">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="drafts">{t("settings.tab.drafts")}</TabsTrigger>
						<TabsTrigger value="editing">
							{t("settings.tab.editing")}
						</TabsTrigger>
						<TabsTrigger value="performance">
							{t("settings.tab.performance")}
						</TabsTrigger>
						<TabsTrigger value="general">
							{t("settings.tab.general")}
						</TabsTrigger>
					</TabsList>

					<TabsContent
						value="drafts"
						className="mt-4 max-h-[55vh] overflow-y-auto pr-1"
					>
						<DraftsStorageSection />
					</TabsContent>

					<TabsContent
						value="editing"
						className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1"
					>
						<SettingRow label={t("settings.defaultResolution")}>
							<Select
								value={settings.defaultCanvasId}
								onValueChange={settings.setDefaultCanvasId}
							>
								<SelectTrigger
									className="w-44"
									data-testid="default-resolution-select"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DEFAULT_CANVAS_OPTIONS.map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>

						<SettingRow label={t("settings.defaultFps")}>
							<Select
								value={String(settings.defaultFps)}
								onValueChange={(value) => settings.setDefaultFps(Number(value))}
							>
								<SelectTrigger
									className="w-44"
									data-testid="default-fps-select"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DEFAULT_FPS_OPTIONS.map((fps) => (
										<SelectItem key={fps} value={String(fps)}>
											{t("settings.fpsValue", { fps })}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>

						<SettingRow label={t("settings.timecodeFormat")}>
							<Select
								value={settings.timecodeFormat}
								onValueChange={(value) =>
									settings.setTimecodeFormat(value as TimeCode)
								}
							>
								<SelectTrigger
									className="w-44"
									data-testid="timecode-format-select"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TIMECODE_FORMAT_OPTIONS.map((format) => (
										<SelectItem key={format} value={format}>
											{format}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>

						<SettingRow
							label={t("settings.autoCanvas")}
							hint={t("settings.autoCanvasHint")}
						>
							<Switch
								checked={settings.autoCanvasFromFirstMedia}
								onCheckedChange={settings.setAutoCanvasFromFirstMedia}
								data-testid="auto-canvas-switch"
							/>
						</SettingRow>

						<SettingRow
							label={t("settings.exportSound")}
							hint={t("settings.exportSoundHint")}
						>
							<Switch
								checked={settings.exportCompletionSound}
								onCheckedChange={settings.setExportCompletionSound}
								data-testid="export-sound-switch"
							/>
						</SettingRow>
					</TabsContent>

					<TabsContent
						value="performance"
						className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1"
					>
						<h3 className="text-sm font-medium">{t("settings.recording")}</h3>
						<SettingRow label={t("settings.recordingCaptureMode")}>
							<Select
								value={recording.captureMode}
								onValueChange={(value) =>
									recording.setCaptureMode({
										captureMode:
											value as (typeof SCREEN_RECORDING_CAPTURE_MODES)[number],
									})
								}
							>
								<SelectTrigger className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SCREEN_RECORDING_CAPTURE_MODES.map((mode) => (
										<SelectItem key={mode} value={mode}>
											{mode}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>
						<SettingRow label={t("settings.recordingQuality")}>
							<Select
								value={recording.qualityPreset}
								onValueChange={(value) =>
									recording.setQualityPreset({
										qualityPreset:
											value as (typeof SCREEN_RECORDING_QUALITY_PRESETS)[number],
									})
								}
							>
								<SelectTrigger className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SCREEN_RECORDING_QUALITY_PRESETS.map((preset) => (
										<SelectItem key={preset} value={preset}>
											{preset}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>
					</TabsContent>

					<TabsContent
						value="general"
						className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1"
					>
						<SettingRow label={t("settings.interface")}>
							<LanguageSelector />
						</SettingRow>
						<SettingRow label={t("shortcuts.title")}>
							<button
								type="button"
								className="text-sm text-primary underline-offset-2 hover:underline"
								data-testid="open-shortcuts-from-settings"
								onClick={() => {
									setOpen(false);
									openKeyboardShortcuts();
								}}
							>
								{t("settings.openShortcuts")}
							</button>
						</SettingRow>
						<UpdateSettingsSection />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
