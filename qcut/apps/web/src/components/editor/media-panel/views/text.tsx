import { DraggableMediaItem } from "@/components/ui/draggable-item";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { resolveTextTemplateAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import {
	translate,
	type AppLocale,
	type TranslationKey,
	useTranslation,
} from "@/lib/i18n";
import { getTextTemplateCatalogThumbnailUrl } from "@/lib/text/text-resource-catalog";
import {
	getLocalizedTextTemplateCategoryLabel,
	getLocalizedTextTemplateDefinition,
	getLocalizedTextTemplateDefinitionName,
	getLocalizedTextTemplateGroupLabel,
	getLocalizedTextTemplatePackSlotLabel,
} from "@/lib/text/text-template-i18n";
import {
	downloadTextTemplateResource,
	loadTextTemplateThumbnailBlob,
	resolveTextTemplatePackForTimeline,
	resolveTextTemplateForTimeline,
} from "@/lib/text/text-template-resource";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useSearchStore } from "@/stores/search-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";
import {
	assetManifestVersionKey,
	type AssetManifestEntry,
	type AssetRuntimeState,
} from "@qcut/editor-core";
import {
	ChevronDown,
	Download,
	FileText,
	Gem,
	Heart,
	Layers3,
	Maximize2,
	Palette,
	Search,
	Sparkles,
} from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	getTextDefinitionsForLibraryCategory,
	getTextTemplateDownloadStatus,
	getTextTemplateResourceAccess,
	isTextTemplateDownloaded,
	isTextTemplateFavorite,
	loadTextLibraryState,
	markTextTemplateDownloaded,
	markTextTemplateDownloadFailed,
	markTextTemplateUsed,
	storeTextLibraryState,
	toggleFavoriteTextTemplate,
	type TextTemplateDownloadStatus,
	type TextTemplateResourceAccess,
	type TextLibraryState,
} from "@/lib/text/text-library-state";
import { rankTextTemplateSearchResults } from "@/lib/text/text-library-search";
import {
	compareTextTemplatesByMarketplaceOrder,
	getTextTemplateMarketplaceMetadata,
	isTextTemplateMarketplaceRecommended,
	loadTextTemplateMarketplaceRemoteConfig,
	type TextTemplateMarketplaceMetadataOverrides,
	type TextTemplateMarketplaceSection,
} from "@/lib/text/text-marketplace-metadata";
import {
	generateSmartTextSuggestions,
	getSmartTextCategoryId,
	isSmartTextCategory,
	type SmartTextSuggestion,
} from "@/lib/text/smart-text-generation";
import {
	applyTextTemplatePackCopy,
	buildTextTemplatePack,
	type TextTemplatePack,
	type TextTemplatePackCopySlot,
} from "@/lib/text/text-template-packs";
import {
	DEFAULT_TEXT_TEMPLATE_CATEGORY_ID,
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
	TEXT_TEMPLATE_GROUPS,
	buildTextTemplate,
	type TextTemplateCategoryId,
	type TextTemplateDefinition,
	type TextTemplateGroup,
	type TextTemplateGroupId,
} from "@/lib/text/text-template-registry";
import type {
	MarkdownElement,
	TextElement,
	TextItemDragData,
} from "@/types/timeline";
import { toast } from "sonner";
import { JianyingTextStyleLabDialog } from "./text-style-lab/jianying-text-style-lab";
import {
	buildTextStyleLabElement,
	buildTextStyleLabUpdates,
} from "./text-style-lab/text-style-lab-mapping";
import { TextTemplateThumbnail } from "./text-template-thumbnail";

type TextLibraryStatusFilter =
	| "all"
	| "free"
	| "premium"
	| "downloaded"
	| "favorites";

type TextLibraryStyleFilter =
	| "all"
	| "fire"
	| "glitch"
	| "sticker"
	| "pixel"
	| "guofeng"
	| "glow"
	| "blue"
	| "red";

type TextLibraryMarketFilter =
	| "all"
	| "recommended"
	| "commerce"
	| "cover"
	| "variety"
	| "premium-look"
	| "night";

type TextLibrarySourceFilter = "all" | "designer" | "generated";

type TextLibraryResourceReadinessSummary = {
	cached: number;
	designerImported: number;
	generatedFallback: number;
	remoteUncached: number;
	status: "empty" | "designer-ready" | "needs-cache" | "needs-designer-pack";
	svipLocked: number;
	total: number;
};

type TextLibraryDesignerImportGoalSummary = {
	designerImported: number;
	generatedFallback: number;
	missingDesignerAssets: number;
	requiredDesignerAssets: number;
	status: "designer-ready" | "needs-designer-pack";
};

const TEXT_LIBRARY_STATUS_FILTERS: readonly {
	id: TextLibraryStatusFilter;
	labelKey: TranslationKey;
}[] = [
	{ id: "all", labelKey: "textLibrary.filter.status.all" },
	{ id: "free", labelKey: "textLibrary.filter.status.free" },
	{ id: "premium", labelKey: "textLibrary.filter.status.premium" },
	{ id: "downloaded", labelKey: "textLibrary.filter.status.downloaded" },
	{ id: "favorites", labelKey: "textLibrary.filter.status.favorites" },
];

const TEXT_LIBRARY_STYLE_FILTERS: readonly {
	id: TextLibraryStyleFilter;
	labelKey: TranslationKey;
}[] = [
	{ id: "all", labelKey: "textLibrary.filter.style.all" },
	{ id: "fire", labelKey: "textLibrary.filter.style.fire" },
	{ id: "glitch", labelKey: "textLibrary.filter.style.glitch" },
	{ id: "sticker", labelKey: "textLibrary.filter.style.sticker" },
	{ id: "pixel", labelKey: "textLibrary.filter.style.pixel" },
	{ id: "guofeng", labelKey: "textLibrary.filter.style.guofeng" },
	{ id: "glow", labelKey: "textLibrary.filter.style.glow" },
	{ id: "blue", labelKey: "textLibrary.filter.style.blue" },
	{ id: "red", labelKey: "textLibrary.filter.style.red" },
];

const TEXT_LIBRARY_MARKET_FILTERS: readonly {
	id: TextLibraryMarketFilter;
	labelKey: TranslationKey;
}[] = [
	{ id: "all", labelKey: "textLibrary.filter.market.all" },
	{
		id: "recommended",
		labelKey: "textLibrary.filter.market.recommended",
	},
	{ id: "commerce", labelKey: "textLibrary.filter.market.commerce" },
	{ id: "cover", labelKey: "textLibrary.filter.market.cover" },
	{ id: "variety", labelKey: "textLibrary.filter.market.variety" },
	{
		id: "premium-look",
		labelKey: "textLibrary.filter.market.premiumLook",
	},
	{ id: "night", labelKey: "textLibrary.filter.market.night" },
];

const TEXT_LIBRARY_SOURCE_FILTERS: readonly {
	id: TextLibrarySourceFilter;
	labelKey: TranslationKey;
}[] = [
	{ id: "all", labelKey: "textLibrary.filter.source.all" },
	{ id: "designer", labelKey: "textLibrary.filter.source.designer" },
	{ id: "generated", labelKey: "textLibrary.filter.source.generated" },
];

const TEXT_TEMPLATE_GRID_COLUMNS = {
	compact: 2,
	narrow: 3,
	standard: 4,
	expanded: 5,
} as const;

const TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY = 5;
const TEXT_DESIGNER_READY_CATEGORY_IDS = [
	"popular",
	"latest",
	"summer",
	"variety",
	"guofeng",
	"glow",
	"gradient",
	"texture",
	"red",
	"yellow",
	"black-white",
	"blue",
	"pink",
	"green",
	"purple",
	"headline-template",
	"quote-template",
	"list-template",
	"split-template",
	"timeline-template",
] as const satisfies readonly TextTemplateCategoryId[];

const markdownData: MarkdownElement = {
	id: "default-markdown",
	type: "markdown",
	name: "Default markdown",
	markdownContent: "# Title\n\nStart writing your markdown content...",
	duration: TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	theme: "dark",
	fontSize: 18,
	fontFamily: "Arial",
	padding: 16,
	backgroundColor: "rgba(0, 0, 0, 0.85)",
	textColor: "#ffffff",
	scrollMode: "static",
	scrollSpeed: 30,
	x: 0,
	y: 0,
	width: 720,
	height: 420,
	rotation: 0,
	opacity: 1,
};

