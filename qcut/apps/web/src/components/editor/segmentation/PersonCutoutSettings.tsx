"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { PersonCutoutExportSettings } from "@/lib/segmentation/person-cutout-export";

interface PersonCutoutSettingsProps {
	settings: PersonCutoutExportSettings;
	onChange: (settings: Partial<PersonCutoutExportSettings>) => void;
	disabled?: boolean;
}

const DEFAULT_SETTINGS: PersonCutoutExportSettings = {
	threshold: 0.5,
	temporalSmoothing: 0.65,
	edgeShift: 0,
	feather: 2,
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function SettingRow({
	id,
	label,
	value,
	min,
	max,
	step,
	suffix,
	disabled,
	onChange,
}: {
	id: string;
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix?: string;
	disabled?: boolean;
	onChange: (value: number) => void;
}) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)_4.75rem] items-center gap-3">
			<Label htmlFor={id} className="text-xs text-muted-foreground">
				{label}
			</Label>
			<Slider
				aria-label={label}
				value={[value]}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onValueChange={([next]) => onChange(next)}
			/>
			<div className="relative">
				<Input
					id={id}
					type="number"
					value={value}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					onChange={(event) => {
						const next = Number(event.target.value);
						if (Number.isFinite(next)) onChange(clamp(next, min, max));
					}}
					className="h-7 rounded-sm pr-6 text-right text-xs tabular-nums"
				/>
				{suffix && (
					<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
						{suffix}
					</span>
				)}
			</div>
		</div>
	);
}

export function PersonCutoutSettings({
	settings,
	onChange,
	disabled,
}: PersonCutoutSettingsProps) {
	return (
		<section
			className="space-y-3 border-y py-3"
			data-testid="person-cutout-settings"
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">Person mask</h3>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					disabled={disabled}
					onClick={() => onChange(DEFAULT_SETTINGS)}
					aria-label="Reset person mask settings"
					title="Reset settings"
				>
					<RotateCcw className="size-3.5" />
				</Button>
			</div>
			<SettingRow
				id="person-confidence"
				label="Confidence"
				value={settings.threshold}
				min={0.1}
				max={0.9}
				step={0.01}
				disabled={disabled}
				onChange={(threshold) => onChange({ threshold })}
			/>
			<SettingRow
				id="person-smoothing"
				label="Stability"
				value={settings.temporalSmoothing}
				min={0}
				max={0.95}
				step={0.05}
				disabled={disabled}
				onChange={(temporalSmoothing) => onChange({ temporalSmoothing })}
			/>
			<SettingRow
				id="person-feather"
				label="Feather"
				value={settings.feather}
				min={0}
				max={16}
				step={0.5}
				suffix="px"
				disabled={disabled}
				onChange={(feather) => onChange({ feather })}
			/>
			<SettingRow
				id="person-edge"
				label="Edge"
				value={settings.edgeShift}
				min={-12}
				max={12}
				step={1}
				disabled={disabled}
				onChange={(edgeShift) => onChange({ edgeShift })}
			/>
		</section>
	);
}
