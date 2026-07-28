"use client";

import { Button } from "./ui/button";
import { PanelView } from "@/types/panel";
import {
	ChevronDown,
	ArrowLeft,
	BookOpen,
	CircleHelp,
	Download,
	MessageSquarePlus,
	Rocket,
	SquarePen,
	Trash,
} from "lucide-react";
import { openQuickStart } from "./onboarding";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { HeaderBase } from "./header-base";
import { formatTimeCode } from "@/lib/time";
import { useProjectStore } from "@/stores/project-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { RenameProjectDialog } from "./rename-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { FaDiscord } from "react-icons/fa6";
import { useExportStore } from "@/stores/export-store";
import { PanelPresetSelector } from "./panel-preset-selector";
import { AutoSaveIndicator } from "./editor/auto-save-indicator";
import { ScreenRecordingControl } from "./editor/screen-recording-control";
import type { KeyboardEvent } from "react";
import { CreditBalance } from "./license/credit-balance";
import { KeyboardShortcutsMenuItem } from "./keyboard-shortcuts-help";
import { ScreenshotControl } from "./editor/screenshot-control";
import { LanguageSelector } from "./language-selector";
import { useTranslation } from "@/lib/i18n";
import { ReviewPanelControl } from "./editor/review/review-panel-control";
import { UserLibrarySyncControl } from "./user-library-sync-control";
import { AboutUpdatesDialog } from "./about-updates-dialog";
import {
	GlobalSettingsDialog,
	GlobalSettingsMenuItem,
} from "./global-settings-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useAppVersion } from "@/hooks/use-app-version";

/** Editor header bar with project name, export, screenshot, and recording controls. */
export function EditorHeader() {
	const { getTotalDuration } = useTimelineStore();
	const { activeProject, renameProject, deleteProject } = useProjectStore();
	const timecodeFormat = useAppSettingsStore((state) => state.timecodeFormat);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
	const navigate = useNavigate();
	const { setPanelView } = useExportStore();
	const { t } = useTranslation();
	const appVersion = useAppVersion();

	const handleExport = () => {
		setPanelView(PanelView.EXPORT);
	};

	const handleExportKeyDown = ({ key }: KeyboardEvent<HTMLButtonElement>) => {
		if (key === "Enter" || key === " ") {
			return;
		}
	};

	const handleAboutKeyDown = ({
		key,
		preventDefault,
	}: KeyboardEvent<HTMLButtonElement>) => {
		if (key !== "Enter" && key !== " ") return;
		preventDefault();
		setIsAboutDialogOpen(true);
	};

	const handleNameSave = async (newName: string) => {
		if (activeProject && newName.trim() && newName !== activeProject.name) {
			try {
				await renameProject(activeProject.id, newName.trim());
				setIsRenameDialogOpen(false);
			} catch {
				// Rename failure is handled by the store
			}
		}
	};

	const handleDelete = () => {
		if (activeProject) {
			deleteProject(activeProject.id);
			setIsDeleteDialogOpen(false);
			navigate({ to: "/projects" });
		}
	};

	const leftContent = (
		<div className="flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="secondary"
						className="h-auto py-1.5 px-2.5 flex items-center justify-center"
						data-testid="project-menu-button"
					>
						<ChevronDown className="text-muted-foreground" />
						<span className="text-sm mr-2 truncate max-w-48">
							{activeProject?.name}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-40">
					<Link to="/projects">
						<DropdownMenuItem className="flex items-center gap-1.5">
							<ArrowLeft className="h-4 w-4" />
							{t("editor.header.projects")}
						</DropdownMenuItem>
					</Link>
					<DropdownMenuItem
						className="flex items-center gap-1.5"
						onClick={() => setIsRenameDialogOpen(true)}
					>
						<SquarePen className="h-4 w-4" />
						{t("editor.header.renameProject")}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						className="flex items-center gap-1.5"
						onClick={() => setIsDeleteDialogOpen(true)}
					>
						<Trash className="h-4 w-4" />
						{t("editor.header.deleteProject")}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<a
							href="https://github.com/Quriosity-agent/qcut/tree/master/docs"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5"
							data-testid="help-center-menu-item"
						>
							<BookOpen className="h-4 w-4" />
							{t("editor.header.helpCenter")}
						</a>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a
							href="https://github.com/Quriosity-agent/qcut/issues/new"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5"
							data-testid="feedback-menu-item"
						>
							<MessageSquarePlus className="h-4 w-4" />
							{t("editor.header.feedback")}
						</a>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center gap-1.5"
						onSelect={() => openQuickStart()}
						data-testid="quick-start-menu-item"
					>
						<Rocket className="h-4 w-4" />
						{t("editor.header.quickStart")}
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a
							href="https://discord.gg/zmR9N35cjK"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5"
						>
							<FaDiscord className="h-4 w-4" />
							Discord
						</a>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<ScreenshotControl variant="menu-item" />
					<KeyboardShortcutsMenuItem />
					<GlobalSettingsMenuItem />
					<DropdownMenuItem
						className="flex items-center gap-1.5"
						onSelect={() => setIsAboutDialogOpen(true)}
						data-testid="about-updates-menu-item"
					>
						<CircleHelp className="size-4" />
						{t("updates.about")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
				onConfirm={handleNameSave}
				projectName={activeProject?.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDelete}
				projectName={activeProject?.name || ""}
			/>
			<GlobalSettingsDialog />
			<AboutUpdatesDialog
				open={isAboutDialogOpen}
				onOpenChange={setIsAboutDialogOpen}
			/>
		</div>
	);

	const centerContent = (
		<div className="flex items-center gap-2 text-xs">
			<span>
				{formatTimeCode(
					getTotalDuration(),
					timecodeFormat,
					activeProject?.fps || 30
				)}
			</span>
		</div>
	);

	const rightContent = (
		<nav className="flex items-center gap-2">
			{appVersion && (
				<span
					className="hidden xl:inline text-[11px] text-muted-foreground whitespace-nowrap"
					title={t("updates.currentVersion", { version: appVersion })}
					data-testid="app-version"
				>
					v{appVersion}
				</span>
			)}
			<AutoSaveIndicator className="whitespace-nowrap" />
			<CreditBalance />
			<LanguageSelector />
			<PanelPresetSelector />
			<ScreenRecordingControl />
			<UserLibrarySyncControl />
			<ReviewPanelControl />
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="rounded-sm"
						aria-label={t("updates.about")}
						onClick={() => setIsAboutDialogOpen(true)}
						onKeyDown={handleAboutKeyDown}
						data-testid="about-updates-button"
					>
						<CircleHelp className="size-4">
							<title>{t("updates.about")}</title>
						</CircleHelp>
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t("updates.about")}</TooltipContent>
			</Tooltip>
			<Button
				type="button"
				size="sm"
				className="h-7 text-xs bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
				onClick={handleExport}
				onKeyDown={handleExportKeyDown}
				data-testid="export-button"
			>
				<Download className="h-4 w-4" />
				<span className="text-sm">{t("editor.header.export")}</span>
			</Button>
		</nav>
	);

	return (
		<HeaderBase
			leftContent={leftContent}
			centerContent={centerContent}
			rightContent={rightContent}
			className="bg-background h-[3.2rem] px-4 items-center"
		/>
	);
}
