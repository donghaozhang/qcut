import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertTriangle,
	Check,
	FlaskConical,
	HardDriveDownload,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	createLocalFontAssetReference,
	ensureLocalFontLoaded,
	loadTransientLocalFontFace,
} from "@/lib/fonts/local-font-runtime";
import type { JianyingFontLabFontSummary } from "@/types/electron";
import type { TextFontAssetReference } from "@/types/timeline";
import { useJianyingFontLab } from "./use-jianying-font-lab";

const ALL_SOURCES = "all";
const TRIAL_FONT_COUNT = 5;
const SOURCE_OPTIONS = [
	{ id: ALL_SOURCES, label: "本机剪映缓存" },
	{ id: "effect", label: "字体与效果" },
	{ id: "artist-effect", label: "花字资源" },
	{ id: "ai-text-template", label: "AI 文字模板" },
	{ id: "gecko", label: "模板运行时" },
] as const;
type FontSourceFilter = (typeof SOURCE_OPTIONS)[number]["id"];
type FontView = "trial" | "all";
type PreviewState = "loading" | "ready" | "error";

function resolveSourceFilter({ value }: { value: string }): FontSourceFilter {
	return (
		SOURCE_OPTIONS.find((option) => option.id === value)?.id ?? ALL_SOURCES
	);
}

function containsHanCharacters({ value }: { value: string }) {
	return /\p{Script=Han}/u.test(value);
}

function getFontDisplayName({ font }: { font: JianyingFontLabFontSummary }) {
	if (containsHanCharacters({ value: font.familyName })) return font.familyName;
	if (containsHanCharacters({ value: font.fullName })) return font.fullName;
	return font.familyName;
}

function compareFontRows({
	left,
	right,
}: {
	left: JianyingFontLabFontSummary;
	right: JianyingFontLabFontSummary;
}) {
	const leftName = getFontDisplayName({ font: left });
	const rightName = getFontDisplayName({ font: right });
	const leftHasHan = containsHanCharacters({ value: leftName });
	const rightHasHan = containsHanCharacters({ value: rightName });
	if (leftHasHan !== rightHasHan) return leftHasHan ? -1 : 1;
	return (
		leftName.localeCompare(rightName, "zh-CN") ||
		left.fontId.localeCompare(right.fontId)
	);
}

function getTrialFonts({ fonts }: { fonts: JianyingFontLabFontSummary[] }) {
	const chineseNamedFonts = fonts.filter((font) =>
		containsHanCharacters({ value: getFontDisplayName({ font }) })
	);
	const selected = chineseNamedFonts.slice(0, TRIAL_FONT_COUNT);
	if (selected.length === TRIAL_FONT_COUNT) return selected;
	const selectedIds = new Set(selected.map(({ fontId }) => fontId));
	const fallback = fonts.filter(({ fontId }) => !selectedIds.has(fontId));
	return [...selected, ...fallback].slice(0, TRIAL_FONT_COUNT);
}

function useLazyFontPreview({ font }: { font: JianyingFontLabFontSummary }) {
	const rowRef = useRef<HTMLButtonElement>(null);
	const [previewState, setPreviewState] = useState<PreviewState>("loading");

	useEffect(() => {
		let active = true;
		let release: (() => boolean) | null = null;
		let observer: IntersectionObserver | null = null;
		let started = false;
		setPreviewState("loading");

		const loadPreview = () => {
			if (started) return;
			started = true;
			void loadTransientLocalFontFace({
				asset: createLocalFontAssetReference({ font }),
			})
				.then((loaded) => {
					if (!active) {
						loaded.release();
						return;
					}
					release = loaded.release;
					setPreviewState("ready");
				})
				.catch(() => {
					if (active) setPreviewState("error");
				});
		};

		if (typeof IntersectionObserver === "undefined") {
			loadPreview();
		} else if (rowRef.current) {
			observer = new IntersectionObserver((entries) => {
				if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
				observer?.disconnect();
				loadPreview();
			});
			observer.observe(rowRef.current);
		} else {
			loadPreview();
		}

		return () => {
			active = false;
			observer?.disconnect();
			release?.();
		};
	}, [font]);

	return { previewState, rowRef };
}

