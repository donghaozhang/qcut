"use client";

import { ChevronDownIcon, ImagePlusIcon, SlashIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
	DIGITAL_HUMAN_BACKGROUND_COLORS,
	DIGITAL_HUMAN_COLLAPSED_COLOR_COUNT,
} from "../digital-human-catalog";
import type { DigitalHumanImage } from "../digital-human-media";

const CELL_BASE =
	"flex items-center justify-center rounded border transition-colors";

function ClearCell({
	isSelected,
	label,
	testId,
	className,
	onSelect,
}: {
	isSelected: boolean;
	label: string;
	testId: string;
	className: string;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				CELL_BASE,
				className,
				isSelected
					? "border-primary bg-primary/10 text-primary"
					: "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
			)}
			aria-pressed={isSelected}
			aria-label={label}
			title={label}
			data-testid={testId}
			onClick={onSelect}
		>
			<SlashIcon className="size-3.5" aria-hidden="true" />
		</button>
	);
}

function ColorSwatches({
	selected,
	onSelect,
}: {
	selected: string | null;
	onSelect: ({ color }: { color: string | null }) => void;
}) {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);
	const colorInputRef = useRef<HTMLInputElement>(null);
	const visibleColors = isExpanded
		? DIGITAL_HUMAN_BACKGROUND_COLORS
		: DIGITAL_HUMAN_BACKGROUND_COLORS.slice(
				0,
				DIGITAL_HUMAN_COLLAPSED_COLOR_COUNT
			);
	const hasMore =
		DIGITAL_HUMAN_BACKGROUND_COLORS.length >
		DIGITAL_HUMAN_COLLAPSED_COLOR_COUNT;
	// A custom pick is a colour that is set but absent from the palette.
	const isCustomSelected =
		selected !== null && !DIGITAL_HUMAN_BACKGROUND_COLORS.includes(selected);

	return (
		<div>
			<p className="mb-1.5 text-[10px] text-muted-foreground">
				{t("digitalHuman.background.color")}
			</p>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(20px,1fr))] gap-1">
				<ClearCell
					className="aspect-square"
					isSelected={selected === null}
					label={t("digitalHuman.none")}
					testId="digital-human-background-color-none"
					onSelect={() => onSelect({ color: null })}
				/>

				<button
					type="button"
					className={cn(
						CELL_BASE,
						"aspect-square",
						isCustomSelected
							? "border-primary"
							: "border-border/60 hover:border-foreground/40"
					)}
					style={{
						background:
							"conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)",
					}}
					aria-pressed={isCustomSelected}
					aria-label={t("digitalHuman.customColor")}
					title={t("digitalHuman.customColor")}
					data-testid="digital-human-background-color-custom"
					onClick={() => colorInputRef.current?.click()}
				/>
				<input
					ref={colorInputRef}
					type="color"
					className="sr-only"
					aria-label={t("digitalHuman.customColor")}
					value={selected ?? "#ffffff"}
					onChange={(event) => onSelect({ color: event.currentTarget.value })}
				/>

				{visibleColors.map((color) => {
					const isSelected = selected === color;
					return (
						<button
							key={color}
							type="button"
							className={cn(
								CELL_BASE,
								"aspect-square",
								isSelected
									? "border-primary ring-1 ring-primary"
									: "border-border/40 hover:border-foreground/40"
							)}
							style={{ backgroundColor: color }}
							aria-pressed={isSelected}
							aria-label={color}
							title={color}
							data-testid={`digital-human-background-color-${color}`}
							onClick={() => onSelect({ color })}
						/>
					);
				})}
			</div>

			{hasMore ? (
				<button
					type="button"
					className="mt-1 flex w-full items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
					aria-expanded={isExpanded}
					aria-label={
						isExpanded ? t("digitalHuman.showLess") : t("digitalHuman.showMore")
					}
					data-testid="digital-human-background-color-expand"
					onClick={() => setIsExpanded((expanded) => !expanded)}
				>
					<ChevronDownIcon
						className={cn("size-3.5", isExpanded ? "rotate-180" : "")}
						aria-hidden="true"
					/>
				</button>
			) : null}
		</div>
	);
}

function ImageBackgrounds({
	images,
	selectedMediaId,
	onImport,
	onSelect,
}: {
	images: readonly DigitalHumanImage[];
	selectedMediaId: string | null;
	onImport: () => void;
	onSelect: ({ mediaId }: { mediaId: string | null }) => void;
}) {
	const { t } = useTranslation();

	return (
		<div>
			<p className="mb-1.5 text-[10px] text-muted-foreground">
				{t("digitalHuman.background.image")}
			</p>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
				<ClearCell
					className="aspect-[4/3]"
					isSelected={selectedMediaId === null}
					label={t("digitalHuman.none")}
					testId="digital-human-background-image-none"
					onSelect={() => onSelect({ mediaId: null })}
				/>

				<button
					type="button"
					className={cn(
						CELL_BASE,
						"aspect-[4/3] border-dashed border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
					)}
					aria-label={t("digitalHuman.addImage")}
					title={t("digitalHuman.addImage")}
					data-testid="digital-human-background-image-add"
					onClick={onImport}
				>
					<ImagePlusIcon className="size-4" aria-hidden="true" />
				</button>

				{images.map((image) => {
					const isSelected = selectedMediaId === image.id;
					return (
						<button
							key={image.id}
							type="button"
							className={cn(
								CELL_BASE,
								"aspect-[4/3] overflow-hidden bg-foreground/5",
								isSelected
									? "border-primary ring-1 ring-primary"
									: "border-border/40 hover:border-foreground/40"
							)}
							aria-pressed={isSelected}
							aria-label={image.name}
							title={image.name}
							data-testid={`digital-human-background-image-${image.id}`}
							onClick={() => onSelect({ mediaId: image.id })}
						>
							{image.previewUrl ? (
								<img
									src={image.previewUrl}
									alt=""
									className="size-full object-cover"
								/>
							) : (
								<span className="truncate px-1 text-[9px] text-muted-foreground">
									{image.name}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function BackgroundPicker({
	backgroundColor,
	backgroundMediaId,
	images,
	onImportImage,
	onSelectColor,
	onSelectImage,
}: {
	backgroundColor: string | null;
	backgroundMediaId: string | null;
	images: readonly DigitalHumanImage[];
	onImportImage: () => void;
	onSelectColor: ({ color }: { color: string | null }) => void;
	onSelectImage: ({ mediaId }: { mediaId: string | null }) => void;
}) {
	return (
		<div className="space-y-3">
			<ColorSwatches selected={backgroundColor} onSelect={onSelectColor} />
			<ImageBackgrounds
				images={images}
				selectedMediaId={backgroundMediaId}
				onImport={onImportImage}
				onSelect={onSelectImage}
			/>
		</div>
	);
}
