import { useEffect, useState } from "react";
import { Ban, Check, AlertTriangle, RefreshCw, Type } from "lucide-react";
import {
	JIANYING_COVER_CATEGORIES,
	type CoverLibraryResult,
} from "../../../../../../electron/jianying-cover-contract";
import { loadPrivateCoverLibrary } from "@/lib/cover/private-cover-library";
import { useTranslation } from "@/lib/i18n";
import { activateCoverControl } from "./cover-tool";

function dependencySourceLabel({
	source,
	reference,
	zh,
}: {
	source: string;
	reference: string;
	zh: boolean;
}) {
	if (source === "filter-lab") return zh ? "滤镜实验室" : "Filter Lab";
	if (source === "application-builtin")
		return zh ? "应用内置资源" : "Application builtin";
	if (reference.startsWith("textEffect/"))
		return zh ? "花字实验室" : "Word Art Lab";
	return zh ? "字体实验室" : "Font Lab";
}

export function CoverPrivateLibrary({
	onClear,
	disabled,
	onApply,
	importing = false,
}: {
	onClear: () => void;
	disabled: boolean;
	onApply?: (packageHash: string) => void;
	importing?: boolean;
}) {
	const { locale } = useTranslation();
	const zh = locale === "zh";
	const [category, setCategory] = useState("default");
	const [catalog, setCatalog] = useState<CoverLibraryResult | null>(null);
	const [error, setError] = useState(false);
	const [revision, setRevision] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Refresh explicitly starts a new cache read.
	useEffect(() => {
		let cancelled = false;
		setCatalog(null);
		setError(false);
		void loadPrivateCoverLibrary()
			.then((result) => {
				if (!cancelled) setCatalog(result);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [revision]);
	const entries =
		catalog?.entries.filter(
			(entry) =>
				category === "default" || entry.categories.some((id) => id === category)
		) ?? [];
	const detail = entries.find((entry) => entry.packageHash === selected);
	const nativeAvailable = Boolean(window.electronAPI?.jianyingTextRuntime);
	const canApply = ({
		entry,
	}: {
		entry: CoverLibraryResult["entries"][number];
	}) =>
		Boolean(
			onApply &&
				entry.textLayout?.ready &&
				(!entry.textLayout.requiresNative || nativeAvailable) &&
				!disabled &&
				!importing
		);
	return (
		<div className="cover-template-body" data-testid="cover-private-library">
			<nav
				className="cover-categories"
				aria-label={zh ? "剪映封面分类" : "Jianying cover categories"}
			>
				{JIANYING_COVER_CATEGORIES.map((item) => (
					<button
						type="button"
						key={item.id}
						aria-pressed={category === item.id}
						onClick={() => {
							setCategory(item.id);
							setSelected(null);
						}}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						{zh ? item.zh : item.en}
					</button>
				))}
			</nav>
			<div className="cover-private-content">
				<div className="cover-cache-status">
					<span>
						{zh ? "已缓存" : "Cached"} {entries.length}
					</span>
					<button
						type="button"
						className="cover-tool"
						title={zh ? "刷新缓存" : "Refresh cache"}
						aria-label={zh ? "刷新缓存" : "Refresh cache"}
						onClick={() => setRevision((value) => value + 1)}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						<RefreshCw size={14} />
					</button>
				</div>
				{error ? (
					<p role="alert">
						{zh ? "缓存读取或校验失败" : "Cache unavailable or invalid"}
					</p>
				) : catalog ? null : (
					<p role="status">{zh ? "读取缓存中…" : "Loading cache…"}</p>
				)}
				<div className="cover-template-grid">
					{category === "default" && (
						<button
							type="button"
							className="cover-template"
							disabled={disabled || importing}
							onClick={onClear}
							onKeyDown={(event) => activateCoverControl({ event })}
						>
							<div className="cover-template-image">
								<Ban size={22} />
							</div>
							<span>{zh ? "无模板" : "None"}</span>
						</button>
					)}
					{entries.map((entry) => (
						<button
							type="button"
							className={`cover-template ${selected === entry.packageHash ? "is-selected" : ""}`}
							key={entry.packageHash}
							title={entry.title}
							aria-pressed={selected === entry.packageHash}
							disabled={disabled || importing}
							onClick={() => {
								setSelected(entry.packageHash);
								if (canApply({ entry })) onApply?.(entry.packageHash);
							}}
							onKeyDown={(event) => activateCoverControl({ event })}
							data-testid={`cover-cached-${entry.packageHash}`}
						>
							<div className="cover-template-image">
								<img src={entry.previewDataUrl} alt="" />
							</div>
							<span>{entry.title}</span>
							<small>
								{entry.cacheStatus === "complete" ? (
									<Check size={12} />
								) : (
									<AlertTriangle size={12} />
								)}
								{entry.cacheStatus === "complete"
									? zh
										? "资源已缓存"
										: "Resources cached"
									: entry.dependencies
												.filter((item) => item.status !== "cached")
												.every((item) => item.usage?.role === "background")
										? zh
											? "缺背景滤镜"
											: "Background filter missing"
										: zh
											? "依赖不完整"
											: "Missing dependencies"}
							</small>
							{entry.textLayout?.ready && (
								<small>{zh ? "文字资源就绪" : "Text resources ready"}</small>
							)}
						</button>
					))}
				</div>
				{catalog && !entries.length && (
					<p role="status">
						{zh
							? "此分类尚无已缓存模板"
							: "No cached templates in this category"}
					</p>
				)}
				{detail && (
					<section
						className="cover-cache-detail"
						aria-label={zh ? "模板缓存详情" : "Template cache details"}
					>
						<strong>{detail.title}</strong>
						<p>{zh ? "完整模板：未接入" : "Full template: not connected"}</p>
						{detail.textLayout?.ready ? (
							<button
								type="button"
								className="cover-command"
								disabled={!canApply({ entry: detail })}
								onClick={() => onApply?.(detail.packageHash)}
								onKeyDown={(event) => activateCoverControl({ event })}
							>
								<Type size={14} />
								{importing
									? zh
										? "准备中…"
										: "Preparing…"
									: zh
										? "套用文字布局"
										: "Apply text layout"}
							</button>
						) : (
							<p>
								{detail.textLayout?.reason === "vertical-text"
									? zh
										? "竖排文字待接入"
										: "Vertical text pending"
									: zh
										? "文字布局不可用"
										: "Text layout unavailable"}
							</p>
						)}
						{detail.textLayout?.requiresNative && !nativeAvailable && (
							<p>
								{zh
									? "原生花字需 QCut 桌面版"
									: "Native word art requires QCut desktop"}
							</p>
						)}
						{detail.textLayout?.ready && (
							<p>
								{zh
									? "背景：保留当前图像与裁切"
									: "Background: current image and crop"}
							</p>
						)}
						<p>
							{detail.textCount} {zh ? "个文字图层" : "text layers"} ·{" "}
							{
								detail.dependencies.filter((item) => item.status === "cached")
									.length
							}
							/{detail.dependencies.length}{" "}
							{zh ? "项依赖已缓存" : "dependencies cached"}
						</p>
						<ul>
							{detail.dependencies.map((item) => (
								<li key={item.reference}>
									{item.status === "cached" ? "✓" : "!"}{" "}
									{item.usage?.name || item.resolution?.label || item.reference}
									{item.usage && (
										<small>
											{item.usage.role === "background"
												? zh
													? "背景轨道"
													: "Background track"
												: item.usage.role === "text"
													? zh
														? "文字图层"
														: "Text layer"
													: zh
														? "用途待确认"
														: "Usage unresolved"}
											{item.usage.resourceId
												? ` · ${item.usage.resourceId}`
												: ""}
										</small>
									)}
									{item.resolution && (
										<small>
											{dependencySourceLabel({
												source: item.resolution.source,
												reference: item.reference,
												zh,
											})}
											{item.resolution.method === "catalog-version" &&
												(zh
													? " · 已映射当前版本"
													: " · Mapped catalog version")}
										</small>
									)}
									{item.reason && (
										<small>
											{item.reason === "catalog-missing"
												? zh
													? "资源目录未找到此 ID"
													: "ID absent from resource catalog"
												: zh
													? "尚未恢复"
													: "Not recovered"}
										</small>
									)}
								</li>
							))}
						</ul>
					</section>
				)}
			</div>
		</div>
	);
}
