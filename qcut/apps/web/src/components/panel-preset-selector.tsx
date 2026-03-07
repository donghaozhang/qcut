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
	PRESET_DESCRIPTIONS,
} from "@/stores/editor/panel-store";

const presets = Object.keys(PRESET_LABELS) as PanelPreset[];

export function PanelPresetSelector() {
	const { activePreset, setActivePreset, resetPreset } = usePanelStore();

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
					aria-label={`Panel preset: ${PRESET_LABELS[activePreset]}`}
				>
					<LayoutPanelTop className="h-4 w-4 mr-1" aria-hidden="true" />
					{PRESET_LABELS[activePreset]}
					<ChevronDown className="h-3 w-3 ml-1" aria-hidden="true" />
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
							<div className="font-medium">{PRESET_LABELS[preset]}</div>
							<div className="text-xs text-muted-foreground">
								{PRESET_DESCRIPTIONS[preset]}
							</div>
							{activePreset === preset && " ✓"}
						</div>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="h-6 w-6 opacity-60 hover:opacity-100"
							onClick={(e) => handleResetPreset(preset, e)}
							title={`Reset ${PRESET_LABELS[preset]} preset`}
							aria-label={`Reset ${PRESET_LABELS[preset]} preset`}
						>
							<RotateCcw className="h-3 w-3" aria-hidden="true" />
						</Button>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
