"use client";

import { ImagePlusIcon, UserRoundIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DigitalHumanImage } from "../digital-human-media";

/**
 * Figure picker. QCut ships no stock avatars, so the candidates are the
 * project's own images — the same items the avatar pipeline accepts as its
 * character image.
 */
export function FigureGrid({
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
			<div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
				<button
					type="button"
					className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
					aria-label={t("digitalHuman.figure.import")}
					title={t("digitalHuman.figure.import")}
					data-testid="digital-human-figure-import"
					onClick={onImport}
				>
					<ImagePlusIcon className="size-4" aria-hidden="true" />
					<span className="text-[9px]">{t("digitalHuman.figure.import")}</span>
				</button>

				{images.map((image) => {
					const isSelected = selectedMediaId === image.id;
					return (
						<button
							key={image.id}
							type="button"
							className={cn(
								"flex aspect-[3/4] items-center justify-center overflow-hidden rounded border bg-foreground/5 transition-colors",
								isSelected
									? "border-primary ring-1 ring-primary"
									: "border-border/40 hover:border-foreground/40"
							)}
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
	);
}
