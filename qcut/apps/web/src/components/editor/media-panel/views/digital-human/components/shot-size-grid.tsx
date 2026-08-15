"use client";

import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DigitalHumanShotSize } from "@/stores/digital-human-store";
import {
	DIGITAL_HUMAN_SHOT_OPTIONS,
	type DigitalHumanShotOption,
} from "../digital-human-catalog";

/**
 * Schematic stand-in for the figure, drawn in a fixed 100x150 space. Each shot
 * views it through a different window, so the framing difference stays readable
 * at thumbnail size and no stock portrait has to be bundled.
 */
function FigureSilhouette({ viewBox }: { viewBox: string }) {
	return (
		<svg
			viewBox={viewBox}
			preserveAspectRatio="xMidYMid slice"
			className="size-full text-foreground/35"
			aria-hidden="true"
		>
			<title>figure</title>
			<circle cx="50" cy="34" r="18" fill="currentColor" />
			<path
				d="M10 150 C10 100 26 56 50 56 C74 56 90 100 90 150 Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function ShotSizeCard({
	isSelected,
	option,
	onSelect,
}: {
	isSelected: boolean;
	option: DigitalHumanShotOption;
	onSelect: ({ shotSize }: { shotSize: DigitalHumanShotSize }) => void;
}) {
	const { t } = useTranslation();
	const label = t(option.labelKey);

	return (
		<button
			type="button"
			className="group flex flex-col items-center gap-1"
			aria-pressed={isSelected}
			aria-label={label}
			data-testid={`digital-human-shot-${option.id}`}
			onClick={() => onSelect({ shotSize: option.id })}
		>
			<span
				className={cn(
					"flex aspect-[3/4] w-full overflow-hidden rounded bg-foreground/5 transition-colors",
					isSelected
						? "ring-1 ring-primary"
						: "group-hover:bg-foreground/10 group-focus-visible:ring-1 group-focus-visible:ring-ring"
				)}
			>
				<FigureSilhouette viewBox={option.viewBox} />
			</span>
			<span
				className={cn(
					"text-[10px] transition-colors",
					isSelected ? "text-primary" : "text-muted-foreground"
				)}
			>
				{label}
			</span>
		</button>
	);
}

export function ShotSizeGrid({
	selected,
	onSelect,
}: {
	selected: DigitalHumanShotSize;
	onSelect: ({ shotSize }: { shotSize: DigitalHumanShotSize }) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-2">
			{DIGITAL_HUMAN_SHOT_OPTIONS.map((option) => (
				<ShotSizeCard
					key={option.id}
					isSelected={selected === option.id}
					option={option}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}
