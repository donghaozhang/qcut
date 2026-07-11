import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MediaMask } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { ColorModuleSection, ColorToggleRow } from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

export function ColorMaskSettings({
	bindings,
	masks,
	onCreateMask,
}: {
	bindings: ColorSettingsEditorBindings;
	masks: MediaMask[];
	onCreateMask: () => void;
}) {
	const { settings, onSettingsChange } = bindings;
	const toggleMask = (id: string, checked: boolean) =>
		onSettingsChange({
			...settings,
			mask: {
				...settings.mask,
				maskIds: checked
					? [...new Set([...settings.mask.maskIds, id])]
					: settings.mask.maskIds.filter((maskId) => maskId !== id),
			},
		});
	return (
		<ColorModuleSection
			title="Grade mask"
			enabled={settings.mask.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					mask: { ...settings.mask, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...settings,
					mask: { ...DEFAULT_MEDIA_COLOR_SETTINGS.mask },
				})
			}
			defaultExpanded
			testId="color-module-mask"
		>
			<div className="space-y-1">
				{masks.map((mask, index) => {
					const id = mask.id ?? `mask-${index + 1}`;
					return (
						<label key={id} className="flex items-center gap-2 py-1 text-xs">
							<Checkbox
								checked={settings.mask.maskIds.includes(id)}
								onCheckedChange={(checked) => toggleMask(id, checked === true)}
							/>
							<span className="min-w-0 flex-1 truncate">
								{mask.name || `Mask ${index + 1}`}
							</span>
						</label>
					);
				})}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onCreateMask}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ")
						event.currentTarget.click();
				}}
			>
				<Plus className="size-3.5" />
				Ellipse mask
			</Button>
			<ColorToggleRow
				label="Invert"
				checked={settings.mask.invert}
				onCheckedChange={(invert) =>
					onSettingsChange({
						...settings,
						mask: { ...settings.mask, invert },
					})
				}
			/>
		</ColorModuleSection>
	);
}
