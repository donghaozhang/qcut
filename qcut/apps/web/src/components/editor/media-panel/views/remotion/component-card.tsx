/**
 * Component Card
 *
 * Card component for displaying a Remotion component in the browser grid.
 * Shows thumbnail, name, description, duration, and action buttons.
 *
 * @module components/editor/media-panel/views/remotion/component-card
 */

"use client";

import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Player } from "@remotion/player";
import { Eye, Layers, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RemotionComponentDefinition } from "@/lib/remotion/types";

// ============================================================================
// Types
// ============================================================================

export interface ComponentCardProps {
	/** The component definition to display */
	component: RemotionComponentDefinition;
	/** Callback when user clicks to add the component */
	onAdd: (component: RemotionComponentDefinition) => void;
	/** Optional callback for preview button */
	onPreview?: (component: RemotionComponentDefinition) => void;
	/** Whether the card is in a compact layout */
	compact?: boolean;
	/** Additional class names */
	className?: string;
}

// ============================================================================
// Category Colors
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
	template: "from-violet-600/20 to-purple-600/20",
	animation: "from-blue-600/20 to-cyan-600/20",
	scene: "from-emerald-600/20 to-teal-600/20",
	effect: "from-orange-600/20 to-amber-600/20",
	transition: "from-pink-600/20 to-rose-600/20",
	text: "from-indigo-600/20 to-blue-600/20",
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
	template: "text-violet-400",
	animation: "text-blue-400",
	scene: "text-emerald-400",
	effect: "text-orange-400",
	transition: "text-pink-400",
	text: "text-indigo-400",
};

// ============================================================================
// Player Error Boundary
// ============================================================================

class PlayerErrorBoundary extends Component<
	{ children: ReactNode; onError: () => void },
	{ hasError: boolean }
> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(_error: Error, _info: ErrorInfo) {
		this.props.onError();
	}

	render() {
		if (this.state.hasError) return null;
		return this.props.children;
	}
}

// ============================================================================
// Component Card
// ============================================================================

export function ComponentCard({
	component,
	onAdd,
	onPreview,
	compact = false,
	className,
}: ComponentCardProps) {
	const [isHovered, setIsHovered] = useState(false);
	const [showPlayer, setShowPlayer] = useState(false);
	const [playerError, setPlayerError] = useState(false);
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	);

	// Clean up hover timer on unmount
	useEffect(() => {
		return () => {
			if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		};
	}, []);

	const handleMouseEnter = () => {
		setIsHovered(true);
		setPlayerError(false);
		hoverTimerRef.current = setTimeout(() => setShowPlayer(true), 300);
	};

	const handleMouseLeave = () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		setIsHovered(false);
		setShowPlayer(false);
	};

	const durationSeconds = (component.durationInFrames / component.fps).toFixed(
		1
	);
	const gradientClass =
		CATEGORY_COLORS[component.category] || CATEGORY_COLORS.template;
	const iconColorClass =
		CATEGORY_ICON_COLORS[component.category] || CATEGORY_ICON_COLORS.template;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"relative group rounded-lg border border-border/80 bg-slate-800/50",
						"transition-all cursor-pointer overflow-hidden",
						"hover:border-violet-500/50 hover:bg-slate-700/70",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
						className
					)}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={handleMouseLeave}
					onClick={() => onAdd(component)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onAdd(component);
						}
					}}
					tabIndex={0}
					role="button"
					aria-label={`Add ${component.name} to timeline`}
					data-testid={`component-card-${component.id}`}
				>
					{/* Thumbnail / Preview */}
					<div
						className={cn(
							"relative bg-gradient-to-br flex items-center justify-center",
							gradientClass,
							compact ? "aspect-square" : "aspect-video"
						)}
					>
						{showPlayer && !playerError ? (
							<PlayerErrorBoundary onError={() => setPlayerError(true)}>
								<Player
									component={component.component}
									inputProps={component.defaultProps}
									durationInFrames={component.durationInFrames}
									compositionWidth={component.width}
									compositionHeight={component.height}
									fps={component.fps}
									style={{ width: "100%", height: "100%" }}
									controls={false}
									loop
									autoPlay
								/>
							</PlayerErrorBoundary>
						) : component.thumbnail ? (
							<img
								src={component.thumbnail}
								alt={component.name}
								className="w-full h-full object-cover"
							/>
						) : (
							<Layers className={cn("w-8 h-8", iconColorClass)} />
						)}

						{/* Hover overlay with actions */}
						{isHovered && (
							<div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 transition-opacity">
								<Button
									size="sm"
									variant="secondary"
									className="gap-1 h-8"
									onClick={(e) => {
										e.stopPropagation();
										onAdd(component);
									}}
								>
									<Plus className="w-3 h-3" />
									Add
								</Button>
								{onPreview && (
									<Button
										size="sm"
										variant="outline"
										className="gap-1 h-8"
										onClick={(e) => {
											e.stopPropagation();
											onPreview(component);
										}}
									>
										<Eye className="w-3 h-3" />
									</Button>
								)}
							</div>
						)}

						{/* Duration badge — hidden while player is active */}
						{!showPlayer && (
							<Badge
								variant="secondary"
								className={cn(
									"absolute top-1 right-1 text-[10px] px-1 py-0 opacity-80",
									isHovered && "opacity-0"
								)}
							>
								{durationSeconds}s
							</Badge>
						)}
					</div>

					{/* Component Info */}
					<div className={cn("p-2", compact && "p-1.5")}>
						<div className="flex items-center justify-between gap-1">
							<span
								className={cn(
									"font-medium text-foreground truncate",
									compact ? "text-[10px]" : "text-xs"
								)}
							>
								{component.name}
							</span>
						</div>
						{!compact && component.description && (
							<p className="text-[10px] text-muted-foreground truncate mt-0.5">
								{component.description}
							</p>
						)}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="max-w-xs">
				<div className="space-y-1">
					<p className="font-medium">{component.name}</p>
					{component.description && (
						<p className="text-xs text-muted-foreground">
							{component.description}
						</p>
					)}
					<div className="flex gap-2 text-xs text-muted-foreground">
						<span>
							{component.width}×{component.height}
						</span>
						<span>{component.fps}fps</span>
						<span>{component.durationInFrames} frames</span>
					</div>
					{component.tags && component.tags.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-1">
							{component.tags.slice(0, 5).map((tag) => (
								<Badge
									key={tag}
									variant="outline"
									className="text-[9px] px-1 py-0"
								>
									{tag}
								</Badge>
							))}
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

export default ComponentCard;
