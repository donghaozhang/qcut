import { Ban, Palette } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { JianyingPortraitMakeupCardStatus } from "@/types/electron";
import type {
	MediaPortraitAdjustments,
	MediaPortraitMakeupCategory,
} from "@/types/timeline";
import { applyPortraitMakeup } from "@/lib/portrait/portrait-face-scope";
import { cn } from "@/lib/utils";
import { NumberControl } from "./visual-property-controls";

const MAKEUP_CATEGORY_LABELS: Record<
	MediaPortraitMakeupCategory,
	{ zh: string; en: string }
> = {
	look: { zh: "套装", en: "Looks" },
	lip: { zh: "口红", en: "Lip" },
	blush: { zh: "腮红", en: "Blush" },
	contour: { zh: "修容", en: "Contour" },
	aegyo: { zh: "卧蚕", en: "Aegyo" },
	brows: { zh: "眉毛", en: "Brows" },
	lashes: { zh: "睫毛", en: "Lashes" },
	eyeliner: { zh: "眼线", en: "Eyeliner" },
	eyeshadow: { zh: "眼影", en: "Eyeshadow" },
	contacts: { zh: "美瞳", en: "Contacts" },
	highlight: { zh: "高光", en: "Highlight" },
	freckles: { zh: "雀斑", en: "Freckles" },
};

const MAKEUP_CATEGORIES = Object.keys(
	MAKEUP_CATEGORY_LABELS
) as MediaPortraitMakeupCategory[];

function MakeupCard({
	card,
	disabled,
	selected,
	locale,
	onSelect,
}: {
	card: JianyingPortraitMakeupCardStatus;
	disabled: boolean;
	selected: boolean;
	locale: string;
	onSelect: () => void;
}) {
	const label = locale === "zh" ? card.titleZh : card.titleEn;
	return (
		<button
			type="button"
			className="group min-w-0 text-center disabled:cursor-not-allowed disabled:opacity-40"
			aria-label={label}
			aria-pressed={selected}
			disabled={disabled || !card.ready}
			onClick={onSelect}
			onKeyDown={(event) => event.stopPropagation()}
			data-testid={`portrait-makeup-card-${card.id}`}
		>
			<span
				className={cn(
					"flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted/50 transition-colors",
					selected
						? "border-cyan-500 ring-1 ring-cyan-500"
						: "border-border group-hover:border-muted-foreground/70"
				)}
			>
				{card.thumbnailDataUrl ? (
					<img
						src={card.thumbnailDataUrl}
						alt=""
						className="size-full object-cover"
					/>
				) : (
					<Palette className="size-5 text-muted-foreground" />
				)}
			</span>
			<span className="mt-1 block truncate text-[10px] text-muted-foreground">
				{label}
			</span>
		</button>
	);
}

export function PortraitMakeupControls({
	cards,
	adjustments,
	disabled,
	locale,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	cards: JianyingPortraitMakeupCardStatus[];
	adjustments: MediaPortraitAdjustments;
	disabled: boolean;
	locale: string;
	onChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const availableCategories = useMemo(
		() =>
			MAKEUP_CATEGORIES.filter((category) =>
				cards.some((card) => card.category === category)
			),
		[cards]
	);
	const [category, setCategory] = useState<MediaPortraitMakeupCategory>(
		availableCategories[0] ?? "look"
	);
	useEffect(() => {
		if (!availableCategories.includes(category)) {
			setCategory(availableCategories[0] ?? "look");
		}
	}, [availableCategories, category]);
	const categoryCards = cards.filter((card) => card.category === category);
	const selection = adjustments.makeup?.[category];
	const selectedCard = categoryCards.find(
		(card) => card.id === selection?.cardId
	);
	const selectCard = ({ card }: { card: JianyingPortraitMakeupCardStatus }) => {
		onInteractionStart();
		onChange(
			applyPortraitMakeup({
				adjustments,
				makeup: {
					...adjustments.makeup,
					[category]: {
						cardId: card.id,
						intensity: card.defaultIntensity,
					},
				},
			})
		);
		onInteractionEnd();
	};
	const clearCategory = () => {
		onInteractionStart();
		const makeup = Object.fromEntries(
			Object.entries(adjustments.makeup ?? {}).filter(
				([currentCategory]) => currentCategory !== category
			)
		);
		onChange(applyPortraitMakeup({ adjustments, makeup }));
		onInteractionEnd();
	};

	return (
		<div className="space-y-4" data-testid="portrait-section-makeup">
			<div className="flex flex-wrap gap-1">
				{availableCategories.map((item) => (
					<Button
						key={item}
						type="button"
						variant={item === category ? "secondary" : "text"}
						size="sm"
						className="h-7 px-3 text-[11px]"
						aria-pressed={item === category}
						disabled={disabled}
						onClick={() => setCategory(item)}
						onKeyDown={(event) => event.stopPropagation()}
					>
						{locale === "zh"
							? MAKEUP_CATEGORY_LABELS[item].zh
							: MAKEUP_CATEGORY_LABELS[item].en}
					</Button>
				))}
			</div>
			<div className="grid grid-cols-4 gap-2">
				<button
					type="button"
					className="group min-w-0 text-center disabled:cursor-not-allowed disabled:opacity-40"
					aria-label={locale === "zh" ? "无" : "None"}
					aria-pressed={!selection}
					disabled={disabled}
					onClick={clearCategory}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<span
						className={cn(
							"flex aspect-square w-full items-center justify-center rounded-md border bg-background",
							selection
								? "border-border group-hover:border-muted-foreground/70"
								: "border-cyan-500 ring-1 ring-cyan-500"
						)}
					>
						<Ban className="size-5 text-muted-foreground" />
					</span>
					<span className="mt-1 block text-[10px] text-muted-foreground">
						{locale === "zh" ? "无" : "None"}
					</span>
				</button>
				{categoryCards.map((card) => (
					<MakeupCard
						key={card.id}
						card={card}
						disabled={disabled}
						selected={card.id === selection?.cardId}
						locale={locale}
						onSelect={() => selectCard({ card })}
					/>
				))}
			</div>
			{selectedCard && selection ? (
				<NumberControl
					label={locale === "zh" ? "强度" : "Intensity"}
					value={selection.intensity}
					min={1}
					max={100}
					step={1}
					disabled={disabled || !selectedCard.ready}
					onChange={(intensity) =>
						onChange(
							applyPortraitMakeup({
								adjustments,
								makeup: {
									...adjustments.makeup,
									[category]: {
										cardId: selectedCard.id,
										intensity,
									},
								},
							})
						)
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
			) : null}
		</div>
	);
}
