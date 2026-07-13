import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FontPicker } from "@/components/ui/font-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { FontFamily } from "@/constants/font-constants";
import type { SubtitleStyle } from "@/types/timeline";
import { useTranslation } from "@/lib/i18n";

export function CaptionStyleSlider({
	label,
	value,
	min,
	max,
	step,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs">{label}</Label>
			<div className="flex items-center gap-2">
				<Slider
					aria-label={label}
					value={[value]}
					min={min}
					max={max}
					step={step}
					onValueChange={([nextValue]) => onChange(nextValue)}
					onPointerDown={onInteractionStart}
					onPointerUp={onInteractionEnd}
					onPointerCancel={onInteractionEnd}
					onKeyDown={onInteractionStart}
					onKeyUp={onInteractionEnd}
					className="min-w-0 flex-1"
				/>
				<Input
					type="number"
					aria-label={`${label} value`}
					value={Number(value.toFixed(2))}
					min={min}
					max={max}
					step={step}
					onFocus={onInteractionStart}
					onBlur={onInteractionEnd}
					onChange={(event) => {
						const nextValue = Number(event.target.value);
						if (Number.isFinite(nextValue)) {
							onChange(Math.min(max, Math.max(min, nextValue)));
						}
					}}
					className="h-7 w-16 text-center text-xs"
				/>
			</div>
		</div>
	);
}

function activateOnKeyboard({
	event,
	action,
}: {
	event: React.KeyboardEvent<HTMLButtonElement>;
	action: () => void;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	action();
}

export function CaptionStyleControls({
	style,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	style: SubtitleStyle;
	onChange: (updates: Partial<SubtitleStyle>) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { t } = useTranslation();
	const textStyleButtons = [
		{
			label: t("caption.bold"),
			active: style.bold,
			content: "B",
			className: "font-bold",
			action: () => onChange({ bold: !style.bold }),
		},
		{
			label: t("caption.italic"),
			active: style.italic,
			content: "I",
			className: "italic",
			action: () => onChange({ italic: !style.italic }),
		},
		{
			label: t("caption.underline"),
			active: style.underline,
			content: "U",
			className: "underline",
			action: () => onChange({ underline: !style.underline }),
		},
	];
	const horizontalAlignments = [
		{ value: "left", label: t("caption.alignLeft"), icon: AlignLeft },
		{ value: "center", label: t("caption.alignCenter"), icon: AlignCenter },
		{ value: "right", label: t("caption.alignRight"), icon: AlignRight },
	] as const;
	const verticalAlignments = [
		{ value: "top", label: t("caption.positionTop"), y: 10 },
		{ value: "center", label: t("caption.positionMiddle"), y: 50 },
		{ value: "bottom", label: t("caption.positionBottom"), y: 90 },
	] as const;

	return (
		<div className="space-y-4" data-testid="caption-style-controls">
			<div className="space-y-1.5">
				<Label className="text-xs">{t("caption.font")}</Label>
				<FontPicker
					aria-label={t("caption.fontFamily")}
					defaultValue={style.fontFamily}
					onValueChange={(fontFamily: FontFamily) => onChange({ fontFamily })}
				/>
			</div>

			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1 space-y-1.5">
					<Label className="text-xs">{t("caption.style")}</Label>
					<div className="grid grid-cols-3 gap-1">
						{textStyleButtons.map((button) => (
							<Button
								key={button.label}
								type="button"
								variant={button.active ? "default" : "outline"}
								size="sm"
								className={`h-8 ${button.className}`}
								onClick={button.action}
								onKeyDown={(event) =>
									activateOnKeyboard({ event, action: button.action })
								}
								aria-label={button.label}
								aria-pressed={button.active}
							>
								{button.content}
							</Button>
						))}
					</div>
				</div>
				<div className="w-16 space-y-1.5">
					<Label className="text-xs">{t("caption.color")}</Label>
					<Input
						type="color"
						aria-label={t("caption.fontColor")}
						value={style.fontColor}
						onChange={(event) => onChange({ fontColor: event.target.value })}
						className="h-8 w-full cursor-pointer p-1"
					/>
				</div>
			</div>

			<CaptionStyleSlider
				label={t("caption.fontSize")}
				value={style.fontSize}
				min={8}
				max={200}
				step={1}
				onChange={(fontSize) => onChange({ fontSize })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<CaptionStyleSlider
				label={t("caption.characterSpacing")}
				value={style.letterSpacing}
				min={-10}
				max={50}
				step={0.5}
				onChange={(letterSpacing) => onChange({ letterSpacing })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<CaptionStyleSlider
				label={t("caption.lineSpacing")}
				value={style.lineSpacing}
				min={0.8}
				max={3}
				step={0.05}
				onChange={(lineSpacing) => onChange({ lineSpacing })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>

			<div className="space-y-1.5">
				<Label className="text-xs">{t("caption.horizontalAlignment")}</Label>
				<div className="grid grid-cols-3 gap-1">
					{horizontalAlignments.map((alignment) => {
						const Icon = alignment.icon;
						const active = style.textAlign === alignment.value;
						const action = () => onChange({ textAlign: alignment.value });
						return (
							<Button
								key={alignment.value}
								type="button"
								variant={active ? "default" : "outline"}
								size="sm"
								className="h-8"
								onClick={action}
								onKeyDown={(event) => activateOnKeyboard({ event, action })}
								aria-label={alignment.label}
								title={alignment.label}
								aria-pressed={active}
							>
								<Icon className="size-4" />
							</Button>
						);
					})}
				</div>
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs">{t("caption.screenPosition")}</Label>
				<div className="grid grid-cols-3 gap-1">
					{verticalAlignments.map((alignment) => {
						const active = style.position.align === alignment.value;
						const action = () =>
							onChange({
								position: {
									...style.position,
									align: alignment.value,
									y: alignment.y,
								},
							});
						return (
							<Button
								key={alignment.value}
								type="button"
								variant={active ? "default" : "outline"}
								size="sm"
								className="h-8 text-xs"
								onClick={action}
								onKeyDown={(event) => activateOnKeyboard({ event, action })}
								aria-pressed={active}
							>
								{alignment.label}
							</Button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