function LocalFontRow({
	font,
	selected,
	applying,
	onSelect,
}: {
	font: JianyingFontLabFontSummary;
	selected: boolean;
	applying: boolean;
	onSelect: ({ font }: { font: JianyingFontLabFontSummary }) => void;
}) {
	const { previewState, rowRef } = useLazyFontPreview({ font });
	const displayName = getFontDisplayName({ font });

	return (
		<button
			ref={rowRef}
			type="button"
			className={cn(
				"flex h-11 w-full min-w-0 items-center gap-2 rounded-sm px-2.5 text-left transition-colors",
				selected
					? "bg-white/10 text-foreground"
					: "text-foreground/90 hover:bg-white/[0.06]"
			)}
			aria-label={`应用字体 ${displayName}`}
			aria-pressed={selected}
			data-testid="jianying-font-card"
			disabled={applying}
			onClick={() => onSelect({ font })}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			<span className="flex size-4 shrink-0 items-center justify-center text-cyan-400">
				{applying ? <Loader2 className="size-3.5 animate-spin" /> : null}
				{selected && !applying ? <Check className="size-3.5" /> : null}
			</span>
			<span
				className="min-w-0 flex-1 truncate text-[17px] leading-none"
				style={{
					fontFamily: previewState === "ready" ? font.cssFamily : "sans-serif",
				}}
				title={`${displayName} · ${font.postscriptName}`}
			>
				{displayName}
			</span>
			{previewState === "loading" && !applying ? (
				<Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
			) : null}
			{previewState === "error" ? (
				<AlertTriangle
					className="size-3.5 shrink-0 text-amber-400"
					aria-label="字体预览加载失败"
				/>
			) : null}
			{previewState === "ready" ? (
				<HardDriveDownload className="size-3.5 shrink-0 text-muted-foreground">
					<title>本机已缓存</title>
				</HardDriveDownload>
			) : null}
		</button>
	);
}

