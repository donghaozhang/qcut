"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runStillFrameExport } from "@/hooks/keyboard/use-clip-editor-actions";
import { useTranslation } from "@/lib/i18n";
import {
	addGuide,
	clearGuides,
	hasGuides,
	resolveGuides,
} from "@/lib/preview/preview-guides";
import { useEditorStore } from "@/stores/editor/editor-store";
import {
	SCOPE_DOCK_ORDER,
	usePreviewViewStore,
} from "@/stores/editor/preview-view-store";
import { useProjectStore } from "@/stores/project-store";
import type { ColorScopeMode } from "@/lib/color/color-scopes";
import type { TranslationKey } from "@/lib/i18n";

const SCOPE_MENU_LABEL_KEYS: Record<ColorScopeMode, TranslationKey> = {
	parade: "editor.preview.scopeParade",
	waveform: "editor.preview.scopeWaveform",
	vectorscope: "editor.preview.scopeVectorscope",
	histogram: "editor.preview.scopeHistogram",
};

/**
 * Unified player view-options menu: guides & rulers management plus the
 * safe-area toggle. Editing aids only — none of these affect exports.
 */
export function PreviewViewOptionsMenu() {
	const { t } = useTranslation();
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const storedGuides = useProjectStore((state) => state.activeProject?.guides);
	const hasActiveProject = useProjectStore(
		(state) => state.activeProject !== null
	);
	const updateProjectGuides = useProjectStore(
		(state) => state.updateProjectGuides
	);
	const showSafeAreas = usePreviewViewStore((state) => state.showSafeAreas);
	const toggleSafeAreas = usePreviewViewStore((state) => state.toggleSafeAreas);
	const showRulers = usePreviewViewStore((state) => state.showRulers);
	const toggleRulers = usePreviewViewStore((state) => state.toggleRulers);
	const scopesEnabled = usePreviewViewStore((state) => state.scopesEnabled);
	const toggleScopes = usePreviewViewStore((state) => state.toggleScopes);
	const visibleScopes = usePreviewViewStore((state) => state.visibleScopes);
	const toggleScope = usePreviewViewStore((state) => state.toggleScope);

	const guides = resolveGuides(storedGuides);
	const anyGuides = hasGuides(guides);

	const addCenteredGuide = (axis: "horizontal" | "vertical") => {
		const position =
			axis === "horizontal" ? canvasSize.height / 2 : canvasSize.width / 2;
		void updateProjectGuides(addGuide({ guides, axis, position }));
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					aria-label={t("editor.preview.viewOptions")}
					data-testid="preview-options-button"
				>
					<SlidersHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuSub>
					<DropdownMenuSubTrigger data-testid="preview-scopes-menu">
						{t("editor.preview.scopes")}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-52">
						<DropdownMenuCheckboxItem
							checked={scopesEnabled}
							data-testid="scope-dock-toggle"
							onCheckedChange={() => toggleScopes()}
						>
							{t("editor.preview.scopes")}
						</DropdownMenuCheckboxItem>
						<DropdownMenuSeparator />
						{SCOPE_DOCK_ORDER.map((mode) => (
							<DropdownMenuCheckboxItem
								key={mode}
								checked={visibleScopes[mode]}
								disabled={!scopesEnabled}
								data-testid={`scope-toggle-${mode}`}
								onCheckedChange={() => toggleScope(mode)}
							>
								{t(SCOPE_MENU_LABEL_KEYS[mode])}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger data-testid="preview-guides-menu">
						{t("editor.preview.guidesRulers")}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-52">
						<DropdownMenuItem
							disabled={!hasActiveProject}
							data-testid="preview-add-horizontal-guide"
							onClick={() => addCenteredGuide("horizontal")}
						>
							{t("editor.preview.addHorizontalGuide")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!hasActiveProject}
							data-testid="preview-add-vertical-guide"
							onClick={() => addCenteredGuide("vertical")}
						>
							{t("editor.preview.addVerticalGuide")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuCheckboxItem
							checked={guides.locked}
							disabled={!anyGuides}
							data-testid="preview-lock-guides"
							onCheckedChange={(locked) => {
								void updateProjectGuides({ ...guides, locked });
							}}
						>
							{t("editor.preview.lockGuides")}
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={guides.hidden}
							disabled={!anyGuides}
							data-testid="preview-hide-guides"
							onCheckedChange={(hidden) => {
								void updateProjectGuides({ ...guides, hidden });
							}}
						>
							{t("editor.preview.hideGuides")}
						</DropdownMenuCheckboxItem>
						<DropdownMenuItem
							disabled={!anyGuides}
							data-testid="preview-clear-guides"
							onClick={() => {
								void updateProjectGuides(clearGuides(guides));
							}}
						>
							{t("editor.preview.clearGuides")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuCheckboxItem
							checked={showRulers}
							data-testid="preview-show-rulers"
							onCheckedChange={() => toggleRulers()}
						>
							{t("editor.preview.showRulers")}
						</DropdownMenuCheckboxItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuCheckboxItem
					checked={showSafeAreas}
					data-testid="preview-toggle-safe-areas"
					onCheckedChange={() => toggleSafeAreas()}
				>
					{t("editor.preview.safeAreas")}
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={!hasActiveProject}
					data-testid="preview-export-still"
					onClick={() => {
						void runStillFrameExport();
					}}
				>
					{t("editor.preview.exportStill")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
