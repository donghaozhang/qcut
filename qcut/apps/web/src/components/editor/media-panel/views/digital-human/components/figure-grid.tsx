"use client";

import { ImagePlusIcon, UserRoundIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
	DIGITAL_HUMAN_FIGURE_PRESETS,
	type DigitalHumanFigurePreset,
} from "../digital-human-figure-presets";
import type { DigitalHumanImage } from "../digital-human-media";

const GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2";
const CARD_CLASS =
	"flex aspect-[3/4] items-center justify-center overflow-hidden rounded border bg-foreground/5 transition-colors";

function cardStateClass({ isSelected }: { isSelected: boolean }): string {
	return isSelected
		? "border-primary ring-1 ring-primary"
		: "border-border/40 hover:border-foreground/40";
}

function GroupLabel({ children }: { children: string }) {
	return <p className="mb-1.5 text-[10px] text-muted-foreground">{children}</p>;
}

function PresetCard({
	index,
	isSelected,
	preset,
	onSelect,
}: {
	index: number;
	isSelected: boolean;
	preset: DigitalHumanFigurePreset;
	onSelect: ({ presetId }: { presetId: string }) => void;
}) {
	const { t } = useTranslation();
	// Numbered rather than named: these are stock portraits, and inventing
	// persona names for real photographed people would be misleading.
	const label = t("digitalHuman.figure.presetName", { index: index + 1 });

	return (
		<button
			type="button"
			className={cn(CARD_CLASS, cardStateClass({ isSelected }))}
			aria-pressed={isSelected}
			aria-label={label}
			title={`${label} · ${preset.photographer} / Pexels`}
			data-testid={`digital-human-figure-preset-${preset.id}`}
			onClick={() => onSelect({ presetId: preset.id })}
		>
			<img
				src={preset.previewUrl}
				alt=""
				loading="lazy"
				className="size-full object-cover"
			/>
		</button>
	);
}

/**
 * Figure picker. Bundled studio portraits come first so the panel is usable on
 * a fresh project, followed by the project's own images — the same items the
 * avatar pipeline accepts as its character image.
 */
export function FigureGrid({
	images,
	selectedMediaId,
	selectedPresetId,
	onImport,
	onSelect,
	onSelectPreset,
}: {
	images: readonly DigitalHumanImage[];
	selectedMediaId: string | null;
	selectedPresetId: string | null;
	onImport: () => void;
	onSelect: ({ mediaId }: { mediaId: string | null }) => void;
	onSelectPreset: ({ presetId }: { presetId: string }) => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="space-y-3">
			<div>
				<GroupLabel>{t("digitalHuman.figure.presetGroup")}</GroupLabel>
				<div className={GRID_CLASS} data-testid="digital-human-figure-presets">
					{DIGITAL_HUMAN_FIGURE_PRESETS.map((preset, index) => (
						<PresetCard
							key={preset.id}
							index={index}
							isSelected={selectedPresetId === preset.id}
							preset={preset}
							onSelect={onSelectPreset}
						/>
					))}
				</div>
			</div>

			<div>
				<GroupLabel>{t("digitalHuman.figure.myGroup")}</GroupLabel>
				<div className={GRID_CLASS}>
					<button
						type="button"
						className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
						aria-label={t("digitalHuman.figure.import")}
						title={t("digitalHuman.figure.import")}
						data-testid="digital-human-figure-import"
						onClick={onImport}
					>
						<ImagePlusIcon className="size-4" aria-hidden="true" />
						<span className="text-[9px]">
							{t("digitalHuman.figure.import")}
						</span>
					</button>

					{images.map((image) => {
						const isSelected = selectedMediaId === image.id;
						return (
							<button
								key={image.id}
								type="button"
								className={cn(CARD_CLASS, cardStateClass({ isSelected }))}
								aria-pressed={isSelected}
								aria-label={image.name}
								title={image.name}
								data-testid={`digital-human-figure-${image.id}`}
								onClick={() => onSelect({ mediaId: image.id })}
							>
								{image.previewUrl ? (
									<img
										src={image.previewUrl}
										alt=""
										className="size-full object-cover"
									/>
								) : (
									<UserRoundIcon
										className="size-4 text-muted-foreground"
										aria-hidden="true"
									/>
								)}
							</button>
						);
					})}
				</div>

				{images.length === 0 ? (
					<p
						className="mt-2 text-[10px] leading-snug text-muted-foreground"
						data-testid="digital-human-figure-empty"
					>
						{t("digitalHuman.figure.empty")}
					</p>
				) : null}
			</div>
		</div>
	);
}
