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

const BASIC_PROPERTY_GROUPS: Array<{
	title: string;
	properties: ColorKeyframeProperty[];
	labels?: Partial<Record<ColorKeyframeProperty, string>>;
}> = [
	{
		title: "色彩",
		properties: [
			"basic.temperature",
			"basic.tint",
			"basic.saturation",
			"basic.vibrance",
		],
	},
	{
		title: "明度",
		properties: [
			"basic.exposure",
			"basic.brightness",
			"basic.contrast",
			"basic.highlights",
			"basic.shadows",
			"basic.whites",
			"basic.blacks",
		],
		labels: {
			"basic.whites": "白色",
			"basic.blacks": "黑色",
		},
	},
	{
		title: "效果",
		properties: [
			"basic.sharpness",
			"basic.fade",
			"basic.grain",
			"basic.vignette",
		],
		labels: {
			"basic.fade": "褪色",
		},
	},
];

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
			title="调整"
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
			{BASIC_PROPERTY_GROUPS.map((group) => (
				<div
					key={group.title}
					className="space-y-3 border-b border-border/60 pb-3 last:border-b-0 last:pb-0"
				>
					<div className="text-xs text-muted-foreground">{group.title}</div>
					{group.properties.map((property) => (
						<ColorKeyframedControl
							key={property}
							property={property}
							bindings={bindings}
							label={group.labels?.[property]}
						/>
					))}
				</div>
			))}
		</ColorModuleSection>
	);
}
