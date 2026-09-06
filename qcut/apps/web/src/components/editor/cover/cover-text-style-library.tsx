import { useEffect, useMemo, useRef, useState } from "react";
import {
	createCoverText,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import {
	BUILT_IN_TEXT_PRESETS,
	type TextStylePreset,
} from "@/lib/text/text-presets";
import {
	coverLabPreset,
	coverTextPresetChanges,
	coverWordArtChanges,
} from "@/lib/cover/cover-text-presets";
import { paintCoverText } from "@/lib/cover/cover-text-renderer";
import { useTranslation } from "@/lib/i18n";
import { useJianyingTextStyleLab } from "../media-panel/views/text-style-lab/use-jianying-text-style-lab";
import { activateCoverControl } from "./cover-tool";
import "./cover-text-style.css";
import { CoverWordArtCard } from "./cover-word-art-card";

const PRESET_ZH: Record<string, string> = {
	"clean-white": "纯白",
	subtitle: "字幕",
	"yellow-pop": "醒目黄字",
	"soft-shadow": "柔和阴影",
	highlight: "荧光底色",
	"red-label": "红色标签",
	"cyan-neon": "青色霓虹",
	"pink-neon": "粉色霓虹",
	"blue-outline": "蓝色描边",
	editorial: "杂志",
	"rounded-label": "圆角标签",
	"dark-bubble": "深色气泡",
	"yellow-callout": "黄色标注",
};

function StyleCard({
	preset,
	label,
	disabled,
	onApply,
}: {
	preset: TextStylePreset;
	label: string;
	disabled: boolean;
	onApply: () => void;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const { locale } = useTranslation();
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!ctx || !canvas) return;
		let cancelled = false;
		setFailed(false);
		const paint = () => {
			if (cancelled) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = "#292929";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			try {
				const dimensions = {
					width: 720,
					height: 240,
					backgroundColor: "#292929",
				};
				const layer = {
					...createCoverText({
						canvas: dimensions,
						content: locale === "zh" ? "封面文字" : "Cover",
						id: "sample",
					}),
					fontSize: 96,
					width: 0.96,
					height: 0.96,
				};
				paintCoverText({
					ctx,
					canvas: dimensions,
					layer: {
						...layer,
						...coverTextPresetChanges({ layer, canvas: dimensions, preset }),
					},
				});
			} catch {
				setFailed(true);
			}
		};
		paint();
		void document.fonts?.ready.then(paint);
		return () => {
			cancelled = true;
		};
	}, [preset, locale]);
	return (
		<button
			type="button"
			className="cover-style-card"
			title={label}
			aria-label={label}
			disabled={disabled || failed}
			onClick={onApply}
			onKeyDown={(event) => activateCoverControl({ event })}
			data-testid={`cover-preset-${preset.id}`}
		>
			<canvas ref={ref} width={720} height={240} />
			<span>{label}</span>
			{failed && (
				<span>{locale === "zh" ? "样式不可用" : "Style unavailable"}</span>
			)}
		</button>
	);
}

