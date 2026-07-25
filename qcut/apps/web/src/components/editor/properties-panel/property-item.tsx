import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

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
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <div className={cn("flex-1", className)}>{children}</div>;
}

interface PropertyGroupProps {
	title: React.ReactNode;
	children: React.ReactNode;
	defaultExpanded?: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	className?: string;
}

export function PropertyGroup({
	title,
	children,
	defaultExpanded = true,
	expanded,
	onExpandedChange,
	className,
}: PropertyGroupProps) {
	const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
	const isExpanded = expanded ?? localExpanded;
	const toggleExpanded = () => {
		const nextExpanded = !isExpanded;
		if (expanded === undefined) setLocalExpanded(nextExpanded);
		onExpandedChange?.(nextExpanded);
	};

	return (
		<PropertyItem direction="column" className={cn("gap-3", className)}>
			<button
				type="button"
				className="flex items-center gap-1.5"
				onClick={toggleExpanded}
				aria-expanded={isExpanded}
			>
				<span className="text-xs">{title}</span>
				<ChevronDown
					className={cn(
						"size-3 transition-transform",
						!isExpanded && "-rotate-90"
					)}
				/>
			</button>
			{isExpanded && <PropertyItemValue>{children}</PropertyItemValue>}
		</PropertyItem>
	);
}
