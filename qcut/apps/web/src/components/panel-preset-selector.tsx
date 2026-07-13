"use client";

import type React from "react";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ChevronDown, LayoutPanelTop, RotateCcw } from "lucide-react";
import {
	usePanelStore,
	type PanelPreset,
	PRESET_LABELS,
} from "@/stores/editor/panel-store";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

const presets = Object.keys(PRESET_LABELS) as PanelPreset[];

const PRESET_LABEL_KEYS: Record<PanelPreset, TranslationKey> = {
	default: "editor.preset.default",
	media: "editor.preset.media",
	inspector: "editor.preset.inspector",
	"vertical-preview": "editor.preset.vertical",
};

const PRESET_DESCRIPTION_KEYS: Record<PanelPreset, TranslationKey> = {
	default: "editor.preset.defaultDescription",
	media: "editor.preset.mediaDescription",
	inspector: "editor.preset.inspectorDescription",
	"vertical-preview": "editor.preset.verticalDescription",
};

export function PanelPresetSelector() {
	const { activePreset, setActivePreset, resetPreset } = usePanelStore();
	const { t } = useTranslation();

	const handleResetPreset = (preset: PanelPreset, event: React.MouseEvent) => {
		event.stopPropagation();
		resetPreset(preset);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-8 px-2 text-xs"
					title={t("editor.preset.title")}
				>
					<LayoutPanelTop
						className="h-4 w-4 mr-1"
						aria-label={t("editor.preset.title")}
					/>
					{t(PRESET_LABEL_KEYS[activePreset])}
					<ChevronDown
						className="h-3 w-3 ml-1"
						aria-label={t("editor.preset.open")}
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				{presets.map((preset) => (
					<DropdownMenuItem
						key={preset}
						onClick={() => setActivePreset(preset)}
						className="flex items-start justify-between gap-2 py-2"
					>
						<div className="flex-1">
							<div className="font-medium">{t(PRESET_LABEL_KEYS[preset])}</div>
							<div className="text-xs text-muted-foreground">
								{t(PRESET_DESCRIPTION_KEYS[preset])}
							</div>
							{activePreset === preset && " ✓"}
						</div>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="h-6 w-6 opacity-60 hover:opacity-100"
							onClick={(e) => handleResetPreset(preset, e)}
							title={t("editor.preset.reset", {
								name: t(PRESET_LABEL_KEYS[preset]),
							})}
							aria-label={t("editor.preset.reset", {
								name: t(PRESET_LABEL_KEYS[preset]),
							})}
						>
							<RotateCcw className="h-3 w-3" />
						</Button>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