function buildTemplateSearchText({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	return [
		definition.id,
		definition.name,
		definition.content,
		definition.category,
		definition.groupId,
		definition.variantId,
		...definition.keywords,
	]
		.join(" ")
		.toLocaleLowerCase();
}

export function buildTextTemplateDragData({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextItemDragData {
	const template = buildTextTemplate({ definition });
	const templatePack = buildTextTemplatePack({ definition });
	return {
		id: template.id,
		type: template.type,
		name: template.name,
		content: template.content,
		textTemplate: template,
		textTemplatePack: templatePack
			? {
					id: templatePack.id,
					name: templatePack.name,
					category: templatePack.category,
					copySlots: templatePack.copySlots,
					elements: templatePack.elements,
				}
			: undefined,
	};
}

export function getTextTemplatePackCopyDefaults({
	copySlots,
}: {
	copySlots: readonly TextTemplatePackCopySlot[];
}): string[] {
	return copySlots.map((slot) => slot.defaultContent);
}

export function getTextTemplateAccessibilityLabel({
	isPack,
	locale = "zh",
	slotLabels = [],
	templateName,
}: {
	isPack: boolean;
	locale?: AppLocale;
	slotLabels?: readonly string[];
	templateName: string;
}): string {
	if (!isPack) {
		return translate({
			locale,
			key: "textLibrary.card.addTemplate",
			values: { name: templateName },
		});
	}
	if (slotLabels.length === 0) {
		return translate({
			locale,
			key: "textLibrary.card.addPack",
			values: { name: templateName },
		});
	}
	return translate({
		locale,
		key: "textLibrary.card.addPackWithSlots",
		values: {
			name: templateName,
			slots: slotLabels.join(locale === "zh" ? "、" : ", "),
		},
	});
}

export function getTextTemplatePackCopyActionLabel({
	locale = "zh",
	slotCount,
}: {
	locale?: AppLocale;
	slotCount: number;
}): string {
	return translate({
		locale,
		key:
			slotCount > 0
				? "textLibrary.card.replaceCopyCount"
				: "textLibrary.card.replaceCopy",
		values: { count: slotCount },
	});
}

export function getTextTemplatePackLayerBadgeLabel({
	elementCount,
	locale = "zh",
}: {
	elementCount: number;
	locale?: AppLocale;
}): string {
	return translate({
		locale,
		key:
			elementCount > 0
				? "textLibrary.card.packLayers"
				: "textLibrary.card.pack",
		values: { count: elementCount },
	});
}

export function getTextTemplatePackCopyBadgeLabel({
	locale = "zh",
	slotCount,
}: {
	locale?: AppLocale;
	slotCount: number;
}): string {
	return translate({
		locale,
		key:
			slotCount > 0
				? "textLibrary.card.replaceableCount"
				: "textLibrary.card.replaceable",
		values: { count: slotCount },
	});
}

export function getTextTemplatePackSlotPreviewLabels({
	copySlots,
	maxVisible = 2,
}: {
	copySlots: readonly TextTemplatePackCopySlot[];
	maxVisible?: number;
}): string[] {
	const visibleCount = Math.max(0, maxVisible);
	const labels = copySlots.map((slot) => slot.label).filter(Boolean);
	const visibleLabels = labels.slice(0, visibleCount);
	const hiddenCount = labels.length - visibleLabels.length;
	return hiddenCount > 0
		? [...visibleLabels, `+${hiddenCount}`]
		: visibleLabels;
}

type TextTemplateAssetProvenanceBadge = {
	label: string;
	source: "designer-imported" | "generated";
};

export function getTextTemplateAssetProvenanceBadge({
	locale = "zh",
	provenance,
}: {
	locale?: AppLocale;
	provenance?: { source?: string };
}): TextTemplateAssetProvenanceBadge | undefined {
	if (provenance?.source === "designer-imported") {
		return {
			label: translate({
				locale,
				key: "textLibrary.card.designerAsset",
			}),
			source: "designer-imported",
		};
	}
	if (provenance?.source === "generated") {
		return {
			label: translate({
				locale,
				key: "textLibrary.card.generatedAsset",
			}),
			source: "generated",
		};
	}
	return undefined;
}

export function getTextTemplateAssetProvenanceSource({
	definition,
}: {
	definition: TextTemplateDefinition;
}): "designer-imported" | "generated" | undefined {
	if (!definition.resource) return "designer-imported";
	const asset = resolveTextTemplateAssetEntry({ definition });
	const metadata = asset.metadata as
		| { provenance?: { source?: string } }
		| undefined;
	if (metadata?.provenance?.source === "designer-imported") {
		return "designer-imported";
	}
	if (metadata?.provenance?.source === "generated") return "generated";
	return undefined;
}

export function applyTextTemplatePackCopyValues({
	copyValues,
	pack,
}: {
	copyValues: readonly string[];
	pack: TextTemplatePack;
}): TextTemplatePack {
	return applyTextTemplatePackCopy({
		contents: copyValues,
		pack,
	}) as TextTemplatePack;
}

export function applyTextTemplatePackCopyPaste({
	currentValues,
	pastedText,
	startIndex,
}: {
	currentValues: readonly string[];
	pastedText: string;
	startIndex: number;
}): { handled: boolean; values: string[] } {
	const pastedLines = pastedText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (
		pastedLines.length < 2 ||
		startIndex < 0 ||
		startIndex >= currentValues.length
	) {
		return { handled: false, values: [...currentValues] };
	}
	const values = [...currentValues];
	for (const [lineIndex, line] of pastedLines.entries()) {
		const valueIndex = startIndex + lineIndex;
		if (valueIndex >= values.length) break;
		values[valueIndex] = line;
	}
	return { handled: true, values };
}

export function applyTextTemplatePackBatchCopyText({
	currentValues,
	text,
}: {
	currentValues: readonly string[];
	text: string;
}): string[] {
	const lines = text.split(/\r?\n/).map((line) => line.trim());
	const values = [...currentValues];
	for (const [lineIndex, line] of lines.entries()) {
		if (lineIndex >= values.length) break;
		values[lineIndex] = line;
	}
	return values;
}

export function getTextTemplateCardThumbnailPreview({
	templatePack,
	thumbnailUrl,
}: {
	templatePack?: TextTemplatePack | null;
	thumbnailUrl?: string;
}): { pack?: TextTemplatePack; thumbnailUrl?: string } {
	if (templatePack) return { pack: templatePack };
	return { thumbnailUrl };
}

function TextTemplate({
	definition,
	downloadStatus,
	isDownloaded,
	isFavorite,
	resourceAccess,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
}: {
	definition: TextTemplateDefinition;
	downloadStatus: TextTemplateDownloadStatus;
	isDownloaded: boolean;
	isFavorite: boolean;
	resourceAccess: TextTemplateResourceAccess;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
}) {
	const { locale, t } = useTranslation();
	const localizedDefinition = useMemo(
		() => getLocalizedTextTemplateDefinition({ definition, locale }),
		[definition, locale]
	);
	const template = useMemo(
		() => buildTextTemplate({ definition: localizedDefinition }),
		[localizedDefinition]
	);
	const provenanceSource = getTextTemplateAssetProvenanceSource({ definition });
	const provenanceBadge = provenanceSource
		? getTextTemplateAssetProvenanceBadge({
				locale,
				provenance: { source: provenanceSource },
			})
		: undefined;
	const dragData = useMemo(
		() => buildTextTemplateDragData({ definition: localizedDefinition }),
		[localizedDefinition]
	);
	const editableTemplatePack = useMemo(
		() => buildTextTemplatePack({ definition: localizedDefinition }),
		[localizedDefinition]
	);
	const [copyDialogOpen, setCopyDialogOpen] = useState(false);
	const [copyValues, setCopyValues] = useState<string[]>(() =>
		getTextTemplatePackCopyDefaults({
			copySlots: editableTemplatePack?.copySlots ?? [],
		})
	);
	const [cachedThumbnailUrl, setCachedThumbnailUrl] = useState<
		string | undefined
	>();
	const isTemplatePack = Boolean(editableTemplatePack);
	const localizedCopySlots = useMemo(
		() =>
			(editableTemplatePack?.copySlots ?? []).map((slot) => ({
				...slot,
				label: getLocalizedTextTemplatePackSlotLabel({ locale, slot }),
			})),
		[editableTemplatePack?.copySlots, locale]
	);
	const templateAccessibilityLabel = getTextTemplateAccessibilityLabel({
		isPack: isTemplatePack,
		locale,
		slotLabels: localizedCopySlots.map((slot) => slot.label),
		templateName: template.name,
	});
	const resolveTemplate = async () => {
		return resolveTextTemplateForTimeline({
			definition: localizedDefinition,
			enabled: isDownloaded,
			fallbackTemplate: template,
		});
	};
	const addToTimeline = async ({
		currentTime,
		customCopyValues,
	}: {
		currentTime?: number;
		customCopyValues?: readonly string[];
	} = {}) => {
		if (resourceAccess === "svip-required") {
			toast.error(t("textLibrary.toast.svipRequired"));
			return;
		}
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		const resolvedTemplate = await resolveTemplate();
		const fallbackTemplatePack = buildTextTemplatePack({
			baseTemplate: resolvedTemplate,
			definition: localizedDefinition,
			currentTime: time,
		});
		const timedTemplatePack = await resolveTextTemplatePackForTimeline({
			currentTime: time,
			definition: localizedDefinition,
			enabled: isDownloaded,
			fallbackPack: fallbackTemplatePack,
			fallbackTemplate: resolvedTemplate,
		});
		const copiedTemplatePack =
			timedTemplatePack && customCopyValues
				? applyTextTemplatePackCopy({
						contents: customCopyValues,
						pack: timedTemplatePack,
					})
				: timedTemplatePack;
		const added = copiedTemplatePack
			? useTimelineStore.getState().addTextGroupAtTime({
					elements: copiedTemplatePack.elements,
					currentTime: time,
				})
			: useTimelineStore.getState().addTextAtTime(resolvedTemplate, time);
		if (added) {
			onUseTemplate({ templateId: definition.id });
		}
	};
	const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
		event.dataTransfer.setData(
			"application/x-media-item",
			JSON.stringify(dragData)
		);
		event.dataTransfer.effectAllowed = "copy";
	};
	const handleActivate = () => {
		void addToTimeline();
	};
	const handleOpenCopyDialog = () => {
		if (!editableTemplatePack) return;
		setCopyValues(
			getTextTemplatePackCopyDefaults({
				copySlots: editableTemplatePack.copySlots,
			})
		);
		setCopyDialogOpen(true);
	};
	const handleCopyValueChange = ({
		index,
		value,
	}: {
		index: number;
		value: string;
	}) => {
		setCopyValues((current) =>
			current.map((copyValue, copyIndex) =>
				copyIndex === index ? value : copyValue
			)
		);
	};
	const handleCopyValuePaste = ({
		index,
		text,
	}: {
		index: number;
		text: string;
	}): boolean => {
		const result = applyTextTemplatePackCopyPaste({
			currentValues: copyValues,
			pastedText: text,
			startIndex: index,
		});
		if (!result.handled) return false;
		setCopyValues(result.values);
		return true;
	};
	const handleBatchCopyTextChange = ({ text }: { text: string }) => {
		setCopyValues((currentValues) =>
			applyTextTemplatePackBatchCopyText({ currentValues, text })
		);
	};
	const handleInsertWithCopy = () => {
		setCopyDialogOpen(false);
		void addToTimeline({ customCopyValues: copyValues });
	};
	const downloadLabel = getTextTemplateDownloadLabel({
		downloadStatus,
		isDownloaded,
		locale,
		resourceAccess,
	});
	const copyActionLabel = getTextTemplatePackCopyActionLabel({
		locale,
		slotCount: editableTemplatePack?.copySlots.length ?? 0,
	});
	const templatePackElementCount = editableTemplatePack?.elements.length ?? 0;
	const templatePackCopySlotCount = editableTemplatePack?.copySlots.length ?? 0;
	const templatePackLayerBadgeLabel = getTextTemplatePackLayerBadgeLabel({
		elementCount: templatePackElementCount,
		locale,
	});
	const templatePackCopyBadgeLabel = getTextTemplatePackCopyBadgeLabel({
		locale,
		slotCount: templatePackCopySlotCount,
	});
	const templatePackSlotPreviewLabels = editableTemplatePack
		? getTextTemplatePackSlotPreviewLabels({
				copySlots: localizedCopySlots,
			})
		: [];
	const templatePackSlotPreviewTitle = editableTemplatePack
		? t("textLibrary.card.replaceableTitle", {
				slots: localizedCopySlots
					.map((slot) => slot.label)
					.join(locale === "zh" ? "、" : ", "),
			})
		: "";
	const copyPreviewPack = useMemo(
		() =>
			editableTemplatePack
				? applyTextTemplatePackCopyValues({
						copyValues,
						pack: editableTemplatePack,
					})
				: null,
		[copyValues, editableTemplatePack]
	);
	const cardThumbnailPreview = getTextTemplateCardThumbnailPreview({
		templatePack: editableTemplatePack,
		thumbnailUrl:
			cachedThumbnailUrl ??
			getTextTemplateCatalogThumbnailUrl({ definition: localizedDefinition }),
	});

	useEffect(() => {
		const thumbnailAsset = resolveTextTemplateAssetEntry({ definition });
		if (
			downloadStatus !== "cached" ||
			thumbnailAsset.delivery !== "remote" ||
			typeof URL === "undefined" ||
			typeof URL.createObjectURL !== "function"
		) {
			setCachedThumbnailUrl(undefined);
			return;
		}
		let cancelled = false;
		let objectUrl: string | undefined;
		loadTextTemplateThumbnailBlob({ definition })
			.then((blob) => {
				if (!blob || cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setCachedThumbnailUrl(objectUrl);
			})
			.catch(() => {
				if (!cancelled) setCachedThumbnailUrl(undefined);
			});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [definition, downloadStatus]);

	return (
		<div className="group relative w-full">
			<div
				role="button"
				tabIndex={0}
				aria-label={templateAccessibilityLabel}
				data-testid={
					template.id === "default-text" ? "text-overlay-button" : undefined
				}
				className="relative cursor-default"
				onClick={handleActivate}
				onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					handleActivate();
				}}
			>
				<div
					draggable
					className="relative aspect-[1.05] overflow-hidden rounded-md bg-zinc-800 shadow-[0_1px_0_rgba(255,255,255,.08),0_10px_22px_rgba(0,0,0,.22)] ring-1 ring-white/5 transition-transform group-hover:scale-[1.02]"
					onDragStart={handleDragStart}
				>
					<TextTemplateThumbnail
						definition={definition}
						pack={cardThumbnailPreview.pack}
						template={template}
						thumbnailUrl={cardThumbnailPreview.thumbnailUrl}
					/>
					{editableTemplatePack && (
						<div
							className="absolute left-1 top-5 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full bg-black/60 px-1 text-cyan-200 shadow-sm ring-1 ring-white/10"
							title={templatePackLayerBadgeLabel}
						>
							<Layers3 aria-hidden="true" className="h-3 w-3">
								<title>{templatePackLayerBadgeLabel}</title>
							</Layers3>
							<span className="text-[0.58rem] font-medium leading-none">
								{templatePackElementCount}
							</span>
						</div>
					)}
					{editableTemplatePack &&
						editableTemplatePack.copySlots.length > 0 && (
							<button
								type="button"
								aria-label={copyActionLabel}
								title={templatePackCopyBadgeLabel}
								className="absolute bottom-1 left-1 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full bg-black/60 px-1 text-white shadow-sm ring-1 ring-white/10 transition-colors hover:bg-black/80"
								onClick={(event) => {
									event.stopPropagation();
									handleOpenCopyDialog();
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
								}}
							>
								<FileText aria-hidden="true" className="h-3.5 w-3.5">
									<title>{copyActionLabel}</title>
								</FileText>
								<span className="text-[0.58rem] font-medium leading-none">
									{templatePackCopySlotCount}
								</span>
							</button>
						)}
					{templatePackSlotPreviewLabels.length > 0 && (
						<div
							aria-label={templatePackSlotPreviewTitle}
							className="absolute bottom-6 left-1 right-1 flex min-w-0 justify-center gap-0.5"
							title={templatePackSlotPreviewTitle}
						>
							{templatePackSlotPreviewLabels.map((label) => (
								<span
									key={label}
									className="min-w-0 truncate rounded-sm bg-black/58 px-1 py-0.5 text-[0.52rem] font-medium leading-none text-white shadow-sm ring-1 ring-white/10"
								>
									{label}
								</span>
							))}
						</div>
					)}
					{definition.premium && (
						<div className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-sm">
							<Gem aria-hidden="true" className="h-2.5 w-2.5">
								<title>{t("textLibrary.card.premiumAsset")}</title>
							</Gem>
						</div>
					)}
					{provenanceBadge && (
						<div
							className={cn(
								"absolute top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full shadow-sm ring-1 ring-white/10",
								definition.premium ? "left-5" : "left-1",
								provenanceBadge.source === "designer-imported"
									? "bg-emerald-300 text-slate-950"
									: "bg-black/55 text-amber-200"
							)}
							title={provenanceBadge.label}
						>
							{provenanceBadge.source === "designer-imported" ? (
								<Palette aria-hidden="true" className="h-2.5 w-2.5">
									<title>{provenanceBadge.label}</title>
								</Palette>
							) : (
								<Sparkles aria-hidden="true" className="h-2.5 w-2.5">
									<title>{provenanceBadge.label}</title>
								</Sparkles>
							)}
						</div>
					)}
					<button
						type="button"
						aria-label={
							isFavorite
								? t("textLibrary.card.unfavorite")
								: t("textLibrary.card.favorite")
						}
						className={cn(
							"absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-colors hover:bg-black/75 group-focus-within:opacity-100 group-hover:opacity-100",
							isFavorite && "bg-rose-500 text-white hover:bg-rose-600"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onToggleFavorite({ templateId: definition.id });
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
						}}
					>
						<Heart
							aria-hidden="true"
							className={cn("h-3.5 w-3.5", isFavorite && "fill-current")}
						>
							<title>
								{isFavorite
									? t("textLibrary.card.unfavorite")
									: t("textLibrary.card.favorite")}
							</title>
						</Heart>
					</button>
					<button
						type="button"
						aria-label={downloadLabel}
						disabled={downloadStatus === "downloading"}
						className={cn(
							"absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/80",
							isDownloaded && "bg-white/85 text-slate-900 hover:bg-white",
							downloadStatus === "downloading" &&
								"cursor-wait bg-cyan-400 text-slate-950 hover:bg-cyan-400",
							downloadStatus === "failed" &&
								"bg-rose-500 text-white hover:bg-rose-600"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onDownload({ definition });
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
						}}
					>
						<Download aria-hidden="true" className="h-3.5 w-3.5">
							<title>{downloadLabel}</title>
						</Download>
					</button>
				</div>
				<span className="sr-only" title={template.name}>
					{template.name}
				</span>
			</div>
			{editableTemplatePack && copyPreviewPack && (
				<TextTemplateCopyDialog
					copySlots={editableTemplatePack.copySlots}
					copyValues={copyValues}
					definition={localizedDefinition}
					previewPack={copyPreviewPack}
					open={copyDialogOpen}
					template={template}
					templateName={template.name}
					onBatchCopyTextChange={handleBatchCopyTextChange}
					onCopyValueChange={handleCopyValueChange}
					onCopyValuePaste={handleCopyValuePaste}
					onInsert={handleInsertWithCopy}
					onOpenChange={setCopyDialogOpen}
				/>
			)}
		</div>
	);
}

function TextTemplateCopyDialog({
	copySlots,
	copyValues,
	definition,
	onBatchCopyTextChange,
	onCopyValueChange,
	onCopyValuePaste,
	onInsert,
	onOpenChange,
	open,
	previewPack,
	template,
	templateName,
}: {
	copySlots: readonly TextTemplatePackCopySlot[];
	copyValues: readonly string[];
	definition: TextTemplateDefinition;
	onBatchCopyTextChange: (props: { text: string }) => void;
	onCopyValueChange: (props: { index: number; value: string }) => void;
	onCopyValuePaste: (props: { index: number; text: string }) => boolean;
	onInsert: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	previewPack: TextTemplatePack;
	template: TextElement;
	templateName: string;
}) {
	const { locale, t } = useTranslation();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm border-border/70 bg-background">
				<DialogHeader>
					<DialogTitle className="text-base">
						{t("textLibrary.copy.title")}
					</DialogTitle>
					<DialogDescription>{templateName}</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="relative aspect-[1.6] overflow-hidden rounded-md bg-zinc-800 ring-1 ring-white/10">
						<TextTemplateThumbnail
							definition={definition}
							pack={previewPack}
							template={template}
						/>
					</div>
					<label className="block space-y-1">
						<span className="text-[0.72rem] text-muted-foreground">
							{t("textLibrary.copy.batch")}
						</span>
						<Textarea
							value={copyValues.join("\n")}
							className="min-h-20 resize-none rounded-md border-border bg-background px-2 py-2 text-xs text-foreground outline-none transition-colors focus:border-cyan-400"
							onChange={(event) =>
								onBatchCopyTextChange({ text: event.target.value })
							}
						/>
					</label>
					<div className="space-y-2">
						{copySlots.map((slot, index) => (
							<label key={slot.id} className="block space-y-1">
								<span className="text-[0.72rem] text-muted-foreground">
									{getLocalizedTextTemplatePackSlotLabel({ locale, slot })}
								</span>
								<input
									type="text"
									value={copyValues[index] ?? slot.defaultContent}
									className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-cyan-400"
									onChange={(event) =>
										onCopyValueChange({
											index,
											value: event.target.value,
										})
									}
									onPaste={(event) => {
										const text = event.clipboardData.getData("text");
										const handled = onCopyValuePaste({ index, text });
										if (!handled) return;
										event.preventDefault();
									}}
								/>
							</label>
						))}
					</div>
				</div>
				<DialogFooter>
					<button
						type="button"
						className="h-8 rounded-md bg-cyan-400 px-3 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-300"
						onClick={onInsert}
						onKeyDown={(event) => {
							if (!isActivationKey({ event })) return;
							event.preventDefault();
							onInsert();
						}}
					>
						{t("textLibrary.copy.insert")}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TemplateGrid({
	columnCountForWidth,
	definitions,
	mode = "panel",
	libraryState,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
	runtimeByAssetKey,
}: {
	columnCountForWidth?: (props: { width: number }) => number;
	definitions: readonly TextTemplateDefinition[];
	mode?: "panel" | "expanded";
	libraryState: TextLibraryState;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}) {
	const gridRef = useRef<HTMLDivElement | null>(null);
	const [gridWidth, setGridWidth] = useState(0);
	const columnCount = columnCountForWidth
		? columnCountForWidth({ width: gridWidth })
		: getTextTemplateGridColumnCount({ width: gridWidth });

	useEffect(() => {
		const element = gridRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const [entry] = entries;
			if (!entry) return;
			setGridWidth(entry.contentRect.width);
		});
		observer.observe(element);
		setGridWidth(element.getBoundingClientRect().width);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={gridRef}
			className={cn("grid py-2", mode === "expanded" ? "gap-3" : "gap-2.5")}
			style={{
				gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
			}}
		>
			{definitions.map((definition) => {
				const downloadStatus = getTextTemplateRuntimeDownloadStatus({
					definition,
					runtimeByAssetKey,
					state: libraryState,
				});
				return (
					<TextTemplate
						key={definition.id}
						definition={definition}
						downloadStatus={downloadStatus}
						isDownloaded={downloadStatus === "cached"}
						isFavorite={isTextTemplateFavorite({
							definition,
							state: libraryState,
						})}
						resourceAccess={getTextTemplateResourceAccess({
							definition,
							state: libraryState,
						})}
						onDownload={onDownload}
						onToggleFavorite={onToggleFavorite}
						onUseTemplate={onUseTemplate}
					/>
				);
			})}
		</div>
	);
}

export function getTextTemplateRuntimeDownloadStatus({
	definition,
	runtimeByAssetKey,
	state,
}: {
	definition: TextTemplateDefinition;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
	state: TextLibraryState;
}): TextTemplateDownloadStatus {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const assetKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	if (asset.delivery !== "remote") {
		return getTextTemplateResourceAccess({ definition, state }) ===
			"svip-required"
			? "failed"
			: "cached";
	}
	const runtime = runtimeByAssetKey[assetKey];
	if (
		runtime?.downloadStatus === "downloading" ||
		runtime?.downloadStatus === "queued" ||
		runtime?.cacheStatus === "caching"
	) {
		return "downloading";
	}
	if (hasCompleteTextTemplateRuntimeCache({ asset, runtime })) {
		return "cached";
	}
	if (
		runtime?.downloadStatus === "failed" ||
		runtime?.cacheStatus === "failed"
	) {
		return "failed";
	}
	return getTextTemplateDownloadStatus({
		definition,
		state,
	}) === "failed"
		? "failed"
		: "remote";
}

function hasCompleteTextTemplateRuntimeCache({
	asset,
	runtime,
}: {
	asset: AssetManifestEntry;
	runtime?: AssetRuntimeState;
}): boolean {
	if (!runtime) return false;
	if (
		runtime.downloadStatus !== "downloaded" ||
		runtime.cacheStatus !== "cached"
	) {
		return false;
	}
	const cachedFiles = runtime.cachedFiles ?? [];
	return asset.files.every((file) =>
		cachedFiles.some(
			(cachedFile) =>
				cachedFile.role === file.role &&
				cachedFile.url === file.url &&
				(file.checksumSha256 === undefined ||
					cachedFile.checksumSha256 === file.checksumSha256)
		)
	);
}

export function getTextTemplateBatchCacheTargets({
	definitions,
	libraryState,
	online,
	runtimeByAssetKey,
}: {
	definitions: readonly TextTemplateDefinition[];
	libraryState: TextLibraryState;
	online: boolean;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}): TextTemplateDefinition[] {
	return definitions.filter((definition) => {
		if (
			getTextTemplateResourceAccess({ definition, state: libraryState }) !==
			"allowed"
		) {
			return false;
		}
		const asset = resolveTextTemplateAssetEntry({ definition });
		if (asset.delivery === "remote" && !online) return false;
		const downloadStatus = getTextTemplateRuntimeDownloadStatus({
			definition,
			runtimeByAssetKey,
			state: libraryState,
		});
		return downloadStatus === "remote";
	});
}

export function getTextLibraryResourceReadinessSummary({
	definitions,
	libraryState,
	runtimeByAssetKey,
}: {
	definitions: readonly TextTemplateDefinition[];
	libraryState: TextLibraryState;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}): TextLibraryResourceReadinessSummary {
	const summary: TextLibraryResourceReadinessSummary = {
		cached: 0,
		designerImported: 0,
		generatedFallback: 0,
		remoteUncached: 0,
		status: "empty",
		svipLocked: 0,
		total: definitions.length,
	};
	for (const definition of definitions) {
		const source = getTextTemplateAssetProvenanceSource({ definition });
		if (source === "designer-imported") {
			summary.designerImported += 1;
		}
		if (source === "generated") {
			summary.generatedFallback += 1;
		}
		const resourceAccess = getTextTemplateResourceAccess({
			definition,
			state: libraryState,
		});
		if (resourceAccess === "svip-required") {
			summary.svipLocked += 1;
		}
		const downloadStatus = getTextTemplateRuntimeDownloadStatus({
			definition,
			runtimeByAssetKey,
			state: libraryState,
		});
		if (downloadStatus === "cached") {
			summary.cached += 1;
		}
		if (downloadStatus === "remote") {
			summary.remoteUncached += 1;
		}
	}
	if (summary.total === 0) return summary;
	if (summary.generatedFallback > 0) {
		return {
			...summary,
			status: "needs-designer-pack",
		};
	}
	if (summary.remoteUncached > 0) {
		return {
			...summary,
			status: "needs-cache",
		};
	}
	return {
		...summary,
		status: "designer-ready",
	};
}

export function getTextLibraryResourceReadinessLabel({
	locale = "zh",
	summary,
}: {
	locale?: AppLocale;
	summary: TextLibraryResourceReadinessSummary;
}): string {
	if (summary.status === "empty") {
		return translate({ locale, key: "textLibrary.readiness.empty" });
	}
	if (summary.status === "designer-ready") {
		return translate({ locale, key: "textLibrary.readiness.designerReady" });
	}
	if (summary.status === "needs-cache") {
		return translate({ locale, key: "textLibrary.readiness.needsCache" });
	}
	return translate({ locale, key: "textLibrary.readiness.needsDesignerPack" });
}

export function getTextLibraryDesignerImportGoalSummary({
	definitions,
	minDesignerAssetsPerCategory = TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	requiredCategories = TEXT_DESIGNER_READY_CATEGORY_IDS,
}: {
	definitions: readonly TextTemplateDefinition[];
	minDesignerAssetsPerCategory?: number;
	requiredCategories?: readonly TextTemplateCategoryId[];
}): TextLibraryDesignerImportGoalSummary {
	const designerCountsByCategory = new Map<TextTemplateCategoryId, number>();
	let generatedFallback = 0;
	for (const definition of definitions) {
		const source = getTextTemplateAssetProvenanceSource({ definition });
		if (source === "generated") {
			generatedFallback += 1;
			continue;
		}
		if (source !== "designer-imported") continue;
		const currentCount = designerCountsByCategory.get(definition.category) ?? 0;
		designerCountsByCategory.set(definition.category, currentCount + 1);
	}
	let designerImported = 0;
	let missingDesignerAssets = 0;
	for (const category of requiredCategories) {
		const current = designerCountsByCategory.get(category) ?? 0;
		designerImported += Math.min(current, minDesignerAssetsPerCategory);
		missingDesignerAssets += Math.max(
			0,
			minDesignerAssetsPerCategory - current
		);
	}
	const requiredDesignerAssets =
		requiredCategories.length * minDesignerAssetsPerCategory;
	return {
		designerImported,
		generatedFallback,
		missingDesignerAssets,
		requiredDesignerAssets,
		status:
			missingDesignerAssets === 0 ? "designer-ready" : "needs-designer-pack",
	};
}

export function getTextLibraryDesignerImportGoalLabel({
	locale = "zh",
	summary,
}: {
	locale?: AppLocale;
	summary: TextLibraryDesignerImportGoalSummary;
}): string {
	if (summary.status === "designer-ready") {
		return translate({ locale, key: "textLibrary.goal.ready" });
	}
	return translate({
		locale,
		key: "textLibrary.goal.missing",
		values: { count: summary.missingDesignerAssets },
	});
}

function TextLibraryResourceReadinessBar({
	designerGoalSummary,
	summary,
}: {
	designerGoalSummary: TextLibraryDesignerImportGoalSummary;
	summary: TextLibraryResourceReadinessSummary;
}) {
	const { locale, t } = useTranslation();
	const label = getTextLibraryResourceReadinessLabel({ locale, summary });
	const designerGoalLabel = getTextLibraryDesignerImportGoalLabel({
		locale,
		summary: designerGoalSummary,
	});
	return (
		<div
			aria-label={t("textLibrary.readinessAria", {
				status: label,
				goal: designerGoalLabel,
			})}
			className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 text-[0.68rem] text-muted-foreground"
		>
			<span
				className={cn(
					"shrink-0 rounded-md px-2 py-1",
					summary.status === "designer-ready"
						? "bg-emerald-500/15 text-emerald-300"
						: "bg-amber-500/15 text-amber-200"
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"shrink-0 rounded-md px-2 py-1",
					designerGoalSummary.status === "designer-ready"
						? "bg-emerald-500/15 text-emerald-300"
						: "bg-amber-500/15 text-amber-200"
				)}
			>
				{t("textLibrary.metrics.designerGoal", {
					current: designerGoalSummary.designerImported,
					required: designerGoalSummary.requiredDesignerAssets,
				})}
			</span>
			<span className="shrink-0 rounded-md bg-muted px-2 py-1">
				{t("textLibrary.metrics.currentDesigner", {
					current: summary.designerImported,
					total: summary.total,
				})}
			</span>
			<span className="shrink-0 rounded-md bg-muted px-2 py-1">
				{t("textLibrary.metrics.currentFallback", {
					count: summary.generatedFallback,
				})}
			</span>
			<span className="shrink-0 rounded-md bg-muted px-2 py-1">
				{t("textLibrary.metrics.pendingCache", {
					count: summary.remoteUncached,
				})}
			</span>
			{designerGoalSummary.generatedFallback > 0 && (
				<span className="shrink-0 rounded-md bg-muted px-2 py-1">
					{t("textLibrary.metrics.catalogFallback", {
						count: designerGoalSummary.generatedFallback,
					})}
				</span>
			)}
			{summary.svipLocked > 0 && (
				<span className="shrink-0 rounded-md bg-muted px-2 py-1">
					{t("textLibrary.metrics.svipLocked", {
						count: summary.svipLocked,
					})}
				</span>
			)}
		</div>
	);
}

async function mapTextTemplateCacheTargets<TItem, TResult>({
	concurrency,
	items,
	mapper,
}: {
	concurrency: number;
	items: readonly TItem[];
	mapper: (props: { item: TItem }) => Promise<TResult>;
}): Promise<TResult[]> {
	if (items.length === 0) return [];
	const results: TResult[] = [];
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, concurrency), items.length);
	const runNext = (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const item = items[index];
		if (item === undefined) return Promise.resolve();
		return mapper({ item }).then((result) => {
			results[index] = result;
			return runNext();
		});
	};
	await Promise.all(Array.from({ length: workerCount }, runNext));
	return results;
}

