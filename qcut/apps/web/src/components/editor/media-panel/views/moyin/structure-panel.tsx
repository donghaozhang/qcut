/**
 * StructurePanel — Right panel showing parsed script structure:
 * episode tree, characters, scenes, and generation controls.
 */

import { useState, useCallback, useEffect } from "react";
import { useMoyinStore } from "@/stores/moyin/moyin-store";
import type { MoyinStep } from "@/stores/moyin/moyin-store";
import { EpisodeTree } from "./episode-tree";
import { CharacterList } from "./character-list";
import { SceneList } from "./scene-list";
import { ShotBreakdown } from "./shot-breakdown";
import { GenerateActions } from "./generate-actions";
import { cn } from "@/lib/utils";
import {
	CameraIcon,
	FileTextIcon,
	SparklesIcon,
	MapPinIcon,
	UsersIcon,
} from "lucide-react";

export type StructureTab =
	| "overview"
	| "characters"
	| "scenes"
	| "shots"
	| "generate";

export const VALID_STRUCTURE_TABS: readonly StructureTab[] = [
	"overview",
	"characters",
	"scenes",
	"shots",
	"generate",
];

const stepToTab: Record<MoyinStep, StructureTab> = {
	script: "overview",
	characters: "characters",
	scenes: "scenes",
	generate: "generate",
};

export const tabToStep: Record<StructureTab, MoyinStep> = {
	overview: "script",
	characters: "characters",
	scenes: "scenes",
	shots: "scenes",
	generate: "generate",
};

const TABS: { key: StructureTab; label: string; icon: React.ElementType }[] = [
	{ key: "overview", label: "Structure", icon: FileTextIcon },
	{ key: "characters", label: "Characters", icon: UsersIcon },
	{ key: "scenes", label: "Scenes", icon: MapPinIcon },
	{ key: "shots", label: "Shots", icon: CameraIcon },
	{ key: "generate", label: "Generate", icon: SparklesIcon },
];

