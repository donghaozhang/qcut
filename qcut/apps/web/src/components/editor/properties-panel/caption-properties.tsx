import { Textarea } from "@/components/ui/textarea";
import { FontPicker } from "@/components/ui/font-picker";
import type { FontFamily } from "@/constants/font-constants";
import type { CaptionElement, SubtitleStyle } from "@/types/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import {
	resolveSubtitleStyle,
	DEFAULT_SUBTITLE_STYLE,
} from "@/lib/captions/subtitle-style";
import {
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
	PropertyGroup,
} from "./property-item";
import { KARAOKE_MODES, type KaraokeMode } from "@/lib/captions/karaoke-types";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";

export function CaptionProperties({
	element,
	trackId,
}: {
	element: CaptionElement;
	trackId: string;
}) {
	const { updateCaptionElement } = useTimelineStore();
	const style = resolveSubtitleStyle(element.style);

	const [fontSizeInput, setFontSizeInput] = useState(style.fontSize.toString());
	const [outlineWidthInput, setOutlineWidthInput] = useState(
		style.outlineWidth.toString()
	);
	const [bgOpacityInput, setBgOpacityInput] = useState(
		Math.round(style.bgOpacity * 100).toString()
	);
	const [fontOpacityInput, setFontOpacityInput] = useState(
		Math.round(style.fontOpacity * 100).toString()
	);

	useEffect(() => {
		const resolved = resolveSubtitleStyle(element.style);
		setFontSizeInput(resolved.fontSize.toString());
		setOutlineWidthInput(resolved.outlineWidth.toString());
		setBgOpacityInput(Math.round(resolved.bgOpacity * 100).toString());
		setFontOpacityInput(Math.round(resolved.fontOpacity * 100).toString());
	}, [element.style]);

	const updateStyle = useCallback(
		(updates: Partial<SubtitleStyle>) => {
			updateCaptionElement(trackId, element.id, {
				style: { ...style, ...updates },
			});
		},
		[updateCaptionElement, trackId, element.id, style]
	);

	const clamp = (val: string, min: number, max: number, fallback: number) => {
		const parsed = parseInt(val, 10);
		if (isNaN(parsed)) return fallback;
		return Math.max(min, Math.min(max, parsed));
	};

	return (
		<div className="space-y-6 p-5">
			<Textarea
				placeholder="Subtitle text"
				defaultValue={element.text}
				className="min-h-18 resize-none bg-background/50"
				onChange={(e) =>
					updateCaptionElement(trackId, element.id, {
						text: e.target.value,
					})
				}
			/>

			<PropertyGroup title="Text" defaultExpanded={true}>
				<PropertyItem direction="row">
					<PropertyItemLabel>Font</PropertyItemLabel>
					<PropertyItemValue>
						<FontPicker
							aria-label="Font family"
							defaultValue={style.fontFamily}
							onValueChange={(value: FontFamily) =>
								updateStyle({ fontFamily: value })
							}
						/>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="row">
					<PropertyItemLabel>Style</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								aria-pressed={style.bold}
								variant={style.bold ? "default" : "outline"}
								size="sm"
								onClick={() => updateStyle({ bold: !style.bold })}
								className="h-8 px-3 font-bold"
							>
								B
							</Button>
							<Button
								type="button"
								aria-pressed={style.italic}
								variant={style.italic ? "default" : "outline"}
								size="sm"
								onClick={() => updateStyle({ italic: !style.italic })}
								className="h-8 px-3 italic"
							>
								I
							</Button>
							<Button
								type="button"
								aria-pressed={style.underline}
								variant={style.underline ? "default" : "outline"}
								size="sm"
								onClick={() => updateStyle({ underline: !style.underline })}
								className="h-8 px-3 underline"
							>
								U
							</Button>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="column">
					<PropertyItemLabel>Font Size</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								aria-label="Font size"
								value={[style.fontSize]}
								min={8}
								max={200}
								step={1}
								onValueChange={([value]) => {
									updateStyle({ fontSize: value });
									setFontSizeInput(value.toString());
								}}
								className="w-full"
							/>
							<Input
								type="number"
								aria-label="Font size (number)"
								value={fontSizeInput}
								min={8}
								max={200}
								onChange={(e) => {
									setFontSizeInput(e.target.value);
									if (e.target.value.trim()) {
										const v = clamp(e.target.value, 8, 200, style.fontSize);
										updateStyle({ fontSize: v });
									}
								}}
								onBlur={() => {
									const v = clamp(fontSizeInput, 8, 200, style.fontSize);
									setFontSizeInput(v.toString());
									updateStyle({ fontSize: v });
								}}
								className="w-12 !text-xs h-7 rounded-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							/>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="row">
					<PropertyItemLabel>Color</PropertyItemLabel>
					<PropertyItemValue>
						<Input
							type="color"
							aria-label="Font color"
							value={style.fontColor}
							onChange={(e) => updateStyle({ fontColor: e.target.value })}
							className="w-full cursor-pointer rounded-full"
						/>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="column">
					<PropertyItemLabel>Opacity</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								aria-label="Font opacity"
								value={[style.fontOpacity * 100]}
								min={0}
								max={100}
								step={1}
								onValueChange={([value]) => {
									updateStyle({ fontOpacity: value / 100 });
									setFontOpacityInput(value.toString());
								}}
								className="w-full"
							/>
							<Input
								type="number"
								aria-label="Font opacity percent"
								value={fontOpacityInput}
								min={0}
								max={100}
								onChange={(e) => {
									setFontOpacityInput(e.target.value);
									if (e.target.value.trim()) {
										const v = clamp(
											e.target.value,
											0,
											100,
											Math.round(style.fontOpacity * 100)
										);
										updateStyle({ fontOpacity: v / 100 });
									}
								}}
								onBlur={() => {
									const v = clamp(
										fontOpacityInput,
										0,
										100,
										Math.round(style.fontOpacity * 100)
									);
									setFontOpacityInput(v.toString());
									updateStyle({ fontOpacity: v / 100 });
								}}
								className="w-12 !text-xs h-7 rounded-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							/>
						</div>
					</PropertyItemValue>
				</PropertyItem>
			</PropertyGroup>

			<PropertyGroup title="Outline / Shadow" defaultExpanded={false}>
				<PropertyItem direction="row">
					<PropertyItemLabel>Outline Color</PropertyItemLabel>
					<PropertyItemValue>
						<Input
							type="color"
							aria-label="Outline color"
							value={style.outlineColor}
							onChange={(e) => updateStyle({ outlineColor: e.target.value })}
							className="w-full cursor-pointer rounded-full"
						/>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="column">
					<PropertyItemLabel>Outline Width</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								aria-label="Outline width"
								value={[style.outlineWidth]}
								min={0}
								max={10}
								step={0.5}
								onValueChange={([value]) => {
									updateStyle({ outlineWidth: value });
									setOutlineWidthInput(value.toString());
								}}
								className="w-full"
							/>
							<Input
								type="number"
								aria-label="Outline width (number)"
								value={outlineWidthInput}
								min={0}
								max={10}
								onChange={(e) => {
									setOutlineWidthInput(e.target.value);
									if (e.target.value.trim()) {
										const parsed = parseFloat(e.target.value);
										if (!isNaN(parsed)) {
											updateStyle({
												outlineWidth: Math.max(0, Math.min(10, parsed)),
											});
										}
									}
								}}
								onBlur={() => {
									const parsed = parseFloat(outlineWidthInput);
									const v = isNaN(parsed)
										? style.outlineWidth
										: Math.max(0, Math.min(10, parsed));
									setOutlineWidthInput(v.toString());
									updateStyle({ outlineWidth: v });
								}}
								className="w-12 !text-xs h-7 rounded-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							/>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="row">
					<PropertyItemLabel>Shadow Color</PropertyItemLabel>
					<PropertyItemValue>
						<Input
							type="color"
							aria-label="Shadow color"
							value={style.shadowColor}
							onChange={(e) => updateStyle({ shadowColor: e.target.value })}
							className="w-full cursor-pointer rounded-full"
						/>
					</PropertyItemValue>
				</PropertyItem>
			</PropertyGroup>

			<PropertyGroup title="Background" defaultExpanded={false}>
				<PropertyItem direction="row">
					<PropertyItemLabel>Color</PropertyItemLabel>
					<PropertyItemValue>
						<Input
							type="color"
							aria-label="Background color"
							value={style.backgroundColor}
							onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
							className="w-full cursor-pointer rounded-full"
						/>
					</PropertyItemValue>
				</PropertyItem>

				<PropertyItem direction="column">
					<PropertyItemLabel>Opacity</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								aria-label="Background opacity"
								value={[style.bgOpacity * 100]}
								min={0}
								max={100}
								step={1}
								onValueChange={([value]) => {
									updateStyle({ bgOpacity: value / 100 });
									setBgOpacityInput(value.toString());
								}}
								className="w-full"
							/>
							<Input
								type="number"
								aria-label="Background opacity percent"
								value={bgOpacityInput}
								min={0}
								max={100}
								onChange={(e) => {
									setBgOpacityInput(e.target.value);
									if (e.target.value.trim()) {
										const v = clamp(
											e.target.value,
											0,
											100,
											Math.round(style.bgOpacity * 100)
										);
										updateStyle({ bgOpacity: v / 100 });
									}
								}}
								onBlur={() => {
									const v = clamp(
										bgOpacityInput,
										0,
										100,
										Math.round(style.bgOpacity * 100)
									);
									setBgOpacityInput(v.toString());
									updateStyle({ bgOpacity: v / 100 });
								}}
								className="w-12 !text-xs h-7 rounded-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							/>
						</div>
					</PropertyItemValue>
				</PropertyItem>
			</PropertyGroup>

			<PropertyGroup title="Position" defaultExpanded={false}>
				<PropertyItem direction="row">
					<PropertyItemLabel>Alignment</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							{(["top", "center", "bottom"] as const).map((align) => (
								<Button
									key={align}
									type="button"
									aria-pressed={style.position.align === align}
									variant={
										style.position.align === align ? "default" : "outline"
									}
									size="sm"
									onClick={() =>
										updateStyle({
											position: { ...style.position, align },
										})
									}
									className="h-8 px-3 capitalize text-xs"
								>
									{align}
								</Button>
							))}
						</div>
					</PropertyItemValue>
				</PropertyItem>
			</PropertyGroup>

			<KaraokeSection style={style} updateStyle={updateStyle} />
		</div>
	);
}

