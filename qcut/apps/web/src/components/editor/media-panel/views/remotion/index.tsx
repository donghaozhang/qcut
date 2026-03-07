/**
 * Remotion Components View
 *
 * Panel for browsing and adding Remotion components to the timeline.
 * Displays component library organized by category with search and preview.
 *
 * @module components/editor/media-panel/views/remotion
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Layers, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	useRemotionStore,
	selectAllComponents,
} from "@/stores/ai/remotion-store";
import { useShallow } from "zustand/react/shallow";
import type {
	RemotionComponentDefinition,
	RemotionComponentCategory,
} from "@/lib/remotion/types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { ComponentCard } from "./component-card";
import { ComponentPreviewModal } from "./component-preview-modal";
import { ComponentImportDialog } from "./component-import-dialog";
import { FolderImportDialog } from "./folder-import-dialog";

// ============================================================================
// Re-exports
// ============================================================================

export { ComponentCard } from "./component-card";
export { ComponentPreviewModal } from "./component-preview-modal";
export { ComponentImportDialog } from "./component-import-dialog";
export { FolderImportDialog } from "./folder-import-dialog";

// ============================================================================
// Category Configuration
// ============================================================================

const CATEGORY_CONFIG: Record<
	RemotionComponentCategory,
	{ label: string; description: string }
> = {
	animation: {
		label: "Animations",
		description: "Animated graphics and motion effects",
	},
	scene: {
		label: "Scenes",
		description: "Full-screen compositions and backgrounds",
	},
	effect: { label: "Effects", description: "Visual effects and overlays" },
	template: { label: "Templates", description: "Pre-built video templates" },
	transition: { label: "Transitions", description: "Scene transition effects" },
	text: { label: "Text", description: "Animated text and typography" },
	intro: { label: "Intros", description: "Video intros and outros" },
	social: {
		label: "Social",
		description: "Social media formats (portrait/square)",
	},
	custom: { label: "Custom", description: "Custom imported components" },
};

const CATEGORY_ORDER: RemotionComponentCategory[] = [
	"custom",
	"template",
	"text",
	"transition",
	"animation",
	"scene",
	"effect",
	"intro",
	"social",
];

// Tab configuration - which categories to show in the tab bar
const TAB_CATEGORIES: (RemotionComponentCategory | "all")[] = [
	"all",
	"custom",
	"template",
	"animation",
];

// ============================================================================
// Category Section
// ============================================================================

interface CategorySectionProps {
	category: RemotionComponentCategory;
	components: RemotionComponentDefinition[];
	onAdd: (component: RemotionComponentDefinition) => void;
	onPreview?: (component: RemotionComponentDefinition) => void;
}

function CategorySection({
	category,
	components,
	onAdd,
	onPreview,
}: CategorySectionProps) {
	const config = CATEGORY_CONFIG[category];

	if (components.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3" data-testid={`category-section-${category}`}>
			<div className="flex items-center gap-2">
				<h3 className="text-sm font-semibold">{config.label}</h3>
				<Badge variant="secondary" className="text-[10px]">
					{components.length}
				</Badge>
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{components.map((component) => (
					<ComponentCard
						key={component.id}
						component={component}
						onAdd={onAdd}
						onPreview={onPreview}
					/>
				))}
			</div>
		</div>
	);
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ searchQuery }: { searchQuery?: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 text-center px-4">
			{searchQuery ? (
				<>
					<Search className="mb-4 h-12 w-12 text-muted-foreground" />
					<p className="text-lg font-medium">No components found</p>
					<p className="text-muted-foreground">
						No Remotion components match "{searchQuery}"
					</p>
				</>
			) : (
				<>
					<Layers className="mb-4 h-12 w-12 text-muted-foreground" />
					<p className="text-lg font-medium">No Remotion components</p>
					<p className="text-muted-foreground text-sm max-w-sm">
						Remotion components will appear here once registered. Components can
						be added from the built-in library or imported from your Remotion
						projects.
					</p>
				</>
			)}
		</div>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function RemotionView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState<
		"all" | RemotionComponentCategory
	>("all");
	const [previewComponent, setPreviewComponent] =
		useState<RemotionComponentDefinition | null>(null);
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);
	const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
	const [isFolderImportDialogOpen, setIsFolderImportDialogOpen] =
		useState(false);

	// Get store state - use individual selectors for stable references
	const isLoading = useRemotionStore((state) => state.isLoading);
	const isInitialized = useRemotionStore((state) => state.isInitialized);
	// Get components with shallow comparison to avoid infinite re-renders
	const allComponents = useRemotionStore(useShallow(selectAllComponents));
	// Get initialize via getState() to avoid unstable reference in useEffect deps
	const initialize = useRemotionStore.getState().initialize;
	const { addTrack, addElementToTrack, tracks } = useTimelineStore();
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);

	// Filter components by search query
	const filteredComponents = useMemo(() => {
		if (!searchQuery.trim()) {
			return allComponents;
		}

		const query = searchQuery.toLowerCase();
		return allComponents.filter(
			(comp) =>
				comp.name.toLowerCase().includes(query) ||
				comp.description?.toLowerCase().includes(query) ||
				comp.tags?.some((tag) => tag.toLowerCase().includes(query))
		);
	}, [allComponents, searchQuery]);

	// Group components by category
	const componentsByCategory = useMemo(() => {
		const grouped: Record<
			RemotionComponentCategory,
			RemotionComponentDefinition[]
		> = {
			animation: [],
			scene: [],
			effect: [],
			template: [],
			transition: [],
			text: [],
			intro: [],
			social: [],
			custom: [],
		};

		for (const comp of filteredComponents) {
			grouped[comp.category].push(comp);
		}

		return grouped;
	}, [filteredComponents]);

	// Handle adding a component to the timeline
	const handleAddComponent = useCallback(
		(component: RemotionComponentDefinition) => {
			// Find or create a Remotion track
			const remotionTrack = tracks.find((t) => t.type === "remotion");
			let trackId: string;

			if (remotionTrack) {
				trackId = remotionTrack.id;
			} else {
				// Create a new Remotion track - addTrack takes TrackType and returns trackId
				trackId = addTrack("remotion");
			}

			// Calculate duration in seconds
			const durationSeconds = component.durationInFrames / component.fps;

			// Add the element to the track
			addElementToTrack(trackId, {
				type: "remotion",
				name: component.name,
				duration: durationSeconds,
				startTime: 0, // Will be auto-positioned
				trimStart: 0,
				trimEnd: 0,
				componentId: component.id,
				props: { ...component.defaultProps },
				renderMode: "live",
			});

			toast.success(`Added "${component.name}" to timeline`);
		},
		[tracks, addTrack, addElementToTrack]
	);

	// Handle preview
	const handlePreview = useCallback(
		(component: RemotionComponentDefinition) => {
			setPreviewComponent(component);
			setIsPreviewOpen(true);
		},
		[]
	);

	// Handle import success
	const handleImportSuccess = useCallback((componentId: string) => {
		toast.info("Component imported and ready to use");
	}, []);

	// Handle folder import success
	const handleFolderImportSuccess = useCallback((componentIds: string[]) => {
		toast.info(
			`${componentIds.length} component${componentIds.length !== 1 ? "s" : ""} imported and ready to use`
		);
	}, []);

	// Initialize store if needed - must be in useEffect, not during render
	// Note: initialize is obtained via getState() so it's not in deps (stable reference)
	// biome-ignore lint/correctness/useExhaustiveDependencies: initialize is stable from getState() - adding it causes infinite loop
	useEffect(() => {
		console.log(
			"[RemotionView] useEffect triggered - isInitialized:",
			isInitialized,
			"isLoading:",
			isLoading
		);
		if (!isInitialized && !isLoading) {
			console.log(
				"[RemotionView] Calling initialize() - should only happen ONCE"
			);
			initialize();
		}
	}, [isInitialized, isLoading]); // No initialize in deps - prevents infinite loop

	// Loading state
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col" data-testid="remotion-panel">
			{/* Search Bar & Import Button */}
			<div className="border-b p-3">
				<div className="flex gap-2">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
						<Input
							placeholder="Search components..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10 pr-10 h-9"
							data-testid="remotion-search-input"
						/>
						{searchQuery && (
							<button
								type="button"
								className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 transform p-0 hover:bg-accent rounded flex items-center justify-center"
								onClick={() => setSearchQuery("")}
								aria-label="Clear search"
							>
								<X className="h-4 w-4" />
							</button>
						)}
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-9 w-9 shrink-0"
								onClick={() => setIsFolderImportDialogOpen(true)}
								data-testid="import-folder-button"
							>
								<FolderOpen className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Import Remotion folder</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-9 w-9 shrink-0"
								onClick={() => setIsImportDialogOpen(true)}
								data-testid="import-component-button"
							>
								<Plus className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Import custom component</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 overflow-hidden">
				{filteredComponents.length === 0 ? (
					<EmptyState searchQuery={searchQuery} />
				) : (
					<Tabs
						value={activeCategory}
						onValueChange={(v) =>
							setActiveCategory(v as "all" | RemotionComponentCategory)
						}
						className="h-full flex flex-col"
					>
						<TabsList
							className="mx-3 mt-2 grid shrink-0"
							style={{
								gridTemplateColumns: `repeat(${TAB_CATEGORIES.length}, 1fr)`,
							}}
						>
							{TAB_CATEGORIES.map((tab) => (
								<TabsTrigger key={tab} value={tab} className="text-xs">
									{tab === "all" ? "All" : CATEGORY_CONFIG[tab].label}
								</TabsTrigger>
							))}
						</TabsList>

						<TabsContent
							value="all"
							className="flex-1 mt-0 min-h-0 overflow-hidden"
						>
							<ScrollArea className="h-full">
								<div className="p-3 space-y-6">
									{CATEGORY_ORDER.map((category) => (
										<CategorySection
											key={category}
											category={category}
											components={componentsByCategory[category]}
											onAdd={handleAddComponent}
											onPreview={handlePreview}
										/>
									))}
								</div>
							</ScrollArea>
						</TabsContent>

						{CATEGORY_ORDER.map((category) => (
							<TabsContent
								key={category}
								value={category}
								className="flex-1 mt-0 min-h-0 overflow-hidden"
							>
								<ScrollArea className="h-full">
									<div className="p-3">
										{componentsByCategory[category].length > 0 ? (
											<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
												{componentsByCategory[category].map((component) => (
													<ComponentCard
														key={component.id}
														component={component}
														onAdd={handleAddComponent}
														onPreview={handlePreview}
													/>
												))}
											</div>
										) : (
											<div className="flex flex-col items-center justify-center py-12 text-center">
												<Layers className="mb-4 h-8 w-8 text-muted-foreground" />
												<p className="text-sm text-muted-foreground">
													No {CATEGORY_CONFIG[category].label.toLowerCase()}{" "}
													available
												</p>
											</div>
										)}
									</div>
								</ScrollArea>
							</TabsContent>
						))}
					</Tabs>
				)}
			</div>

			{/* Footer */}
			<div className="border-t p-2 text-center text-xs text-muted-foreground">
				{allComponents.length} components •{" "}
				<a
					href="https://remotion.dev"
					target="_blank"
					rel="noopener noreferrer"
					className="text-violet-400 hover:underline"
				>
					Remotion
				</a>
			</div>

			{/* Preview Modal */}
			<ComponentPreviewModal
				component={previewComponent}
				open={isPreviewOpen}
				onOpenChange={setIsPreviewOpen}
				onAdd={handleAddComponent}
			/>

			{/* Import Dialog */}
			<ComponentImportDialog
				open={isImportDialogOpen}
				onOpenChange={setIsImportDialogOpen}
				onImportSuccess={handleImportSuccess}
			/>

			{/* Folder Import Dialog */}
			<FolderImportDialog
				open={isFolderImportDialogOpen}
				onOpenChange={setIsFolderImportDialogOpen}
				onImportSuccess={handleFolderImportSuccess}
			/>
		</div>
	);
}

export default RemotionView;
