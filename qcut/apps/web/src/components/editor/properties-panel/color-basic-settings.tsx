import type { ColorKeyframeProperty } from "@/types/timeline";
import {
	COLOR_BASIC_KEYFRAME_DEFINITIONS,
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

const BASIC_PROPERTIES = Object.keys(
	COLOR_BASIC_KEYFRAME_DEFINITIONS
) as ColorKeyframeProperty[];

export function ColorBasicSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	return (
		<ColorModuleSection
			title="基础调节"
			enabled={settings.basic.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					basic: { ...settings.basic, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeColorKeyframes({
						settings,
						properties: BASIC_PROPERTIES,
					}),
					basic: { ...DEFAULT_MEDIA_COLOR_SETTINGS.basic },
				})
			}
			defaultExpanded
			testId="color-module-basic"
		>
			{BASIC_PROPERTIES.map((property) => (
				<ColorKeyframedControl
					key={property}
					property={property}
					bindings={bindings}
				/>
			))}
		</ColorModuleSection>
	);
}