export function CoverTextStyleLibrary({
	layer,
	canvas,
	disabled,
	onChange,
	onError,
}: {
	layer?: CoverTextLayerV1;
	canvas?: { width: number; height: number };
	disabled: boolean;
	onChange: (changes: Partial<CoverTextLayerV1>) => void;
	onError: (message: string) => void;
}) {
	const { locale } = useTranslation();
	const zh = locale === "zh";
	const [source, setSource] = useState("presets");
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("all");
	const [limit, setLimit] = useState(24);
	const lab = useJianyingTextStyleLab({ enabled: source === "lab" });
	const labPresets = useMemo(
		() =>
			lab.result.styles.flatMap((style) => {
				const preset = coverLabPreset({ style });
				return preset || style.runtimeReference
					? [
							{
								preset: preset ?? {
									id: style.styleId,
									name: style.title ?? style.resourceId,
									updates: {},
								},
								style,
								categoryIds: style.categoryIds,
								approximate: style.compatibility !== "flat-compatible",
							},
						]
					: [];
			}),
		[lab.result.styles]
	);
	const candidates =
		source === "lab"
			? labPresets
			: BUILT_IN_TEXT_PRESETS.map((preset) => ({
					preset,
					style: undefined,
					categoryIds: [] as string[],
					approximate: false,
				}));
	const entries = candidates
		.map((entry) => ({
			...entry,
			label:
				source === "lab"
					? `${entry.style?.runtimeReference ? (zh ? "本机原版渲染" : "Native runtime") : entry.approximate ? (zh ? "近似样式" : "Approximate") : zh ? "兼容样式" : "Compatible"} · ${entry.preset.name}`
					: zh
						? (PRESET_ZH[entry.preset.id] ?? entry.preset.name)
						: entry.preset.name,
		}))
		.filter(
			(entry) =>
				(source !== "lab" ||
					category === "all" ||
					entry.categoryIds.some((id) => id === category)) &&
				`${entry.label} ${entry.preset.name} ${entry.style?.resourceId ?? ""}`
					.toLowerCase()
					.includes(query.trim().toLowerCase())
		);
	return (
		<section
			className="cover-style-library"
			aria-label={zh ? "文字样式" : "Text styles"}
		>
			<div
				className="cover-tabs"
				role="group"
				aria-label={zh ? "样式来源" : "Style source"}
			>
				{["presets", "lab"].map((id) => (
					<button
						type="button"
						key={id}
						aria-pressed={source === id}
						onClick={() => {
							setSource(id);
							setLimit(24);
							setQuery("");
						}}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						{id === "presets"
							? zh
								? "文字预设"
								: "Presets"
							: zh
								? "花字实验室"
								: "Word-art lab"}
					</button>
				))}
			</div>
			<input
				type="search"
				aria-label={zh ? "搜索文字样式" : "Search text styles"}
				placeholder={zh ? "搜索" : "Search"}
				value={query}
				onChange={(event) => {
					setQuery(event.target.value);
					setLimit(24);
				}}
			/>
			{source === "lab" && (
				<>
					<select
						aria-label={zh ? "花字类别" : "Word-art category"}
						value={category}
						onChange={(event) => {
							setCategory(event.target.value);
							setLimit(24);
						}}
					>
						<option value="all">{zh ? "全部" : "All"}</option>
						{lab.result.categories.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
					<div className="cover-style-status" role="status">
						{lab.checking
							? zh
								? "正在读取花字实验室…"
								: "Loading word-art lab…"
							: lab.error ||
								`${labPresets.length} / ${lab.result.count} ${zh ? "可应用花字" : "applicable styles"}`}
					</div>
				</>
			)}
			{!layer && (
				<div className="cover-style-status">
					{zh ? "未选中文字" : "No text selected"}
				</div>
			)}
			<div className="cover-style-grid">
				{entries.slice(0, limit).map(({ preset, label, style }) =>
					style ? (
						<CoverWordArtCard
							key={style.styleId}
							style={style}
							zh={zh}
							disabled={disabled || !layer || !canvas}
							selected={
								layer?.jianyingTextStyle?.resourceId === style.resourceId &&
								layer?.jianyingTextStyle?.packageHash ===
									style.runtimeReference?.packageHash
							}
							onApply={() => {
								if (!layer || !canvas) return;
								try {
									onChange(coverWordArtChanges({ layer, canvas, style }));
								} catch (reason) {
									onError(
										reason instanceof Error ? reason.message : String(reason)
									);
								}
							}}
						/>
					) : (
						<StyleCard
							key={preset.id}
							preset={preset}
							label={label}
							disabled={disabled || !layer || !canvas}
							onApply={() => {
								if (!layer || !canvas) return;
								try {
									onChange(coverTextPresetChanges({ layer, canvas, preset }));
								} catch (reason) {
									onError(
										reason instanceof Error ? reason.message : String(reason)
									);
								}
							}}
						/>
					)
				)}
			</div>
			{!entries.length && !lab.checking && !lab.error && (
				<div className="cover-style-status">
					{zh ? "无匹配样式" : "No matching styles"}
				</div>
			)}
			{entries.length > limit && (
				<button
					type="button"
					className="cover-command"
					onClick={() => setLimit((value) => value + 24)}
					onKeyDown={(event) => activateCoverControl({ event })}
				>
					{zh ? "加载更多" : "Load more"}
				</button>
			)}
		</section>
	);
}
