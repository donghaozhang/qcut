import { useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TranslationKey } from "@/lib/i18n";
import type { TextAnimationPresetDefinition } from "@/lib/text/text-animation-presets";
import { TextAnimationPresetCard } from "./text-animation-preset-card";

export function TextAnimationPresetGrid({
	ariaLabel,
	emptyLabel,
	onSelect,
	presets,
	selectedPresetId,
	translate,
}: {
	ariaLabel: string;
	emptyLabel: string;
	onSelect: ({ preset }: { preset: TextAnimationPresetDefinition }) => void;
	presets: readonly TextAnimationPresetDefinition[];
	selectedPresetId: string;
	translate: (key: TranslationKey) => string;
}) {
	const [focusedPresetId, setFocusedPresetId] = useState<string | null>(null);
	const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
	const previewedPresetId = hoveredPresetId ?? focusedPresetId;
	const presetById = useMemo(
		() => new Map(presets.map((preset) => [preset.id, preset])),
		[presets]
	);

	if (presets.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
				{emptyLabel}
			</div>
		);
	}

	return (
		<ToggleGroup
			type="single"
			value={selectedPresetId}
			orientation="horizontal"
			loop
			className="grid w-full grid-cols-4 items-stretch gap-1.5"
			onValueChange={(presetId) => {
				if (!presetId) return;
				const preset = presetById.get(presetId);
				if (preset) onSelect({ preset });
			}}
			aria-label={ariaLabel}
			data-testid="text-animation-preset-grid"
		>
			{presets.map((preset) => {
				const name = translate(preset.nameKey);
				return (
					<ToggleGroupItem
						key={`${preset.phase}-${preset.id}`}
						type="button"
						value={preset.id}
						aria-label={`${name}, ${preset.defaultDuration.toFixed(1)}s`}
						title={name}
						className="group h-auto min-w-0 overflow-hidden rounded-md border border-border bg-card p-0 text-left text-foreground shadow-none transition-colors hover:border-primary/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary data-[state=on]:border-primary data-[state=on]:ring-1 data-[state=on]:ring-primary/50"
						onMouseEnter={() => setHoveredPresetId(preset.id)}
						onMouseLeave={() =>
							setHoveredPresetId((current) =>
								current === preset.id ? null : current
							)
						}
						onFocus={() => setFocusedPresetId(preset.id)}
						onBlur={() =>
							setFocusedPresetId((current) =>
								current === preset.id ? null : current
							)
						}
						data-testid={`text-animation-card-${preset.phase}-${preset.id}`}
					>
						<TextAnimationPresetCard
							isPreviewing={previewedPresetId === preset.id}
							name={name}
							preset={preset}
						/>
					</ToggleGroupItem>
				);
			})}
		</ToggleGroup>
	);
}
