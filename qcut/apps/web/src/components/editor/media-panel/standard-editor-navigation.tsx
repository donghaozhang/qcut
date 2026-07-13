"use client";

import {
	BotIcon,
	ChevronDownIcon,
	ScissorsIcon,
	SparklesIcon,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STANDARD_EDITOR_TABS, tabs, useMediaPanelStore } from "./store";
import { useTranslation } from "@/lib/i18n";
import { TAB_LABEL_KEYS } from "./media-panel-i18n";

export function StandardEditorNavigation() {
	const { t } = useTranslation();
	const activeGroup = useMediaPanelStore((state) => state.activeGroup);
	const activeEditSubgroup = useMediaPanelStore(
		(state) => state.activeEditSubgroup
	);
	const activeTab = useMediaPanelStore((state) => state.activeTab);
	const setActiveGroup = useMediaPanelStore((state) => state.setActiveGroup);
	const setActiveEditSubgroup = useMediaPanelStore(
		(state) => state.setActiveEditSubgroup
	);
	const setActiveTab = useMediaPanelStore((state) => state.setActiveTab);
	const isStandardWorkspace =
		activeGroup === "media" ||
		(activeGroup === "edit" && activeEditSubgroup === "manual-edit");

	return (
		<div
			className="flex h-[54px] shrink-0 border-b border-border/60 bg-panel-accent"
			data-testid="standard-editor-navigation"
		>
			<div className="min-w-0 flex-1 overflow-x-auto scrollbar-x-hidden">
				<div className="flex h-full min-w-max items-stretch px-1">
					{STANDARD_EDITOR_TABS.map((tabKey) => {
						const tab = tabs[tabKey];
						const label = t(TAB_LABEL_KEYS[tabKey]);
						const Icon = tab.icon;
						const isActive = isStandardWorkspace && activeTab === tabKey;
						return (
							<button
								key={tabKey}
								type="button"
								className={cn(
									"relative flex h-full w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 text-[9px] transition-colors",
									isActive
										? "text-primary"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								)}
								aria-pressed={isActive}
								aria-label={label}
								data-testid={`${tabKey}-panel-tab`}
								onClick={() => setActiveTab(tabKey)}
							>
								<Icon className="size-4" />
								<span className="max-w-full truncate px-0.5">{label}</span>
								{isActive ? (
									<span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
								) : null}
							</button>
						);
					})}
				</div>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={cn(
							"flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border/60 text-[9px] transition-colors",
							isStandardWorkspace
								? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								: "bg-primary/10 text-primary"
						)}
						aria-label={t("workspace.switch")}
						data-testid="workspace-menu-trigger"
					>
						<ChevronDownIcon className="size-4" />
						<span>{t("workspace.more")}</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onSelect={() => setActiveTab("media")}>
						<ScissorsIcon className="size-4" />
						{t("workspace.standard")}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => {
							setActiveGroup("edit");
							setActiveEditSubgroup("ai-edit");
						}}
						data-testid="workspace-ai-assist"
					>
						<SparklesIcon className="size-4" />
						{t("workspace.aiAssist")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setActiveGroup("ai-create")}
						data-testid="workspace-ai-create"
					>
						<BotIcon className="size-4" />
						{t("workspace.aiCreate")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setActiveGroup("agents")}
						data-testid="workspace-agents"
					>
						<BotIcon className="size-4" />
						{t("workspace.agents")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
