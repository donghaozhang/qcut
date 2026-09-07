import { useState } from "react";
import {
	Layers,
	Square,
	Sun,
	Sparkles,
	AlignVerticalJustifyCenter,
} from "lucide-react";
import {
	COVER_TEXT_STYLE_RANGES,
	resolveCoverTextStyle,
	type CoverTextLayerV1,
	type CoverTextStyleV1,
} from "@qcut/editor-core/cover";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";
import { activateCoverControl } from "./cover-tool";
import "./cover-text-style.css";

const GROUPS = {
	stroke: {
		zh: "描边",
		en: "Stroke",
		icon: Square,
		color: "strokeColor",
		fields: ["strokeWidth", "strokeOpacity"],
	},
	shadow: {
		zh: "阴影",
		en: "Shadow",
		icon: Sun,
		color: "shadowColor",
		fields: ["shadowOpacity", "shadowBlur", "shadowOffsetX", "shadowOffsetY"],
	},
	background: {
		zh: "背景",
		en: "Background",
		icon: Layers,
		color: "backgroundColor",
		fields: ["backgroundOpacity", "backgroundRadius", "backgroundPadding"],
	},
	glow: {
		zh: "发光",
		en: "Glow",
		icon: Sparkles,
		color: "glowColor",
		fields: ["glowOpacity", "glowBlur"],
	},
	layout: {
		zh: "排版",
		en: "Layout",
		icon: AlignVerticalJustifyCenter,
		color: null,
		fields: ["letterSpacing", "lineHeight"],
	},
} as const;

const FIELD_LABELS = {
	strokeWidth: ["粗细", "Width"],
	strokeOpacity: ["不透明度", "Opacity"],
	shadowOpacity: ["不透明度", "Opacity"],
	shadowBlur: ["模糊", "Blur"],
	shadowOffsetX: ["水平偏移", "Horizontal offset"],
	shadowOffsetY: ["垂直偏移", "Vertical offset"],
	backgroundOpacity: ["不透明度", "Opacity"],
	backgroundRadius: ["圆角", "Corner radius"],
	backgroundPadding: ["内边距", "Padding"],
	glowOpacity: ["不透明度", "Opacity"],
	glowBlur: ["范围", "Spread"],
	letterSpacing: ["字间距", "Letter spacing"],
	lineHeight: ["行距", "Line height"],
} as const;

function StylePopover({
	group,
	layer,
	canvas,
	disabled,
	onChange,
}: {
	group: keyof typeof GROUPS;
	layer: CoverTextLayerV1;
	canvas: { width: number; height: number };
	disabled: boolean;
	onChange: (changes: Partial<CoverTextLayerV1>) => void;
}) {
	const { locale } = useTranslation();
	const zh = locale === "zh";
	const [open, setOpen] = useState(false);
	const config = GROUPS[group];
	const label = zh ? config.zh : config.en;
	const Icon = config.icon;
	const style = resolveCoverTextStyle({
		fontSize: layer.fontSize,
		width: canvas.width * layer.width,
		height: canvas.height * layer.height,
		style: layer.textStyle,
	});
	const enabled =
		group === "layout" || (group === "glow" ? style.glowEnabled : layer[group]);
	const changeStyle = ({ changes }: { changes: Partial<CoverTextStyleV1> }) =>
		onChange({ textStyle: { ...layer.textStyle, ...changes } });
	return (
		<Popover open={open && !disabled} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					title={label}
					aria-label={label}
					disabled={disabled}
					className={`cover-tool ${enabled && group !== "layout" ? "is-active" : ""}`}
					data-testid={`cover-style-${group}`}
					onKeyDown={(event) => activateCoverControl({ event })}
				>
					<Icon size={16}>
						<title>{label}</title>
					</Icon>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="cover-style-popover"
				align="start"
				collisionPadding={12}
				aria-label={label}
				onEscapeKeyDown={(event) => event.stopPropagation()}
			>
				<header>
					<strong>{label}</strong>
					{group !== "layout" && (
						<label className="cover-style-enable">
							<input
								type="checkbox"
								checked={enabled}
								aria-label={`${zh ? "启用" : "Enable "}${label}`}
								onChange={(event) => {
									if (group === "glow")
										changeStyle({
											changes: { glowEnabled: event.target.checked },
										});
									else onChange({ [group]: event.target.checked });
								}}
							/>
							{zh ? "启用" : "Enabled"}
						</label>
					)}
				</header>
				<fieldset disabled={!enabled || disabled}>
					{config.color && (
						<label className="cover-style-field">
							<span>{zh ? "颜色" : "Color"}</span>
							<input
								type="color"
								aria-label={`${label} ${zh ? "颜色" : "Color"}`}
								value={style[config.color]}
								onChange={(event) => {
									if (config.color)
										changeStyle({
											changes: { [config.color]: event.target.value },
										});
								}}
							/>
							<output>{style[config.color].toUpperCase()}</output>
						</label>
					)}
					{config.fields.map((field) => {
						const [min, max] = COVER_TEXT_STYLE_RANGES[field];
						const fieldLabel = FIELD_LABELS[field][zh ? 0 : 1];
						const step = max === 1 ? 0.01 : field === "lineHeight" ? 0.1 : 1;
						return (
							<label key={field} className="cover-style-field">
								<span>{fieldLabel}</span>
								<input
									type="range"
									aria-label={`${label} ${fieldLabel}`}
									min={min}
									max={max}
									step={step}
									value={style[field]}
									onChange={(event) =>
										changeStyle({
											changes: { [field]: event.target.valueAsNumber },
										})
									}
								/>
								<input
									type="number"
									aria-label={`${label} ${fieldLabel} ${zh ? "数值" : "value"}`}
									min={min}
									max={max}
									step={step}
									value={Number(style[field].toFixed(2))}
									onChange={(event) => {
										const value = event.target.valueAsNumber;
										if (Number.isFinite(value))
											changeStyle({
												changes: {
													[field]: Math.max(min, Math.min(max, value)),
												},
											});
									}}
								/>
							</label>
						);
					})}
					{group === "layout" && (
						<label className="cover-style-field">
							<span>{zh ? "垂直对齐" : "Vertical align"}</span>
							<select
								value={style.verticalAlign}
								onChange={(event) =>
									changeStyle({
										changes: {
											verticalAlign: event.target
												.value as CoverTextStyleV1["verticalAlign"],
										},
									})
								}
							>
								<option value="top">{zh ? "顶部" : "Top"}</option>
								<option value="middle">{zh ? "居中" : "Middle"}</option>
								<option value="bottom">{zh ? "底部" : "Bottom"}</option>
							</select>
						</label>
					)}
				</fieldset>
			</PopoverContent>
		</Popover>
	);
}

export function CoverTextStyleControls({
	layer,
	canvas,
	disabled,
	onChange,
}: {
	layer?: CoverTextLayerV1;
	canvas?: { width: number; height: number };
	disabled: boolean;
	onChange: (changes: Partial<CoverTextLayerV1>) => void;
}) {
	if (!layer || !canvas) return null;
	return (
		<>
			{(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group) => (
				<StylePopover
					key={`${layer.id}:${group}`}
					group={group}
					layer={layer}
					canvas={canvas}
					disabled={disabled}
					onChange={onChange}
				/>
			))}
		</>
	);
}
