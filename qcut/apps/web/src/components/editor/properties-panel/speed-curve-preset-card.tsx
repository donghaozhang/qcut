import type { KeyboardEvent } from "react";
import { Ban, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSpeedCurvePath } from "@/lib/video/speed-curve-path";
import type { MediaPropertyKeyframe } from "@/types/timeline";

export type SpeedCurveCardKind = "curve" | "custom" | "none";

export function SpeedCurvePresetCard({
	id,
	label,
	kind,
	keyframes = [],
	durationInFrames,
	selected,
	onSelect,
}: {
	id: string;
	label: string;
	kind: SpeedCurveCardKind;
	keyframes?: MediaPropertyKeyframe[];
	durationInFrames: number;
	selected: boolean;
	onSelect: () => void;
}) {
	const activateFromKeyboard = ({
		key,
		preventDefault,
	}: KeyboardEvent<HTMLButtonElement>) => {
		if (key !== "Enter" && key !== " ") return;
		preventDefault();
		onSelect();
	};

	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={label}
			data-testid={`speed-curve-preset-${id}`}
			className="group w-16 shrink-0 text-center"
			onClick={onSelect}
			onKeyDown={activateFromKeyboard}
		>
			<span
				className={cn(
					"relative flex h-14 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted/65 transition-colors",
					selected
						? "border-primary ring-1 ring-primary"
						: "border-transparent group-hover:border-border"
				)}
			>
				{kind === "none" ? (
					<Ban className="size-7 text-muted-foreground" aria-hidden="true" />
				) : null}
				{kind === "custom" ? (
					<SlidersHorizontal
						className="size-7 text-amber-400"
						aria-hidden="true"
					/>
				) : null}
				{kind === "curve" ? (
					<svg
						aria-hidden="true"
						className="absolute inset-1 size-[calc(100%-0.5rem)]"
						preserveAspectRatio="none"
						viewBox="0 0 100 100"
					>
						<path
							d="M 0 25 H 100 M 0 50 H 100 M 0 75 H 100"
							fill="none"
							stroke="currentColor"
							strokeDasharray="4 4"
							strokeWidth="0.75"
							className="text-border"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={buildSpeedCurvePath({
								keyframes,
								durationInFrames,
							})}
							fill="none"
							stroke="#facc15"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="1.75"
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
				) : null}
			</span>
			<span className="mt-1 block truncate text-[10px] leading-4 text-foreground">
				{label}
			</span>
		</button>
	);
}
