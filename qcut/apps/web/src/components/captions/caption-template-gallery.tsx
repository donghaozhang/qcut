import { useMemo, useState } from "react";
import { Gem, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { captionStyleFromTextTemplate } from "@/lib/captions/caption-style-presets";
import { useTranslation } from "@/lib/i18n";
import { getTextTemplateResourceFiles } from "@/lib/text/text-resource-catalog";
import {
	getTextTemplateCategoriesByGroup,
	getTextTemplateDefinitionsByCategory,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
	type TextTemplateCategoryId,
	type TextTemplateDefinition,
} from "@/lib/text/text-template-registry";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

const GALLERY_GROUP_ID = "fancy" as const;
const MAX_GALLERY_RESULTS = 60;

function searchDefinitions({
	query,
}: {
	query: string;
}): TextTemplateDefinition[] {
	const needle = query.trim().toLowerCase();
	return TEXT_TEMPLATE_LIBRARY_DEFINITIONS.filter(
		(definition) =>
			definition.groupId === GALLERY_GROUP_ID &&
			(definition.name.toLowerCase().includes(needle) ||
				definition.keywords.some((keyword) =>
					keyword.toLowerCase().includes(needle)
				))
	);
}

function TemplateTile({
	definition,
	onApply,
}: {
	definition: TextTemplateDefinition;
	onApply: (definition: TextTemplateDefinition) => void;
}) {
	const [thumbnailFailed, setThumbnailFailed] = useState(false);
	const { thumbnailUrl } = getTextTemplateResourceFiles({ definition });

	return (
		<button
			type="button"
			className="group relative flex aspect-[4/3] flex-col overflow-hidden rounded-md border bg-muted/40 transition-colors hover:border-primary"
			onClick={() => onApply(definition)}
			title={definition.name}
		>
			{thumbnailUrl && !thumbnailFailed ? (
				<img
					alt={definition.name}
					className="h-full w-full object-cover"
					decoding="async"
					draggable={false}
					loading="lazy"
					src={thumbnailUrl}
					onError={() => setThumbnailFailed(true)}
				/>
			) : (
				<span className="flex h-full w-full items-center justify-center px-1 text-center text-xs text-foreground/80">
					{definition.content || definition.name}
				</span>
			)}
			{definition.premium ? (
				<Gem className="absolute left-1 top-1 size-3 text-cyan-300" />
			) : null}
			<span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
				{definition.name}
			</span>
		</button>
	);
}

/**
 * JianYing-style 字幕模板 gallery: searchable, categorized qctext templates
 * applied as caption styles across the whole project.
 */
export function CaptionTemplateGallery() {
	const { t } = useTranslation();
	const applyCaptionStyle = useTimelineStore(
		(store) => store.applyCaptionStyle
	);
	const categories = useMemo(
		() =>
			getTextTemplateCategoriesByGroup({ groupId: GALLERY_GROUP_ID }).filter(
				(category) => !category.virtual
			),
		[]
	);
	const [categoryId, setCategoryId] = useState<TextTemplateCategoryId>(
		() => categories[0]?.id ?? "recommended"
	);
	const [query, setQuery] = useState("");

	const definitions = useMemo(() => {
		const matches = query.trim()
			? searchDefinitions({ query })
			: getTextTemplateDefinitionsByCategory({ category: categoryId });
		return matches
			.filter((definition) => definition.groupId === GALLERY_GROUP_ID)
			.slice(0, MAX_GALLERY_RESULTS);
	}, [categoryId, query]);

	const applyTemplate = (definition: TextTemplateDefinition) => {
		const style = captionStyleFromTextTemplate({
			stylePresetId: definition.stylePresetId,
			overrides: definition.overrides,
		});
		if (!style) {
			toast.error(t("captions.templates.unavailable"));
			return;
		}
		const updatedCount = applyCaptionStyle({
			trackId: "",
			elementId: "",
			style,
			scope: "project",
		});
		if (updatedCount === 0) {
			toast.warning(t("captions.templates.noCaptions"));
			return;
		}
		toast.success(t("captions.templates.applied", { count: updatedCount }));
	};

	return (
		<div className="space-y-3" data-testid="caption-template-gallery">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium">{t("captions.templates.title")}</p>
			</div>

			<div className="relative">
				<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("captions.templates.searchPlaceholder")}
					className="h-8 pl-7 text-xs"
				/>
			</div>

			{query.trim() ? null : (
				<div className="flex flex-wrap gap-1">
					{categories.map((category) => (
						<Button
							key={category.id}
							type="button"
							size="sm"
							variant={category.id === categoryId ? "default" : "outline"}
							className="h-6 rounded-full px-2 text-[11px]"
							onClick={() => setCategoryId(category.id)}
						>
							{category.label}
						</Button>
					))}
				</div>
			)}

			<div
				className={cn(
					"grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1",
					definitions.length === 0 && "hidden"
				)}
			>
				{definitions.map((definition) => (
					<TemplateTile
						key={definition.id}
						definition={definition}
						onApply={applyTemplate}
					/>
				))}
			</div>
			{definitions.length === 0 ? (
				<p className="text-center text-xs text-muted-foreground">
					{t("captions.templates.empty")}
				</p>
			) : null}
		</div>
	);
}