function JianyingFontLabBody({
	initialSample,
	currentAssetId,
	onApply,
}: {
	initialSample: string;
	currentAssetId?: string;
	onApply: ({ asset }: { asset: TextFontAssetReference }) => void;
}) {
	const { checking, result, error, refresh } = useJianyingFontLab();
	const [query, setQuery] = useState("");
	const [source, setSource] = useState<FontSourceFilter>(ALL_SOURCES);
	const [view, setView] = useState<FontView>("trial");
	const [selectedFontId, setSelectedFontId] = useState(currentAssetId ?? "");
	const [applyingFontId, setApplyingFontId] = useState("");
	const [coverageMessage, setCoverageMessage] = useState("");

	useEffect(() => {
		setSelectedFontId(currentAssetId ?? "");
	}, [currentAssetId]);

	const orderedFonts = useMemo(
		() =>
			[...result.fonts].sort((left, right) => compareFontRows({ left, right })),
		[result.fonts]
	);
	const sourceFonts = useMemo(
		() =>
			source === ALL_SOURCES
				? orderedFonts
				: orderedFonts.filter((font) => font.sourceKinds.includes(source)),
		[orderedFonts, source]
	);
	const trialFonts = useMemo(
		() => getTrialFonts({ fonts: sourceFonts }),
		[sourceFonts]
	);
	const filteredFonts = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const baseFonts = view === "trial" ? trialFonts : sourceFonts;
		if (!normalizedQuery) return baseFonts;
		return sourceFonts.filter((font) =>
			[
				getFontDisplayName({ font }),
				font.familyName,
				font.fullName,
				font.postscriptName,
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(normalizedQuery)
		);
	}, [query, sourceFonts, trialFonts, view]);
	const selectedFont = result.fonts.find(
		(font) => font.fontId === selectedFontId
	);

	const applyFont = async ({ font }: { font: JianyingFontLabFontSummary }) => {
		const api = window.electronAPI?.jianyingFontLab;
		if (!api) {
			setCoverageMessage("字体实验室仅在 QCut 桌面版中可用");
			return;
		}
		setApplyingFontId(font.fontId);
		setCoverageMessage("");
		try {
			const text = initialSample.trim() || "字体实验";
			const inspection = await api.inspect({ fontId: font.fontId, text });
			if (!inspection.covered) {
				const missing = inspection.missing
					.slice(0, 8)
					.map(({ character, unicode }) => `${character} (${unicode})`)
					.join("、");
				setCoverageMessage(`该字体缺少当前文字所需字形：${missing}`);
				return;
			}
			const asset = createLocalFontAssetReference({ font });
			await ensureLocalFontLoaded({ asset });
			onApply({ asset });
			setSelectedFontId(font.fontId);
		} catch (cause) {
			setCoverageMessage(
				cause instanceof Error ? cause.message : "无法加载本机剪映字体"
			);
		} finally {
			setApplyingFontId("");
		}
	};

	return (
		<div className="space-y-2" data-testid="jianying-font-picker-popover">
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={query}
					className="h-8 border-white/10 bg-black/30 pl-8 pr-9 text-xs"
					placeholder="搜索字体"
					aria-label="搜索本机剪映字体"
					onChange={(event) => {
						const nextQuery = event.target.value;
						setQuery(nextQuery);
						if (nextQuery.trim()) setView("all");
					}}
				/>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="absolute right-0.5 top-0.5 size-7"
					title="重新扫描本机字体"
					aria-label="重新扫描本机字体"
					disabled={checking}
					onClick={() => void refresh({ force: true })}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
				</Button>
			</div>

			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="text"
					size="sm"
					className={cn(
						"h-6 rounded-full px-2.5 text-[11px]",
						view === "trial"
							? "bg-white/10 text-foreground"
							: "text-muted-foreground"
					)}
					onClick={() => {
						setView("trial");
						setQuery("");
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					五款预览
				</Button>
				<Button
					type="button"
					variant="text"
					size="sm"
					className={cn(
						"h-6 rounded-full px-2.5 text-[11px]",
						view === "all"
							? "bg-white/10 text-foreground"
							: "text-muted-foreground"
					)}
					onClick={() => setView("all")}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					全部
				</Button>
				<span className="ml-auto text-[10px] text-muted-foreground">
					点击字体即应用
				</span>
			</div>

			<div className="flex h-7 items-center justify-between border-y border-white/[0.06] px-1">
				<Select
					value={source}
					onValueChange={(value) => setSource(resolveSourceFilter({ value }))}
				>
					<SelectTrigger
						className="h-6 w-auto min-w-28 border-0 bg-transparent px-1.5 text-[11px] shadow-none"
						aria-label="筛选字体来源"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SOURCE_OPTIONS.map((option) => (
							<SelectItem key={option.id} value={option.id} className="text-xs">
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="pr-1 text-[10px] text-muted-foreground">
					{checking ? "扫描中" : `${filteredFonts.length} / ${result.count}`}
				</span>
			</div>

			{error ? (
				<div className="flex h-[220px] items-center justify-center px-5 text-center text-xs text-destructive">
					{error}
				</div>
			) : null}
			{!error && checking && result.fonts.length === 0 ? (
				<div className="flex h-[220px] items-center justify-center gap-2 text-xs text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					正在读取本机剪映字体
				</div>
			) : null}
			{!error && !checking && filteredFonts.length === 0 ? (
				<div className="flex h-[220px] items-center justify-center px-5 text-center text-xs text-muted-foreground">
					没有找到符合条件的本机字体
				</div>
			) : null}
			{!error && filteredFonts.length > 0 ? (
				<div
					className="h-[220px] overflow-y-auto"
					data-testid="jianying-font-list"
				>
					{filteredFonts.map((font) => (
						<LocalFontRow
							key={font.fontId}
							font={font}
							selected={selectedFontId === font.fontId}
							applying={applyingFontId === font.fontId}
							onSelect={({ font: selected }) =>
								void applyFont({ font: selected })
							}
						/>
					))}
				</div>
			) : null}

			{coverageMessage ? (
				<div className="flex items-start gap-2 border-t border-amber-500/20 px-2 pt-2 text-[11px] text-amber-400">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					<span>{coverageMessage}</span>
				</div>
			) : null}
			<div className="flex min-h-4 items-center justify-between gap-3 px-1 text-[10px] text-muted-foreground">
				<span className="truncate">
					{selectedFont
						? `${getFontDisplayName({ font: selectedFont })} · ${selectedFont.postscriptName}`
						: `${result.fileCount} 个缓存文件 · ${result.duplicateFileCount} 个重复副本`}
				</span>
			</div>
		</div>
	);
}

export function JianyingFontLabDialog({
	initialSample,
	currentAssetId,
	onApply,
}: {
	initialSample: string;
	currentAssetId?: string;
	onApply: ({ asset }: { asset: TextFontAssetReference }) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-9 shrink-0"
					title="打开本机字体实验室"
					aria-label="打开本机字体实验室"
				>
					<FlaskConical className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				side="bottom"
				sideOffset={6}
				className="w-[520px] max-w-[calc(100vw-16px)] rounded-md border-white/10 bg-[#292929] p-2 shadow-2xl"
			>
				{open ? (
					<JianyingFontLabBody
						initialSample={initialSample || "字体实验"}
						currentAssetId={currentAssetId}
						onApply={onApply}
					/>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