export function getTextTemplateGridColumnCount({
	width,
}: {
	width: number;
}): number {
	if (width >= 460) return TEXT_TEMPLATE_GRID_COLUMNS.expanded;
	if (width >= 320) return TEXT_TEMPLATE_GRID_COLUMNS.standard;
	if (width >= 240) return TEXT_TEMPLATE_GRID_COLUMNS.narrow;
	return TEXT_TEMPLATE_GRID_COLUMNS.compact;
}

export function getExpandedTextTemplateGridColumnCount({
	width,
}: {
	width: number;
}): number {
	if (width >= 560) return TEXT_TEMPLATE_GRID_COLUMNS.expanded;
	if (width >= 400) return TEXT_TEMPLATE_GRID_COLUMNS.standard;
	if (width >= 280) return TEXT_TEMPLATE_GRID_COLUMNS.narrow;
	return TEXT_TEMPLATE_GRID_COLUMNS.compact;
}

function getTextTemplateDownloadLabel({
	downloadStatus,
	isDownloaded,
	locale,
	resourceAccess,
}: {
	downloadStatus: TextTemplateDownloadStatus;
	isDownloaded: boolean;
	locale: AppLocale;
	resourceAccess: TextTemplateResourceAccess;
}): string {
	if (isDownloaded) {
		return translate({ locale, key: "textLibrary.download.downloaded" });
	}
	if (downloadStatus === "failed" && resourceAccess === "svip-required") {
		return translate({ locale, key: "textLibrary.download.svipRequired" });
	}
	if (downloadStatus === "downloading") {
		return translate({ locale, key: "textLibrary.download.downloading" });
	}
	if (downloadStatus === "failed") {
		return translate({ locale, key: "textLibrary.download.retry" });
	}
	return translate({ locale, key: "textLibrary.download.download" });
}