/** Karaoke mode selector + highlight color pickers (shown when word data available) */
function KaraokeSection({
	style,
	updateStyle,
}: {
	style: SubtitleStyle;
	updateStyle: (updates: Partial<SubtitleStyle>) => void;
}) {
	const hasWords = useWordTimelineStore(
		(s) => s.getNonDeletedWords().length > 0
	);

	if (!hasWords) return null;

	const karaokeMode = style.karaokeMode ?? "none";
	const isActive = karaokeMode !== "none";

	return (
		<PropertyGroup title="Karaoke" defaultExpanded={false}>
			<PropertyItem direction="row">
				<PropertyItemLabel>Mode</PropertyItemLabel>
				<PropertyItemValue>
					<Select
						value={karaokeMode}
						onValueChange={(value: string) =>
							updateStyle({ karaokeMode: value as KaraokeMode })
						}
					>
						<SelectTrigger className="h-8 text-xs" aria-label="Karaoke mode">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{KARAOKE_MODES.map((m) => (
								<SelectItem key={m.value} value={m.value}>
									{m.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyItemValue>
			</PropertyItem>

			{isActive && (
				<>
					<PropertyItem direction="row">
						<PropertyItemLabel>Highlight</PropertyItemLabel>
						<PropertyItemValue>
							<Input
								type="color"
								aria-label="Karaoke highlight color"
								value={style.highlightColor ?? "#ffff00"}
								onChange={(e) =>
									updateStyle({ highlightColor: e.target.value })
								}
								className="w-full cursor-pointer rounded-full"
							/>
						</PropertyItemValue>
					</PropertyItem>

					{karaokeMode === "karaoke" && (
						<PropertyItem direction="row">
							<PropertyItemLabel>Upcoming</PropertyItemLabel>
							<PropertyItemValue>
								<Input
									type="color"
									aria-label="Upcoming word color"
									value={style.upcomingColor ?? "#808080"}
									onChange={(e) =>
										updateStyle({ upcomingColor: e.target.value })
									}
									className="w-full cursor-pointer rounded-full"
								/>
							</PropertyItemValue>
						</PropertyItem>
					)}
				</>
			)}
		</PropertyGroup>
	);
}