/** Tabbed panel displaying parsed script structure: overview, characters, scenes, shots, and generate. */
export function StructurePanel() {
	const activeStep = useMoyinStore((s) => s.activeStep);
	const setActiveStep = useMoyinStore((s) => s.setActiveStep);
	const characters = useMoyinStore((s) => s.characters);
	const scenes = useMoyinStore((s) => s.scenes);
	const shots = useMoyinStore((s) => s.shots);
	const imagesDone = shots.filter((s) => s.imageStatus === "completed").length;
	const [activeTab, setActiveTab] = useState<StructureTab>(
		stepToTab[activeStep] || "overview"
	);

	const tabBadge = (key: StructureTab): string | null => {
		if (key === "characters" && characters.length > 0)
			return String(characters.length);
		if (key === "scenes" && scenes.length > 0) return String(scenes.length);
		if (key === "shots" && shots.length > 0)
			return `${imagesDone}/${shots.length}`;
		return null;
	};

	// Sync tab when store step changes externally (e.g. on project load)
	useEffect(() => {
		const mappedTab = stepToTab[activeStep];
		// Don't override "shots" with "scenes" if user explicitly chose shots
		if (mappedTab && activeTab !== "shots") {
			setActiveTab(mappedTab);
		} else if (mappedTab && activeTab === "shots" && activeStep !== "scenes") {
			setActiveTab(mappedTab);
		}
	}, [activeStep, activeTab]);

	// Listen for qcut://panel subpanel switching (iPad CLI)
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (
				detail?.panel === "moyin" &&
				typeof detail?.subpanel === "string" &&
				VALID_STRUCTURE_TABS.includes(detail.subpanel as StructureTab)
			) {
				setActiveTab(detail.subpanel as StructureTab);
			}
		};
		window.addEventListener("qcut:switch-subpanel", handler);
		return () => window.removeEventListener("qcut:switch-subpanel", handler);
	}, []);

	const handleTabChange = useCallback(
		(tab: StructureTab) => {
			setActiveTab(tab);
			setActiveStep(tabToStep[tab]);
		},
		[setActiveStep]
	);

	// Listen for programmatic tab switches from CLI/API
	useEffect(() => {
		const handler = (e: Event) => {
			if (!(e instanceof CustomEvent)) return;
			const tab = e.detail?.tab;
			if (
				typeof tab === "string" &&
				VALID_STRUCTURE_TABS.includes(tab as StructureTab)
			) {
				handleTabChange(tab as StructureTab);
			}
		};
		window.addEventListener("moyin:switch-tab", handler);
		return () => window.removeEventListener("moyin:switch-tab", handler);
	}, [handleTabChange]);

	// Keyboard shortcuts for navigation and deletion
	const deleteSelectedItem = useMoyinStore((s) => s.deleteSelectedItem);
	const selectNextItem = useMoyinStore((s) => s.selectNextItem);
	const selectPrevItem = useMoyinStore((s) => s.selectPrevItem);
	const setSelectedItem = useMoyinStore((s) => s.setSelectedItem);
	const undo = useMoyinStore((s) => s.undo);
	const redo = useMoyinStore((s) => s.redo);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			// Ctrl+Z / Ctrl+Shift+Z for undo/redo
			if ((e.ctrlKey || e.metaKey) && e.key === "z") {
				e.preventDefault();
				if (e.shiftKey) redo();
				else undo();
				return;
			}

			switch (e.key) {
				case "Delete":
				case "Backspace":
					deleteSelectedItem();
					break;
				case "Escape":
					setSelectedItem(null, null);
					break;
				case "ArrowDown":
					e.preventDefault();
					selectNextItem();
					break;
				case "ArrowUp":
					e.preventDefault();
					selectPrevItem();
					break;
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		deleteSelectedItem,
		selectNextItem,
		selectPrevItem,
		setSelectedItem,
		undo,
		redo,
	]);

	return (
		<div className="space-y-3">
			{/* Tab bar */}
			<div className="flex items-center gap-1 border-b pb-0" role="tablist">
				{TABS.map((tab) => {
					const Icon = tab.icon;
					return (
						<button
							key={tab.key}
							type="button"
							role="tab"
							id={`tab-${tab.key}`}
							aria-selected={activeTab === tab.key}
							aria-controls={`tabpanel-${tab.key}`}
							onClick={() => handleTabChange(tab.key)}
							className={cn(
								"flex items-center gap-1 px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
								activeTab === tab.key
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground"
							)}
						>
							<Icon className="h-3 w-3" />
							{tab.label}
							{tabBadge(tab.key) && (
								<span className="text-[9px] text-muted-foreground ml-0.5">
									{tabBadge(tab.key)}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* Tab content */}
			{activeTab === "overview" && (
				<div
					id="tabpanel-overview"
					role="tabpanel"
					aria-labelledby="tab-overview"
				>
					<EpisodeTree />
				</div>
			)}
			{activeTab === "characters" && (
				<div
					id="tabpanel-characters"
					role="tabpanel"
					aria-labelledby="tab-characters"
				>
					<CharacterList />
				</div>
			)}
			{activeTab === "scenes" && (
				<div id="tabpanel-scenes" role="tabpanel" aria-labelledby="tab-scenes">
					<SceneList />
				</div>
			)}
			{activeTab === "shots" && (
				<div id="tabpanel-shots" role="tabpanel" aria-labelledby="tab-shots">
					<ShotBreakdown />
				</div>
			)}
			{activeTab === "generate" && (
				<div
					id="tabpanel-generate"
					role="tabpanel"
					aria-labelledby="tab-generate"
				>
					<GenerateActions />
				</div>
			)}

			{/* Empty state hints when no data exists for current tab */}
			{activeTab === "overview" &&
				characters.length === 0 &&
				scenes.length === 0 &&
				shots.length === 0 && (
					<p className="text-[10px] text-muted-foreground/50 text-center pt-2">
						Upload or paste a script to begin.
					</p>
				)}
			{activeTab === "generate" && shots.length === 0 && (
				<p className="text-[10px] text-muted-foreground/50 text-center pt-2">
					Generate shots from the Structure tab first.
				</p>
			)}

			{/* Keyboard shortcut hints */}
			<div
				className="flex items-center gap-2 text-[9px] text-muted-foreground/60 pt-1 border-t"
				aria-label="Keyboard shortcuts"
			>
				<span>
					<kbd className="px-1 py-0.5 rounded border text-[8px]">↑↓</kbd>{" "}
					Navigate
				</span>
				<span>
					<kbd className="px-1 py-0.5 rounded border text-[8px]">Del</kbd>{" "}
					Remove
				</span>
				<span>
					<kbd className="px-1 py-0.5 rounded border text-[8px]">Esc</kbd>{" "}
					Deselect
				</span>
				<span>
					<kbd className="px-1 py-0.5 rounded border text-[8px]">⌘Z</kbd> Undo
				</span>
			</div>
		</div>
	);
}
