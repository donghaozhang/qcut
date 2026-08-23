import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
	JianyingPortraitAdjustmentCategory,
	JianyingPortraitAdjustmentControl,
	JianyingPortraitAdjustmentSection,
} from "@/types/electron";
import type { MediaPortraitAdjustments } from "@/types/timeline";
import { cn } from "@/lib/utils";
import { NumberControl } from "./visual-property-controls";

const CATEGORY_LABELS: Record<
	JianyingPortraitAdjustmentCategory,
	{ zh: string; en: string }
> = {
	common: { zh: "常用", en: "Common" },
	skin: { zh: "皮肤", en: "Skin" },
	eyes: { zh: "眼睛", en: "Eyes" },
	nose: { zh: "鼻子", en: "Nose" },
	mouth: { zh: "嘴巴", en: "Mouth" },
	brows: { zh: "眉毛", en: "Brows" },
	details: { zh: "精修", en: "Details" },
	body: { zh: "美体", en: "Body" },
};

function categoryForControl({
	control,
}: {
	control: JianyingPortraitAdjustmentControl;
}): JianyingPortraitAdjustmentCategory {
	if (control.category) return control.category;
	if (control.section === "body") return "body";
	if (control.section === "skin") return "skin";
	return "common";
}

export function PortraitAdjustmentSection({
	section,
	controls,
	adjustments,
	disabled,
	locale,
	isControlReady,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	section: JianyingPortraitAdjustmentSection;
	controls: JianyingPortraitAdjustmentControl[];
	adjustments: MediaPortraitAdjustments;
	disabled: boolean;
	locale: string;
	isControlReady: (control: JianyingPortraitAdjustmentControl) => boolean;
	onChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const categories = useMemo(
		() => [
			...new Set(controls.map((control) => categoryForControl({ control }))),
		],
		[controls]
	);
	const [selectedCategory, setSelectedCategory] =
		useState<JianyingPortraitAdjustmentCategory>(categories[0] ?? "common");
	useEffect(() => {
		if (!categories.includes(selectedCategory)) {
			setSelectedCategory(categories[0] ?? "common");
		}
	}, [categories, selectedCategory]);
	const visibleControls = controls.filter(
		(control) => categoryForControl({ control }) === selectedCategory
	);
	const resetLabel = locale === "zh" ? "重置本组" : "Reset group";
	const reset = () => {
		const sectionKeys = new Set<string>(controls.map(({ key }) => key));
		onChange({
			...adjustments,
			values: Object.fromEntries(
				Object.entries(adjustments.values).filter(
					([key]) => !sectionKeys.has(key)
				)
			),
		});
	};

	return (
		<div className="space-y-4" data-testid={`portrait-section-${section}`}>
			<div className="flex items-center justify-between gap-2">
				{categories.length > 1 ? (
					<div
						className="flex min-w-0 flex-wrap gap-1"
						aria-label={locale === "zh" ? "五官分组" : "Feature group"}
					>
						{categories.map((category) => (
							<Button
								key={category}
								type="button"
								variant={selectedCategory === category ? "secondary" : "text"}
								size="sm"
								className="h-7 px-3 text-[11px]"
								aria-pressed={selectedCategory === category}
								disabled={disabled}
								onClick={() => setSelectedCategory(category)}
								onKeyDown={(event) => event.stopPropagation()}
							>
								{locale === "zh"
									? CATEGORY_LABELS[category].zh
									: CATEGORY_LABELS[category].en}
							</Button>
						))}
					</div>
				) : (
					<span />
				)}
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7 shrink-0"
					onClick={reset}
					onKeyDown={(event) => event.stopPropagation()}
					disabled={disabled}
					aria-label={resetLabel}
					title={resetLabel}
				>
					<RotateCcw className="size-3.5" />
				</Button>
			</div>
			<div className={cn("space-y-4", disabled && "opacity-50")}>
				{visibleControls.map((control) => {
					const controlDisabled = disabled || !isControlReady(control);
					return (
						<div
							key={control.key}
							className={cn(controlDisabled && "opacity-45")}
						>
							<NumberControl
								label={locale === "zh" ? control.titleZh : control.titleEn}
								value={adjustments.values[control.key] ?? 0}
								min={control.min}
								max={control.max}
								step={control.step}
								disabled={controlDisabled}
								onChange={(value) =>
									onChange({
										...adjustments,
										enabled: true,
										values: {
											...adjustments.values,
											[control.key]: value,
										},
									})
								}
								onInteractionStart={onInteractionStart}
								onInteractionEnd={onInteractionEnd}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
