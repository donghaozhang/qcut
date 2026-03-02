"use client";

import { useMemo, memo, useCallback } from "react";
import { PipetteIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { colors } from "@/data/colors";
import { useProjectStore } from "@/stores/project-store";
import { PropertyGroup } from "./property-item";
import type { BlurIntensity } from "@/types/project";

/** Memoized preview of the blur background effect with a gradient sample. */
const BlurPreview = memo(
	({
		blur,
		isSelected,
		onSelect,
	}: {
		blur: { label: string; value: number };
		isSelected: boolean;
		onSelect: () => void;
	}) => (
		<button
			type="button"
			className={cn(
				"w-full aspect-square rounded-sm cursor-pointer hover:outline-2 hover:outline-primary relative overflow-hidden focus-visible:outline-2 focus-visible:outline-primary",
				isSelected && "outline-2 outline-primary"
			)}
			onClick={onSelect}
			aria-pressed={isSelected}
			aria-label={`Select ${blur.label.toLowerCase()} blur`}
		>
			<div
				className="absolute inset-0 w-full h-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-400"
				style={{ filter: `blur(${blur.value}px)` }}
			/>
			<div className="absolute bottom-1 left-1 right-1 text-center">
				<span className="text-xs text-foreground bg-background/50 px-1 rounded">
					{blur.label}
				</span>
			</div>
		</button>
	)
);

BlurPreview.displayName = "BlurPreview";

/** Background settings panel for choosing between solid color and blur background modes. */
export function BackgroundView() {
	const { activeProject, updateBackgroundType } = useProjectStore();

	const blurLevels = useMemo(
		() => [
			{ label: "Light", value: 4 },
			{ label: "Medium", value: 8 },
			{ label: "Heavy", value: 18 },
		],
		[]
	);

	const handleBlurSelect = useCallback(
		async (blurIntensity: number) => {
			await updateBackgroundType("blur", {
				blurIntensity: blurIntensity as BlurIntensity,
			});
		},
		[updateBackgroundType]
	);

	const handleColorSelect = useCallback(
		async (color: string) => {
			await updateBackgroundType("color", { backgroundColor: color });
		},
		[updateBackgroundType]
	);

	const currentBlurIntensity = activeProject?.blurIntensity || 8;
	const isBlurBackground = activeProject?.backgroundType === "blur";
	const currentBackgroundColor = activeProject?.backgroundColor || "#000000";
	const isColorBackground = activeProject?.backgroundType === "color";

	const blurPreviews = useMemo(
		() =>
			blurLevels.map((blur) => (
				<BlurPreview
					key={blur.value}
					blur={blur}
					isSelected={isBlurBackground && currentBlurIntensity === blur.value}
					onSelect={() => handleBlurSelect(blur.value)}
				/>
			)),
		[blurLevels, isBlurBackground, currentBlurIntensity, handleBlurSelect]
	);

	const colorPreviews = useMemo(
		() =>
			colors.map((color) => (
				<button
					type="button"
					key={color}
					className={cn(
						"w-full aspect-square rounded-sm cursor-pointer hover:border-2 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
						isColorBackground &&
							color === currentBackgroundColor &&
							"border-2 border-primary"
					)}
					style={{ backgroundColor: color }}
					onClick={() => handleColorSelect(color)}
					aria-pressed={isColorBackground && color === currentBackgroundColor}
					aria-label={`Select color ${color}`}
					title={`Select color ${color}`}
				/>
			)),
		[isColorBackground, currentBackgroundColor, handleColorSelect]
	);

	return (
		<div className="flex flex-col gap-5">
			<PropertyGroup title="Blur">
				<div className="grid grid-cols-4 gap-2 w-full">{blurPreviews}</div>
			</PropertyGroup>

			<PropertyGroup title="Color">
				<div className="grid grid-cols-4 gap-2 w-full">
					<button
						type="button"
						disabled
						className="w-full aspect-square rounded-sm border border-foreground/15 flex items-center justify-center opacity-40 cursor-not-allowed"
						aria-label="Custom color picker (coming soon)"
						title="Custom color picker (coming soon)"
					>
						<PipetteIcon className="size-4" />
					</button>
					{colorPreviews}
				</div>
			</PropertyGroup>
		</div>
	);
}
