import { useEffect, useMemo, useState } from "react";
import { Ban, Type, Plus } from "lucide-react";
import {
	applyCoverTemplate,
	COVER_TEMPLATES,
	type CoverDesignV1,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import {
	paintCoverDesign,
	encodeCoverCanvas,
} from "@/lib/cover/cover-renderer";
import { coverRepository } from "@/lib/cover/cover-repository";
import { useTranslation } from "@/lib/i18n";
import { activateCoverControl } from "./cover-tool";

function CoverTemplateCard({
	template,
	background,
	projectId,
	selected,
	disabled,
	onApply,
}: {
	template: (typeof COVER_TEMPLATES)[number];
	background: CoverDesignV1 | null;
	projectId: string;
	selected: boolean;
	disabled: boolean;
	onApply: () => void;
}) {
	const { locale } = useTranslation();
	const [preview, setPreview] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		let url: string | null = null;
		setPreview(null);
		if (!background || template.id === "none") return;
		void paintCoverDesign({
			design: applyCoverTemplate({
				design: background,
				templateId: template.id,
			}),
			maxWidth: 240,
			resolveAsset: ({ asset }) =>
				coverRepository.readAsset({ projectId, asset }),
		})
			.then((canvas) => encodeCoverCanvas({ canvas, mimeType: "image/webp" }))
			.then((blob) => {
				if (!cancelled) {
					url = URL.createObjectURL(blob);
					setPreview(url);
				}
			})
			.catch(() => {
				/* The main preview reports source errors. */
			});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	}, [background, projectId, template.id]);
	const label = locale === "zh" ? template.zh : template.label;
	return (
		<button
			type="button"
			className={`cover-template ${selected ? "is-selected" : ""}`}
			disabled={disabled}
			aria-pressed={selected}
			aria-label={label}
			onClick={onApply}
			onKeyDown={(event) => activateCoverControl({ event })}
			data-testid={`cover-template-${template.id}`}
		>
			<div className="cover-template-image">
				{preview ? (
					<img src={preview} alt="" />
				) : template.id === "none" ? (
					<Ban size={22} />
				) : (
					<Type size={28} />
				)}
			</div>
			<span>{label}</span>
		</button>
	);
}

export function CoverTemplateBrowser({
	design,
	projectId,
	onEdit,
	disabled,
	selectedId,
	onSelect,
	onAdd,
	onError,
}: {
	design: CoverDesignV1 | null;
	projectId: string;
	onEdit: (design: CoverDesignV1) => void;
	disabled: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onAdd: () => void;
	onError: (message: string) => void;
}) {
	const { t } = useTranslation();
	const [mode, setMode] = useState("templates");
	const [category, setCategory] = useState("all");
	const imageLayer = design?.layers[0];
	const canvas = design?.canvas;
	const source = design?.source;
	// Text edits do not regenerate every catalog preview.
	const background = useMemo<CoverDesignV1 | null>(
		() =>
			imageLayer && canvas && source
				? {
						schema: "qcut.cover-design",
						schemaVersion: 1,
						id: "preview",
						revision: 1,
						canvas,
						source,
						layers: [imageLayer],
						createdAt: "2026-09-06T00:00:00Z",
						updatedAt: "2026-09-06T00:00:00Z",
					}
				: null,
		[imageLayer, canvas, source]
	);
	const texts =
		design?.layers
			.slice(1)
			.filter((layer): layer is CoverTextLayerV1 => layer.kind === "text") ??
		[];
	return (
		<aside className="cover-library">
			<div
				className="cover-tabs"
				role="tablist"
				aria-label={t("editor.cover.library")}
			>
				{["templates", "text"].map((tab) => (
					<button
						type="button"
						key={tab}
						role="tab"
						aria-selected={mode === tab}
						onClick={() => setMode(tab)}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						{tab === "templates"
							? t("editor.cover.templates")
							: t("editor.cover.text")}
					</button>
				))}
			</div>
			{mode === "templates" ? (
				<div className="cover-template-body">
					<nav
						className="cover-categories"
						aria-label={t("editor.cover.categories")}
					>
						{(["all", "life", "style", "knowledge", "games"] as const).map(
							(id) => (
								<button
									type="button"
									key={id}
									aria-pressed={category === id}
									onClick={() => setCategory(id)}
									onKeyDown={(event) => activateCoverControl({ event })}
								>
									{t(`editor.cover.category.${id}`)}
								</button>
							)
						)}
					</nav>
					<div className="cover-template-grid">
						{COVER_TEMPLATES.filter(
							(template) =>
								category === "all" ||
								template.category === category ||
								template.id === "none"
						).map((template) => (
							<CoverTemplateCard
								key={template.id}
								template={template}
								background={background}
								projectId={projectId}
								selected={(design?.templateId ?? "none") === template.id}
								disabled={disabled || !design}
								onApply={() => {
									if (!design) return;
									try {
										const next = applyCoverTemplate({
											design,
											templateId: template.id,
										});
										onEdit(next);
										const first = next.layers.find(
											(layer) =>
												layer.kind === "text" &&
												layer.templateId === template.id
										);
										if (first) onSelect(first.id);
									} catch (reason) {
										onError(String(reason));
									}
								}}
							/>
						))}
					</div>
				</div>
			) : (
				<div className="cover-text-list">
					<button
						type="button"
						className="cover-command"
						disabled={disabled || !design || texts.length >= 20}
						onClick={onAdd}
						onKeyDown={(event) => activateCoverControl({ event })}
						data-testid="cover-add-text"
					>
						<Plus size={16} />
						{t("editor.cover.newText")}
					</button>
					{[...texts].reverse().map((layer) => (
						<button
							key={layer.id}
							type="button"
							className="cover-layer-row"
							aria-pressed={selectedId === layer.id}
							disabled={disabled}
							onClick={() => onSelect(layer.id)}
							onKeyDown={(event) => activateCoverControl({ event })}
						>
							<Type size={14} />
							<span>{layer.content || t("editor.cover.newText")}</span>
						</button>
					))}
				</div>
			)}
		</aside>
	);
}
