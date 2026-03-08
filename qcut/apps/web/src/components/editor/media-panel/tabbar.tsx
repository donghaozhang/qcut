"use client";

import { cn } from "@/lib/utils";
import { tabs, tabGroups, useMediaPanelStore, EditSubgroup } from "./store";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRef, useEffect } from "react";

/** Tab bar displaying the active group's tabs with horizontal scrolling and prev/next navigation. */
export function TabBar() {
	const {
		activeTab,
		setActiveTab,
		activeGroup,
		activeEditSubgroup,
		setActiveEditSubgroup,
	} = useMediaPanelStore();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

	const groupDef = tabGroups[activeGroup];
	const subgroups = activeGroup === "edit" ? groupDef.subgroups : undefined;
	const tabKeys = subgroups
		? subgroups[activeEditSubgroup].tabs
		: groupDef.tabs;
	const activeIndex = tabKeys.indexOf(activeTab);
	const hasPrev = activeIndex > 0;
	const hasNext = activeIndex < tabKeys.length - 1;

	const goToPrev = () => {
		if (hasPrev) setActiveTab(tabKeys[activeIndex - 1]);
	};

	const goToNext = () => {
		if (hasNext) setActiveTab(tabKeys[activeIndex + 1]);
	};

	// Scroll active tab into view when it changes
	useEffect(() => {
		const el = tabRefs.current.get(activeTab);
		if (el) {
			el.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "nearest",
			});
		}
	}, [activeTab]);

	return (
		<div className="flex flex-col">
			{subgroups && (
				<div className="flex bg-panel-accent border-b border-border/30 px-2 gap-1 py-1">
					{(Object.keys(subgroups) as EditSubgroup[]).map((key) => (
						<button
							key={key}
							type="button"
							className={cn(
								"flex-1 py-1 rounded text-xs font-medium transition-colors text-center",
								activeEditSubgroup === key
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
							)}
							onClick={() => setActiveEditSubgroup(key)}
						>
							{subgroups[key].label}
						</button>
					))}
				</div>
			)}
			<div className="flex">
				<NavButton direction="left" onClick={goToPrev} isVisible={hasPrev} />
				<div
					ref={scrollContainerRef}
					className="h-10 bg-panel-accent px-2 flex justify-start items-center gap-2 overflow-x-auto scrollbar-x-hidden relative w-full"
				>
					{tabKeys.map((tabKey) => {
						const tab = tabs[tabKey];
						return (
							<button
								type="button"
								ref={(el) => {
									if (el) tabRefs.current.set(tabKey, el);
								}}
								className={cn(
									"flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded hover:bg-foreground/5 transition-colors",
									activeTab === tabKey
										? "text-primary"
										: "text-muted-foreground"
								)}
								onClick={() => setActiveTab(tabKey)}
								key={tabKey}
								aria-pressed={activeTab === tabKey}
								data-testid={`${tabKey}-panel-tab`}
							>
								<tab.icon className="size-[1.1rem]! shrink-0" />
								<span className="text-[0.65rem] whitespace-nowrap">
									{tab.label}
								</span>
							</button>
						);
					})}
				</div>
				<NavButton direction="right" onClick={goToNext} isVisible={hasNext} />
			</div>
		</div>
	);
}

/** Chevron button for navigating between tabs in the tab bar. */
function NavButton({
	direction,
	onClick,
	isVisible,
}: {
	direction: "left" | "right";
	onClick: () => void;
	isVisible: boolean;
}) {
	if (!isVisible) return null;

	const Icon = direction === "left" ? ChevronLeft : ChevronRight;

	return (
		<div className="bg-panel-accent w-12 h-full flex items-center justify-center">
			<Button
				size="icon"
				aria-label={direction === "left" ? "Previous tab" : "Next tab"}
				className="rounded-[0.4rem] w-4 h-7 bg-foreground/10!"
				onClick={onClick}
			>
				<Icon className="size-4! text-foreground" />
			</Button>
		</div>
	);
}
