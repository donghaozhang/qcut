import { cn } from "@/lib/utils";
import { ChevronDown, Info, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropertyItemProps {
	direction?: "row" | "column";
	children: React.ReactNode;
	className?: string;
}

export function PropertyItem({
	direction = "row",
	children,
	className,
}: PropertyItemProps) {
	return (
		<div
			className={cn(
				"flex gap-2",
				direction === "row"
					? "items-center justify-between gap-6"
					: "flex-col gap-1",
				className
			)}
		>
			{children}
		</div>
	);
}

export function PropertyItemLabel({
	children,
	className,
	htmlFor,
}: {
	children: React.ReactNode;
	className?: string;
	htmlFor?: string;
}) {
	return (
		<label className={cn("text-xs", className)} htmlFor={htmlFor}>
			{children}
		</label>
	);
}

export function PropertyItemValue({
	children,
	className,
	inert,
	"aria-disabled": ariaDisabled,
}: {
	children: React.ReactNode;
	className?: string;
	inert?: boolean;
	"aria-disabled"?: boolean;
}) {
	return (
		<div
			className={cn("flex-1", className)}
			inert={inert}
			aria-disabled={ariaDisabled}
		>
			{children}
		</div>
	);
}

interface PropertyGroupProps {
	title: React.ReactNode;
	children: React.ReactNode;
	defaultExpanded?: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	className?: string;
	testId?: string;
	/** Leading checkbox that switches the whole section on or off. */
	enabled?: boolean;
	onEnabledChange?: (enabled: boolean) => void;
	enableLabel?: string;
	/** Tooltip shown behind an info icon next to the title. */
	info?: React.ReactNode;
	/** Header reset icon; the body keeps any full-width reset it already has. */
	onReset?: () => void;
	resetLabel?: string;
	/** Trailing header controls, e.g. keyframe navigation for the section. */
	headerActions?: React.ReactNode;
}

export function PropertyGroup({
	title,
	children,
	defaultExpanded = true,
	expanded,
	onExpandedChange,
	className,
	testId,
	enabled,
	onEnabledChange,
	enableLabel,
	info,
	onReset,
	resetLabel,
	headerActions,
}: PropertyGroupProps) {
	const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
	const isExpanded = expanded ?? localExpanded;
	const toggleExpanded = () => {
		const nextExpanded = !isExpanded;
		if (expanded === undefined) setLocalExpanded(nextExpanded);
		onExpandedChange?.(nextExpanded);
	};
	const hasToggle = onEnabledChange !== undefined;
	const dimmed = hasToggle && enabled === false;

	return (
		<PropertyItem direction="column" className={cn("gap-3", className)}>
			<div className="flex items-center gap-1.5">
				{hasToggle ? (
					<Checkbox
						aria-label={enableLabel}
						checked={enabled === true}
						onCheckedChange={(checked) => onEnabledChange(checked === true)}
						onKeyDown={(event) => event.stopPropagation()}
						className="size-3.5 border-none bg-muted-foreground/50 data-[state=checked]:bg-primary [&_svg]:size-3"
					/>
				) : null}
				<button
					type="button"
					className="flex min-w-0 items-center gap-1.5"
					data-testid={testId}
					onClick={toggleExpanded}
					aria-expanded={isExpanded}
				>
					<span className={cn("text-xs", dimmed && "text-muted-foreground")}>
						{title}
					</span>
					<ChevronDown
						className={cn(
							"size-3 transition-transform",
							!isExpanded && "-rotate-90"
						)}
					/>
				</button>
				{info ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={typeof info === "string" ? info : undefined}
									className="inline-flex rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
								>
									<Info className="size-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-56 text-xs">
								{info}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : null}
				{onReset || headerActions ? (
					<div className="ml-auto flex items-center gap-0.5">
						{onReset ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
											aria-label={resetLabel}
											onClick={onReset}
										>
											<RotateCcw className="size-3" />
										</button>
									</TooltipTrigger>
									{resetLabel ? (
										<TooltipContent>{resetLabel}</TooltipContent>
									) : null}
								</Tooltip>
							</TooltipProvider>
						) : null}
						{headerActions}
					</div>
				) : null}
			</div>
			{isExpanded && (
				<PropertyItemValue
					className={cn(dimmed && "pointer-events-none opacity-45")}
					// `inert` also removes the body from the tab order and from AT.
					inert={dimmed || undefined}
					aria-disabled={dimmed || undefined}
				>
					{children}
				</PropertyItemValue>
			)}
		</PropertyItem>
	);
}