function MarkdownTemplate({
	onAdd,
}: {
	onAdd: (currentTime?: number) => void;
}) {
	return (
		<div className="w-full">
			<DraggableMediaItem
				data-testid="markdown-overlay-button"
				name="Markdown"
				preview={
					<div className="flex h-full w-full items-center justify-center rounded-sm bg-muted p-2">
						<div className="flex flex-col items-center gap-1 text-muted-foreground">
							<FileText aria-hidden="true" className="h-5 w-5" />
							<span className="select-none text-center text-xs">Markdown</span>
						</div>
					</div>
				}
				dragData={{
					id: markdownData.id,
					type: markdownData.type,
					name: markdownData.name,
					markdownContent: markdownData.markdownContent,
				}}
				aspectRatio={1.4}
				onAddToTimeline={onAdd}
				onActivate={() => onAdd()}
				showLabel
				stopPropagation={false}
			/>
		</div>
	);
}

function isActivationKey({
	event,
}: {
	event: KeyboardEvent<HTMLButtonElement>;
}): boolean {
	return event.key === "Enter" || event.key === " ";
}

export function getTextLibraryNavWidthClass({
	locale,
}: {
	locale: AppLocale;
}): string {
	return locale === "en" ? "w-40" : "w-[5.5rem]";
}

