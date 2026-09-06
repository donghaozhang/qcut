import {
	AlignLeft,
	AlignCenter,
	AlignRight,
	Bold,
	Italic,
	Underline,
	Trash2,
	ArrowUpToLine,
	ArrowDownToLine,
	Eraser,
} from "lucide-react";
import type { CoverTextLayerV1 } from "@qcut/editor-core/cover";
import { useTranslation } from "@/lib/i18n";
import { CoverTool } from "./cover-tool";
import { CoverTextStyleControls } from "./cover-text-style-controls";
import { JianyingFontLabDialog } from "../properties-panel/jianying-font-lab-dialog";

export function CoverTextToolbar({
	layer,
	canvas,
	disabled,
	onChange,
	onDelete,
	onOrder,
}: {
	layer?: CoverTextLayerV1;
	canvas?: { width: number; height: number };
	disabled: boolean;
	onChange: (changes: Partial<CoverTextLayerV1>) => void;
	onDelete: () => void;
	onOrder: (direction: "front" | "back") => void;
}) {
	const { t, locale } = useTranslation();
	const off = disabled || !layer;
	const flatOff = off || Boolean(layer?.jianyingTextStyle);
	return (
		<div className="cover-text-toolbar">
			<textarea
				aria-label={t("editor.cover.textContent")}
				value={layer?.content ?? ""}
				disabled={off}
				maxLength={2000}
				rows={2}
				onChange={(event) => onChange({ content: event.target.value })}
				data-testid="cover-text-content"
			/>
			<div className="cover-toolbar-row">
				<select
					aria-label={t("editor.cover.font")}
					value={
						layer?.fontAsset?.assetId ??
						(layer?.jianyingTextStyle ? "sans-serif" : layer?.fontFamily) ??
						"sans-serif"
					}
					disabled={off}
					onChange={(event) => {
						if (event.target.value === layer?.fontAsset?.assetId) return;
						onChange({
							fontFamily: event.target.value as CoverTextLayerV1["fontFamily"],
							fontAsset: undefined,
						});
					}}
				>
					<option value="sans-serif">{t("editor.cover.sans")}</option>
					<option value="serif" disabled={Boolean(layer?.jianyingTextStyle)}>
						{t("editor.cover.serif")}
					</option>
					<option
						value="monospace"
						disabled={Boolean(layer?.jianyingTextStyle)}
					>
						{t("editor.cover.mono")}
					</option>
					{layer?.fontAsset && (
						<option value={layer.fontAsset.assetId}>
							{layer.fontAsset.familyName}
						</option>
					)}
				</select>
				<JianyingFontLabDialog
					key={layer?.id ?? "none"}
					initialSample={layer?.content ?? ""}
					currentAssetId={layer?.fontAsset?.assetId}
					disabled={off}
					contentClassName="cover-font-popover"
					onApply={({ asset }) => {
						if (!off) onChange({ fontAsset: asset });
					}}
				/>
				<input
					type="number"
					min={8}
					max={512}
					step={1}
					aria-label={t("editor.cover.fontSize")}
					value={layer?.fontSize ?? 48}
					disabled={off}
					className="cover-number"
					onChange={(event) => {
						const value = event.target.valueAsNumber;
						if (Number.isFinite(value))
							onChange({ fontSize: Math.max(8, Math.min(512, value)) });
					}}
				/>
				<input
					type="color"
					aria-label={t("editor.cover.color")}
					title={t("editor.cover.color")}
					value={layer?.color ?? "#ffffff"}
					disabled={flatOff}
					onChange={(event) => onChange({ color: event.target.value })}
				/>
				<CoverTool
					icon={Bold}
					label={t("editor.cover.bold")}
					active={layer?.bold}
					disabled={flatOff}
					onClick={() => onChange({ bold: !layer?.bold })}
				/>
				<CoverTool
					icon={Italic}
					label={t("editor.cover.italic")}
					active={layer?.italic}
					disabled={flatOff}
					onClick={() => onChange({ italic: !layer?.italic })}
				/>
				<CoverTool
					icon={Underline}
					label={t("editor.cover.underline")}
					active={layer?.underline}
					disabled={flatOff}
					onClick={() => onChange({ underline: !layer?.underline })}
				/>
				<CoverTextStyleControls
					layer={layer}
					canvas={canvas}
					disabled={flatOff}
					onChange={onChange}
				/>
				<CoverTool
					icon={AlignLeft}
					label={t("editor.cover.alignLeft")}
					active={layer?.align === "left"}
					disabled={flatOff}
					onClick={() => onChange({ align: "left" })}
				/>
				<CoverTool
					icon={AlignCenter}
					label={t("editor.cover.alignCenter")}
					active={layer?.align === "center"}
					disabled={flatOff}
					onClick={() => onChange({ align: "center" })}
				/>
				<CoverTool
					icon={AlignRight}
					label={t("editor.cover.alignRight")}
					active={layer?.align === "right"}
					disabled={flatOff}
					onClick={() => onChange({ align: "right" })}
				/>
				<CoverTool
					icon={ArrowUpToLine}
					label={t("editor.cover.front")}
					disabled={off}
					onClick={() => onOrder("front")}
				/>
				<CoverTool
					icon={ArrowDownToLine}
					label={t("editor.cover.back")}
					disabled={off}
					onClick={() => onOrder("back")}
				/>
				<CoverTool
					icon={Trash2}
					label={t("editor.cover.deleteText")}
					disabled={off}
					onClick={onDelete}
				/>
			</div>
			{layer?.jianyingTextStyle && (
				<div className="cover-native-frame">
					<span>
						{locale === "zh" ? "本机原版花字" : "Native word art"} ·{" "}
						{layer.jianyingTextStyle.packageKind}
					</span>
					<label>
						{locale === "zh" ? "取帧 (秒)" : "Frame (s)"}
						<input
							type="number"
							min={0}
							max={Math.max(
								0,
								layer.jianyingTextStyle.templateDuration - 0.001
							)}
							step={0.1}
							disabled={off}
							value={
								layer.nativeFrameTime ??
								Math.min(1, layer.jianyingTextStyle.templateDuration / 2)
							}
							onChange={(event) => {
								const value = event.target.valueAsNumber;
								if (Number.isFinite(value))
									onChange({
										nativeFrameTime: Math.max(
											0,
											Math.min(
												layer.jianyingTextStyle!.templateDuration - 0.001,
												value
											)
										),
									});
							}}
						/>
					</label>
					<CoverTool
						icon={Eraser}
						label={locale === "zh" ? "移除原生花字" : "Remove native word art"}
						disabled={off}
						onClick={() =>
							onChange({
								jianyingTextStyle: undefined,
								nativeFrameTime: undefined,
							})
						}
					/>
				</div>
			)}
			{layer && (
				<div className="cover-text-geometry">
					<label>
						{t("editor.cover.textWidth")}
						<input
							type="range"
							min={5}
							max={100}
							value={Math.round(layer.width * 100)}
							disabled={off}
							onChange={(event) =>
								onChange({ width: Number(event.target.value) / 100 })
							}
						/>
					</label>
					<label>
						{t("editor.cover.textHeight")}
						<input
							type="range"
							min={5}
							max={100}
							value={Math.round(layer.height * 100)}
							disabled={off}
							onChange={(event) =>
								onChange({ height: Number(event.target.value) / 100 })
							}
						/>
					</label>
					<label>
						{t("editor.cover.rotation")}
						<input
							type="number"
							min={-180}
							max={180}
							value={layer.rotation}
							disabled={off}
							onChange={(event) => {
								const value = event.target.valueAsNumber;
								if (Number.isFinite(value))
									onChange({ rotation: Math.max(-180, Math.min(180, value)) });
							}}
						/>
					</label>
				</div>
			)}
		</div>
	);
}