/** Default pixel width of the resizable category nav, mirroring the width classes above. */
export function getTextLibraryNavDefaultWidth({
	locale,
}: {
	locale: AppLocale;
}): number {
	return locale === "en" ? 160 : 88;
}

function TextLibraryNav({
	activeCategoryId,
	className,
	expandedGroupIds,
	onSelectCategory,
	onSelectGroup,
}: {
	activeCategoryId: TextTemplateCategoryId;
	className?: string;
	expandedGroupIds: ReadonlySet<TextTemplateGroupId>;
	onSelectCategory: (props: { categoryId: TextTemplateCategoryId }) => void;
	onSelectGroup: (props: { group: TextTemplateGroup }) => void;
}) {
	const { locale, t } = useTranslation();
	return (
		<nav
			aria-label={t("textLibrary.navLabel")}
			className={cn(
				getTextLibraryNavWidthClass({ locale }),
				"shrink-0 space-y-0.5 overflow-y-auto pr-2",
				className
			)}
		>
			{TEXT_TEMPLATE_GROUPS.map((group) => {
				const isExpanded = expandedGroupIds.has(group.id);
				const hasActiveCategory = group.categories.some(
					(category) => category.id === activeCategoryId
				);

				return (
					<div key={group.id} className="space-y-1">
						<button
							type="button"
							aria-expanded={isExpanded}
							className={cn(
								"flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-left text-[0.72rem] font-medium text-muted-foreground transition-colors",
								hasActiveCategory && "bg-accent text-cyan-300 shadow-inner",
								!hasActiveCategory && "hover:bg-accent/70 hover:text-foreground"
							)}
							onClick={() => onSelectGroup({ group })}
							onKeyDown={(event) => {
								if (!isActivationKey({ event })) return;
								event.preventDefault();
								onSelectGroup({ group });
							}}
						>
							{/* Jianying keeps the expand indicator on the left. */}
							<ChevronDown
								aria-hidden="true"
								className={cn(
									"h-3 w-3 shrink-0 transition-transform",
									isExpanded ? "rotate-0" : "-rotate-90"
								)}
							>
								<title>
									{getLocalizedTextTemplateGroupLabel({ group, locale })}
								</title>
							</ChevronDown>
							<span
								className="truncate"
								title={getLocalizedTextTemplateGroupLabel({ group, locale })}
							>
								{getLocalizedTextTemplateGroupLabel({ group, locale })}
							</span>
						</button>
						{isExpanded && (
							<div className="space-y-0.5 pl-2">
								{group.categories.map((category) => {
									const isActive = category.id === activeCategoryId;

									return (
										<button
											key={category.id}
											type="button"
											title={getLocalizedTextTemplateCategoryLabel({
												category,
												locale,
											})}
											className={cn(
												"h-6 w-full truncate rounded-md px-2 text-left text-[0.7rem] transition-colors",
												isActive
													? "bg-accent text-cyan-300 shadow-inner"
													: "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
											)}
											onClick={() =>
												onSelectCategory({ categoryId: category.id })
											}
											onKeyDown={(event) => {
												if (!isActivationKey({ event })) return;
												event.preventDefault();
												onSelectCategory({ categoryId: category.id });
											}}
										>
											{getLocalizedTextTemplateCategoryLabel({
												category,
												locale,
											})}
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</nav>
	);
}

function TextLibrarySearchField({
	onSearchQueryChange,
	searchQuery,
}: {
	onSearchQueryChange: (props: { query: string }) => void;
	searchQuery: string;
}) {
	const { t } = useTranslation();
	return (
		<label className="relative block">
			<Search
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute left-3 top-1/2 h-4 w-4 text-muted-foreground"
			>
				<title>{t("textLibrary.search")}</title>
			</Search>
			<input
				type="search"
				value={searchQuery}
				placeholder={t("textLibrary.searchPlaceholder")}
				className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan-400"
				onChange={(event) => onSearchQueryChange({ query: event.target.value })}
			/>
		</label>
	);
}

function matchesStatusFilter({
	definition,
	filter,
	runtimeDownloadStatus,
	state,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibraryStatusFilter;
	runtimeDownloadStatus?: TextTemplateDownloadStatus;
	state: TextLibraryState;
}): boolean {
	if (filter === "free") return !definition.premium;
	if (filter === "premium") return definition.premium;
	if (filter === "downloaded") {
		if (runtimeDownloadStatus) return runtimeDownloadStatus === "cached";
		return isTextTemplateDownloaded({ definition, state });
	}
	if (filter === "favorites") {
		return isTextTemplateFavorite({ definition, state });
	}
	return true;
}

function matchesStyleFilter({
	definition,
	filter,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibraryStyleFilter;
}): boolean {
	if (filter === "all") return true;
	const searchable = buildTemplateSearchText({ definition });
	return (
		definition.variantId === filter ||
		definition.category === filter ||
		searchable.includes(filter)
	);
}

export function matchesMarketplaceFilter({
	definition,
	filter,
	marketplaceOverrides,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibraryMarketFilter;
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
}): boolean {
	if (filter === "all") return true;
	if (filter === "recommended") {
		return isTextTemplateMarketplaceRecommended({
			definition,
			overrides: marketplaceOverrides,
		});
	}
	const metadata = getTextTemplateMarketplaceMetadata({
		definition,
		overrides: marketplaceOverrides,
	});
	const tags = new Set(metadata.remoteTags);
	const aliases = new Set(metadata.searchAliases);
	if (filter === "commerce") {
		return (
			tags.has("scene:commerce") ||
			aliases.has("带货") ||
			aliases.has("价格") ||
			aliases.has("促销")
		);
	}
	if (filter === "cover") {
		return tags.has("market:hero") || aliases.has("封面");
	}
	if (filter === "variety") {
		return tags.has("scene:variety") || tags.has("effect:pop");
	}
	if (filter === "premium-look") {
		return (
			tags.has("market:premium-look") ||
			tags.has("tone:premium") ||
			tags.has("material:chrome") ||
			tags.has("material:gold")
		);
	}
	return tags.has("scene:night") || tags.has("effect:glow");
}

export function matchesSourceFilter({
	definition,
	filter,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibrarySourceFilter;
}): boolean {
	if (filter === "all") return true;
	const source = getTextTemplateAssetProvenanceSource({ definition });
	if (filter === "designer") return source === "designer-imported";
	return source === "generated";
}

function FilterBar<TFilter extends string>({
	filters,
	activeFilter,
	onSelectFilter,
}: {
	filters: readonly { id: TFilter; labelKey: TranslationKey }[];
	activeFilter: TFilter;
	onSelectFilter: (filter: TFilter) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex gap-1 overflow-x-auto pb-1">
			{filters.map((filter) => (
				<button
					key={filter.id}
					type="button"
					className={cn(
						"h-6 shrink-0 rounded-md px-2 text-[0.68rem] transition-colors",
						filter.id === activeFilter
							? "bg-cyan-400 text-slate-950"
							: "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
					)}
					onClick={() => onSelectFilter(filter.id)}
					onKeyDown={(event) => {
						if (!isActivationKey({ event })) return;
						event.preventDefault();
						onSelectFilter(filter.id);
					}}
				>
					{t(filter.labelKey)}
				</button>
			))}
		</div>
	);
}

function ExpandedTextLibraryDialog({
	activeHeading,
	activeCategoryId,
	designerGoalSummary,
	definitions,
	emptyMessage,
	expandedGroupIds,
	libraryState,
	onCacheVisibleTemplates,
	onDownload,
	onOpenChange,
	onSearchQueryChange,
	onSelectMarketFilter,
	onSelectCategory,
	onSelectGroup,
	onSelectSourceFilter,
	onSelectStatusFilter,
	onSelectStyleFilter,
	onToggleFavorite,
	onUseTemplate,
	open,
	runtimeByAssetKey,
	searchQuery,
	smartTextStatus,
	marketFilter,
	resourceReadinessSummary,
	sourceFilter,
	statusFilter,
	styleFilter,
}: {
	activeHeading: string;
	activeCategoryId: TextTemplateCategoryId;
	designerGoalSummary: TextLibraryDesignerImportGoalSummary;
	definitions: readonly TextTemplateDefinition[];
	emptyMessage: string;
	expandedGroupIds: ReadonlySet<TextTemplateGroupId>;
	libraryState: TextLibraryState;
	onCacheVisibleTemplates: () => void;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onOpenChange: (open: boolean) => void;
	onSearchQueryChange: (props: { query: string }) => void;
	onSelectMarketFilter: (filter: TextLibraryMarketFilter) => void;
	onSelectCategory: (props: { categoryId: TextTemplateCategoryId }) => void;
	onSelectGroup: (props: { group: TextTemplateGroup }) => void;
	onSelectSourceFilter: (filter: TextLibrarySourceFilter) => void;
	onSelectStatusFilter: (filter: TextLibraryStatusFilter) => void;
	onSelectStyleFilter: (filter: TextLibraryStyleFilter) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
	open: boolean;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
	searchQuery: string;
	smartTextStatus: string;
	marketFilter: TextLibraryMarketFilter;
	resourceReadinessSummary: TextLibraryResourceReadinessSummary;
	sourceFilter: TextLibrarySourceFilter;
	statusFilter: TextLibraryStatusFilter;
	styleFilter: TextLibraryStyleFilter;
}) {
	const { t } = useTranslation();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[min(1080px,calc(100vw-2rem))] border-border/70 bg-background p-0">
				<DialogHeader className="px-4 pt-4">
					<div className="flex items-center justify-between gap-4 pr-8">
						<DialogTitle className="text-base">{activeHeading}</DialogTitle>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">
								{smartTextStatus}
							</span>
							<button
								type="button"
								aria-label={t("textLibrary.cacheCurrent")}
								className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								onClick={onCacheVisibleTemplates}
								onKeyDown={(event) => {
									if (!isActivationKey({ event })) return;
									event.preventDefault();
									onCacheVisibleTemplates();
								}}
							>
								<Download aria-hidden="true" className="h-3.5 w-3.5">
									<title>{t("textLibrary.cacheCurrent")}</title>
								</Download>
							</button>
						</div>
					</div>
					<DialogDescription className="sr-only">
						{t("textLibrary.expand")}
					</DialogDescription>
				</DialogHeader>
				<div className="flex max-h-[76vh] min-h-[520px] min-w-0 gap-3 px-4 pb-4">
					<TextLibraryNav
						activeCategoryId={activeCategoryId}
						className="w-[7rem] border-r border-border/70 pr-3"
						expandedGroupIds={expandedGroupIds}
						onSelectCategory={onSelectCategory}
						onSelectGroup={onSelectGroup}
					/>
					<div className="min-w-0 flex-1 overflow-y-auto">
						<div className="sticky top-0 z-10 space-y-2 bg-background/95 pb-2">
							<TextLibrarySearchField
								searchQuery={searchQuery}
								onSearchQueryChange={onSearchQueryChange}
							/>
							<FilterBar
								activeFilter={statusFilter}
								filters={TEXT_LIBRARY_STATUS_FILTERS}
								onSelectFilter={onSelectStatusFilter}
							/>
							<FilterBar
								activeFilter={styleFilter}
								filters={TEXT_LIBRARY_STYLE_FILTERS}
								onSelectFilter={onSelectStyleFilter}
							/>
							<FilterBar
								activeFilter={marketFilter}
								filters={TEXT_LIBRARY_MARKET_FILTERS}
								onSelectFilter={onSelectMarketFilter}
							/>
							<FilterBar
								activeFilter={sourceFilter}
								filters={TEXT_LIBRARY_SOURCE_FILTERS}
								onSelectFilter={onSelectSourceFilter}
							/>
							<TextLibraryResourceReadinessBar
								designerGoalSummary={designerGoalSummary}
								summary={resourceReadinessSummary}
							/>
						</div>
						{definitions.length > 0 ? (
							<TemplateGrid
								columnCountForWidth={getExpandedTextTemplateGridColumnCount}
								definitions={definitions}
								mode="expanded"
								libraryState={libraryState}
								onDownload={onDownload}
								onToggleFavorite={onToggleFavorite}
								onUseTemplate={onUseTemplate}
								runtimeByAssetKey={runtimeByAssetKey}
							/>
						) : (
							<div className="py-16 text-center text-xs text-muted-foreground">
								{emptyMessage}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function getTextLibraryEmptyMessage({
	categoryId,
	hasDesignerSourceAssets,
	hasActiveFilters,
	locale = "zh",
	sourceFilter,
}: {
	categoryId: TextTemplateCategoryId;
	hasDesignerSourceAssets: boolean;
	hasActiveFilters: boolean;
	locale?: AppLocale;
	sourceFilter: TextLibrarySourceFilter;
}): string {
	if (sourceFilter === "designer" && !hasDesignerSourceAssets) {
		return translate({ locale, key: "textLibrary.empty.designer" });
	}
	if (hasActiveFilters) {
		return translate({ locale, key: "textLibrary.empty.filtered" });
	}
	if (categoryId === "favorites") {
		return translate({ locale, key: "textLibrary.empty.favorites" });
	}
	if (categoryId === "recent") {
		return translate({ locale, key: "textLibrary.empty.recent" });
	}
	if (categoryId === "brand-kit") {
		return translate({ locale, key: "textLibrary.empty.brand" });
	}
	if (categoryId === "drafts") {
		return translate({ locale, key: "textLibrary.empty.drafts" });
	}
	return translate({ locale, key: "textLibrary.empty.filtered" });
}

function applySmartTextSuggestions({
	categoryId,
	definitions,
	suggestions,
}: {
	categoryId: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	suggestions: readonly SmartTextSuggestion[];
}): TextTemplateDefinition[] {
	if (!isSmartTextCategory({ categoryId }) || suggestions.length === 0) {
		return [...definitions];
	}
	return definitions.map((definition, index) => {
		const suggestion = suggestions[index % suggestions.length];
		return {
			...definition,
			content: suggestion.content,
			keywords: [
				...definition.keywords,
				suggestion.source,
				suggestion.sourceText,
				"project text",
				"项目文本",
			],
		};
	});
}

export function sortTextDefinitionsForBrowsing({
	categoryId,
	definitions,
	marketplaceOverrides,
}: {
	categoryId: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
}): TextTemplateDefinition[] {
	if (
		categoryId === "favorites" ||
		categoryId === "recent" ||
		categoryId === "recommended" ||
		categoryId === "trending"
	) {
		return [...definitions];
	}
	return [...definitions].sort((left, right) =>
		compareTextTemplatesByMarketplaceOrder({
			left,
			overrides: marketplaceOverrides,
			right,
		})
	);
}

export function TextView() {
	const { locale, t } = useTranslation();
	const tracks = useTimelineStore((state) => state.tracks);
	const transcriptions = useSearchStore((state) => state.transcriptions);
	const runtimeByAssetKey = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey
	);
	const updateRuntimeState = useAssetLibraryStore(
		(state) => state.updateRuntimeState
	);
	const online = useOnlineStatus();
	const [activeCategoryId, setActiveCategoryId] =
		useState<TextTemplateCategoryId>(DEFAULT_TEXT_TEMPLATE_CATEGORY_ID);
	// 花字库 starts collapsed like Jianying; groups expand on demand.
	const [expandedGroupIds, setExpandedGroupIds] = useState<
		ReadonlySet<TextTemplateGroupId>
	>(() => new Set(["new-text"]));
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] =
		useState<TextLibraryStatusFilter>("all");
	const [styleFilter, setStyleFilter] = useState<TextLibraryStyleFilter>("all");
	const [marketFilter, setMarketFilter] =
		useState<TextLibraryMarketFilter>("all");
	const [sourceFilter, setSourceFilter] =
		useState<TextLibrarySourceFilter>("all");
	const [expandedLibraryOpen, setExpandedLibraryOpen] = useState(false);
	const [libraryState, setLibraryState] = useState<TextLibraryState>(() =>
		loadTextLibraryState()
	);
	const [marketplaceOverrides, setMarketplaceOverrides] =
		useState<TextTemplateMarketplaceMetadataOverrides>({});
	const [marketplaceSections, setMarketplaceSections] = useState<
		readonly TextTemplateMarketplaceSection[]
	>([]);
	const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
	useEffect(() => {
		storeTextLibraryState({ state: libraryState });
	}, [libraryState]);
	useEffect(() => {
		let cancelled = false;
		loadTextTemplateMarketplaceRemoteConfig().then((result) => {
			if (cancelled || result.source === "empty") return;
			setMarketplaceOverrides(result.overrides);
			setMarketplaceSections(result.sections);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	const activeCategory = useMemo(
		() =>
			TEXT_TEMPLATE_CATEGORIES.find(
				(category) => category.id === activeCategoryId
			) ?? TEXT_TEMPLATE_CATEGORIES[0],
		[activeCategoryId]
	);
	const activeDefinitions = useMemo(
		() =>
			getTextDefinitionsForLibraryCategory({
				category: activeCategory.id,
				definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
				marketplaceOverrides,
				marketplaceSections,
				state: libraryState,
			}),
		[activeCategory.id, libraryState, marketplaceOverrides, marketplaceSections]
	);
	const smartTextCategoryId = getSmartTextCategoryId({
		categoryId: activeCategory.id,
	});
	const smartTextSuggestions = useMemo(() => {
		if (!smartTextCategoryId) return [];
		return generateSmartTextSuggestions({
			categoryId: smartTextCategoryId,
			tracks,
			transcriptions,
			maxSuggestions: activeDefinitions.length,
		});
	}, [activeDefinitions.length, smartTextCategoryId, tracks, transcriptions]);
	const projectAwareDefinitions = useMemo(
		() =>
			applySmartTextSuggestions({
				categoryId: activeCategory.id,
				definitions: activeDefinitions,
				suggestions: smartTextSuggestions,
			}),
		[activeCategory.id, activeDefinitions, smartTextSuggestions]
	);
	const visibleDefinitions = useMemo(() => {
		const searchBase = normalizedSearchQuery
			? rankTextTemplateSearchResults({
					definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
					marketplaceOverrides,
					query: normalizedSearchQuery,
					state: libraryState,
				})
			: sortTextDefinitionsForBrowsing({
					categoryId: activeCategory.id,
					definitions: projectAwareDefinitions,
					marketplaceOverrides,
				});
		return searchBase.filter((definition) => {
			const runtimeDownloadStatus = getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey,
				state: libraryState,
			});
			if (
				activeCategory.id === "downloaded" &&
				runtimeDownloadStatus !== "cached"
			) {
				return false;
			}
			return (
				matchesStatusFilter({
					definition,
					filter: statusFilter,
					runtimeDownloadStatus,
					state: libraryState,
				}) &&
				matchesStyleFilter({ definition, filter: styleFilter }) &&
				matchesMarketplaceFilter({
					definition,
					filter: marketFilter,
					marketplaceOverrides,
				}) &&
				matchesSourceFilter({ definition, filter: sourceFilter })
			);
		});
	}, [
		activeCategory.id,
		libraryState,
		marketFilter,
		marketplaceOverrides,
		normalizedSearchQuery,
		projectAwareDefinitions,
		runtimeByAssetKey,
		sourceFilter,
		statusFilter,
		styleFilter,
	]);
	const resourceReadinessSummary = useMemo(
		() =>
			getTextLibraryResourceReadinessSummary({
				definitions: visibleDefinitions,
				libraryState,
				runtimeByAssetKey,
			}),
		[visibleDefinitions, libraryState, runtimeByAssetKey]
	);
	const designerGoalSummary = useMemo(
		() =>
			getTextLibraryDesignerImportGoalSummary({
				definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
			}),
		[]
	);
	const activeHeading = normalizedSearchQuery
		? t("textLibrary.searchResults", { count: visibleDefinitions.length })
		: getLocalizedTextTemplateCategoryLabel({
				category: activeCategory,
				locale,
			});
	const hasActiveFilters =
		Boolean(normalizedSearchQuery) ||
		marketFilter !== "all" ||
		sourceFilter !== "all" ||
		statusFilter !== "all" ||
		styleFilter !== "all";
	const hasDesignerSourceAssets = useMemo(
		() =>
			TEXT_TEMPLATE_LIBRARY_DEFINITIONS.some((definition) =>
				matchesSourceFilter({ definition, filter: "designer" })
			),
		[]
	);
	const emptyMessage = getTextLibraryEmptyMessage({
		categoryId: activeCategory.id,
		hasDesignerSourceAssets,
		hasActiveFilters,
		locale,
		sourceFilter,
	});
	const smartTextStatus =
		isSmartTextCategory({ categoryId: activeCategory.id }) &&
		!normalizedSearchQuery
			? smartTextSuggestions.length > 0
				? t("textLibrary.suggestionsGenerated", {
						count: smartTextSuggestions.length,
					})
				: t("textLibrary.generateAfterCaptions")
			: t("textLibrary.styleCount", { count: visibleDefinitions.length });
	const addMarkdown = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addMarkdownAtTime(markdownData, time);
	};
	const applyTextStyleLabStyle = ({
		animations,
		style,
	}: {
		animations?: import("@/types/electron").JianyingTextAnimationReferences;
		style: JianyingTextStyleLabStyleSummary;
	}) => {
		const updates = buildTextStyleLabUpdates({ animations, style });
		if (!updates) {
			toast.error("该花字依赖 QCut 尚未支持的纹理或运行时效果");
			return;
		}
		const timeline = useTimelineStore.getState();
		const selectedTextElements = timeline.selectedElements.flatMap(
			({ trackId, elementId }) => {
				const element = timeline.tracks
					.find((track) => track.id === trackId)
					?.elements.find((candidate) => candidate.id === elementId);
				return element?.type === "text" ? [{ trackId, element }] : [];
			}
		);
		if (selectedTextElements.length > 0) {
			for (const [index, selection] of selectedTextElements.entries()) {
				timeline.updateTextElement(
					selection.trackId,
					selection.element.id,
					updates,
					index === 0
				);
			}
			toast.success(`已应用 ${style.title ?? "本机花字"}`);
			return;
		}
		const element = buildTextStyleLabElement({ animations, style });
		if (!element) return;
		const added = timeline.addTextAtTime(
			element,
			usePlaybackStore.getState().currentTime
		);
		if (added) toast.success(`已添加 ${style.title ?? "本机花字"}`);
	};
	const handleSelectCategory = ({
		categoryId,
	}: {
		categoryId: TextTemplateCategoryId;
	}) => {
		setActiveCategoryId(categoryId);
	};
	const handleSelectGroup = ({ group }: { group: TextTemplateGroup }) => {
		// Clicking a group header toggles it: collapsing keeps the active
		// category, expanding also jumps to the group's first category.
		if (expandedGroupIds.has(group.id)) {
			setExpandedGroupIds((current) => {
				const next = new Set(current);
				next.delete(group.id);
				return next;
			});
			return;
		}
		const firstCategory = group.categories[0];
		if (firstCategory) setActiveCategoryId(firstCategory.id);
		setExpandedGroupIds((current) => {
			const next = new Set(current);
			next.add(group.id);
			return next;
		});
	};
	const handleDownload = async ({
		definition,
	}: {
		definition: TextTemplateDefinition;
	}) => {
		const access = getTextTemplateResourceAccess({
			definition,
			state: libraryState,
		});
		const asset = resolveTextTemplateAssetEntry({ definition });
		if (access !== "allowed") {
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "SVIP_REQUIRED",
					state: current,
				})
			);
			toast.error(t("textLibrary.toast.svipRequired"));
			return;
		}
		if (asset.delivery !== "remote") {
			const resource = await downloadTextTemplateResource({ definition });
			updateRuntimeState({
				asset,
				patch: {
					cacheHitCount: resource.cacheHitCount,
					cachedBytes: resource.cachedBytes,
					cachedFileCount: resource.cachedFileCount,
					cachedFiles: resource.files,
					cacheKey: resource.cacheKey,
					cacheStatus: "cached",
					downloadStatus: "downloaded",
					error: "",
					progress: 1,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloaded({ definition, state: current })
			);
			toast.success(
				t("textLibrary.toast.ready", {
					name: getLocalizedTextTemplateDefinitionName({ definition, locale }),
				})
			);
			return;
		}
		if (!online) {
			updateRuntimeState({
				asset,
				patch: {
					cacheStatus: "failed",
					downloadStatus: "failed",
					error: "OFFLINE",
					progress: 0,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "OFFLINE",
					state: current,
				})
			);
			toast.error(t("textLibrary.toast.offline"));
			return;
		}
		const runtime = useAssetLibraryStore.getState().getRuntimeState({ asset });
		if (
			runtime.downloadStatus === "downloading" ||
			runtime.cacheStatus === "caching"
		) {
			return;
		}
		updateRuntimeState({
			asset,
			patch: {
				cacheStatus: "caching",
				downloadStatus: "downloading",
				error: "",
				progress: 0,
			},
		});
		try {
			const resource = await downloadTextTemplateResource({
				definition,
				onProgress: ({ progress }) =>
					updateRuntimeState({
						asset,
						patch: {
							cacheStatus: "caching",
							downloadStatus: "downloading",
							progress,
						},
					}),
			});
			updateRuntimeState({
				asset,
				patch: {
					cacheHitCount: resource.cacheHitCount,
					cachedBytes: resource.cachedBytes,
					cachedFileCount: resource.cachedFileCount,
					cachedFiles: resource.files,
					cacheKey: resource.cacheKey,
					cacheStatus: "cached",
					downloadStatus: "downloaded",
					error: "",
					progress: 1,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloaded({ definition, state: current })
			);
			toast.success(
				t("textLibrary.toast.downloaded", {
					name: getLocalizedTextTemplateDefinitionName({ definition, locale }),
				})
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			updateRuntimeState({
				asset,
				patch: {
					cacheStatus: "failed",
					downloadStatus: "failed",
					error: message,
					progress: 0,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "DOWNLOAD_FAILED",
					state: current,
				})
			);
			toast.error(t("textLibrary.toast.downloadFailed", { message }));
		}
	};
	const handleToggleFavorite = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			toggleFavoriteTextTemplate({ state: current, templateId })
		);
	};
	const handleSearchQueryChange = ({ query }: { query: string }) => {
		setSearchQuery(query);
	};
	const handleUseTemplate = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			markTextTemplateUsed({ state: current, templateId })
		);
	};
	const handleCacheVisibleTemplates = async () => {
		const targets = getTextTemplateBatchCacheTargets({
			definitions: visibleDefinitions,
			libraryState,
			online,
			runtimeByAssetKey,
		});
		if (targets.length === 0) {
			toast.info(t("textLibrary.toast.nothingToCache"));
			return;
		}
		const results = await mapTextTemplateCacheTargets({
			concurrency: 4,
			items: targets,
			mapper: async ({ item: definition }) => {
				const asset = resolveTextTemplateAssetEntry({ definition });
				updateRuntimeState({
					asset,
					patch: {
						cacheStatus: "caching",
						downloadStatus: "downloading",
						error: "",
						progress: 0,
					},
				});
				try {
					const resource = await downloadTextTemplateResource({
						definition,
						onProgress: ({ progress }) =>
							updateRuntimeState({
								asset,
								patch: {
									cacheStatus: "caching",
									downloadStatus: "downloading",
									progress,
								},
							}),
					});
					updateRuntimeState({
						asset,
						patch: {
							cacheHitCount: resource.cacheHitCount,
							cachedBytes: resource.cachedBytes,
							cachedFileCount: resource.cachedFileCount,
							cachedFiles: resource.files,
							cacheKey: resource.cacheKey,
							cacheStatus: "cached",
							downloadStatus: "downloaded",
							error: "",
							progress: 1,
						},
					});
					setLibraryState((current) =>
						markTextTemplateDownloaded({ definition, state: current })
					);
					return { ok: true };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					updateRuntimeState({
						asset,
						patch: {
							cacheStatus: "failed",
							downloadStatus: "failed",
							error: message,
							progress: 0,
						},
					});
					setLibraryState((current) =>
						markTextTemplateDownloadFailed({
							definition,
							errorCode: "DOWNLOAD_FAILED",
							state: current,
						})
					);
					return { ok: false };
				}
			},
		});
		const cachedCount = results.filter((result) => result.ok).length;
		const failedCount = results.length - cachedCount;
		if (failedCount > 0) {
			toast.error(
				t("textLibrary.toast.cachePartial", {
					cached: cachedCount,
					failed: failedCount,
				})
			);
			return;
		}
		toast.success(t("textLibrary.toast.cacheComplete", { count: cachedCount }));
	};

	return (
		<div className="h-full min-h-0 p-2" data-testid="text-panel">
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel
					className="min-w-0"
					defaultSize={getTextLibraryNavDefaultWidth({ locale })}
					maxSize={280}
					minSize={64}
				>
					<TextLibraryNav
						activeCategoryId={activeCategoryId}
						className="h-full w-full"
						expandedGroupIds={expandedGroupIds}
						onSelectCategory={handleSelectCategory}
						onSelectGroup={handleSelectGroup}
					/>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel className="min-w-0" minSize="50%">
					<section className="h-full min-w-0 overflow-y-auto pl-2">
						<div className="sticky top-0 z-10 space-y-2 bg-background/95 pb-2">
							<TextLibrarySearchField
								searchQuery={searchQuery}
								onSearchQueryChange={handleSearchQueryChange}
							/>
							<div className="flex h-6 items-center justify-between gap-2">
								<h2 className="truncate text-sm font-medium text-foreground">
									{activeHeading}
								</h2>
								<div className="flex shrink-0 items-center gap-1.5">
									{activeCategory.groupId === "fancy" ? (
										<JianyingTextStyleLabDialog
											onApply={applyTextStyleLabStyle}
										/>
									) : null}
									<span className="text-[0.68rem] text-muted-foreground">
										{smartTextStatus}
									</span>
									<button
										type="button"
										aria-label={t("textLibrary.cacheCurrent")}
										className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										onClick={() => void handleCacheVisibleTemplates()}
										onKeyDown={(event) => {
											if (!isActivationKey({ event })) return;
											event.preventDefault();
											void handleCacheVisibleTemplates();
										}}
									>
										<Download aria-hidden="true" className="h-3.5 w-3.5">
											<title>{t("textLibrary.cacheCurrent")}</title>
										</Download>
									</button>
									<button
										type="button"
										aria-label={t("textLibrary.expand")}
										className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										onClick={() => setExpandedLibraryOpen(true)}
										onKeyDown={(event) => {
											if (!isActivationKey({ event })) return;
											event.preventDefault();
											setExpandedLibraryOpen(true);
										}}
									>
										<Maximize2 aria-hidden="true" className="h-3.5 w-3.5">
											<title>{t("textLibrary.expand")}</title>
										</Maximize2>
									</button>
								</div>
							</div>
							<FilterBar
								activeFilter={statusFilter}
								filters={TEXT_LIBRARY_STATUS_FILTERS}
								onSelectFilter={setStatusFilter}
							/>
							<FilterBar
								activeFilter={styleFilter}
								filters={TEXT_LIBRARY_STYLE_FILTERS}
								onSelectFilter={setStyleFilter}
							/>
							<FilterBar
								activeFilter={marketFilter}
								filters={TEXT_LIBRARY_MARKET_FILTERS}
								onSelectFilter={setMarketFilter}
							/>
							<FilterBar
								activeFilter={sourceFilter}
								filters={TEXT_LIBRARY_SOURCE_FILTERS}
								onSelectFilter={setSourceFilter}
							/>
							<TextLibraryResourceReadinessBar
								designerGoalSummary={designerGoalSummary}
								summary={resourceReadinessSummary}
							/>
						</div>
						{visibleDefinitions.length > 0 ? (
							<TemplateGrid
								definitions={visibleDefinitions}
								libraryState={libraryState}
								onDownload={handleDownload}
								onToggleFavorite={handleToggleFavorite}
								onUseTemplate={handleUseTemplate}
								runtimeByAssetKey={runtimeByAssetKey}
							/>
						) : (
							<div className="py-12 text-center text-xs text-muted-foreground">
								{emptyMessage}
							</div>
						)}
						{!normalizedSearchQuery &&
							activeCategory.id === DEFAULT_TEXT_TEMPLATE_CATEGORY_ID && (
								<MarkdownTemplate onAdd={addMarkdown} />
							)}
					</section>
				</ResizablePanel>
			</ResizablePanelGroup>
			<ExpandedTextLibraryDialog
				activeHeading={activeHeading}
				activeCategoryId={activeCategoryId}
				designerGoalSummary={designerGoalSummary}
				definitions={visibleDefinitions}
				emptyMessage={emptyMessage}
				expandedGroupIds={expandedGroupIds}
				libraryState={libraryState}
				onCacheVisibleTemplates={() => void handleCacheVisibleTemplates()}
				onDownload={handleDownload}
				onOpenChange={setExpandedLibraryOpen}
				onSearchQueryChange={handleSearchQueryChange}
				onSelectMarketFilter={setMarketFilter}
				onSelectSourceFilter={setSourceFilter}
				onSelectCategory={handleSelectCategory}
				onSelectGroup={handleSelectGroup}
				onSelectStatusFilter={setStatusFilter}
				onSelectStyleFilter={setStyleFilter}
				onToggleFavorite={handleToggleFavorite}
				onUseTemplate={handleUseTemplate}
				open={expandedLibraryOpen}
				runtimeByAssetKey={runtimeByAssetKey}
				searchQuery={searchQuery}
				smartTextStatus={smartTextStatus}
				marketFilter={marketFilter}
				resourceReadinessSummary={resourceReadinessSummary}
				sourceFilter={sourceFilter}
				statusFilter={statusFilter}
				styleFilter={styleFilter}
			/>
		</div>
	);
}
