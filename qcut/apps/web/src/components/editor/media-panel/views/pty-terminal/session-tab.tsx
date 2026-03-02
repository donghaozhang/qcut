"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/stores/pty-session-types";

interface SessionTabProps {
	tabId: string;
	label: string;
	status: ConnectionStatus;
	isActive: boolean;
	onSelect: () => void;
	onClose: () => void;
	onRename: (label: string) => void;
}

const statusColorMap: Record<ConnectionStatus, string> = {
	connected: "bg-green-500",
	connecting: "bg-yellow-500 animate-pulse",
	disconnected: "bg-gray-400",
	error: "bg-red-500",
};

export function SessionTab({
	tabId,
	label,
	status,
	isActive,
	onSelect,
	onClose,
	onRename,
}: SessionTabProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(label);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleDoubleClick = () => {
		setEditValue(label);
		setIsEditing(true);
		requestAnimationFrame(() => inputRef.current?.select());
	};

	const commitRename = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== label) {
			onRename(trimmed);
		}
		setIsEditing(false);
	};

	return (
		<div
			role="tab"
			tabIndex={0}
			aria-selected={isActive}
			data-testid={`session-tab-${tabId}`}
			className={cn(
				"group flex items-center gap-1.5 h-7 px-2 rounded text-xs cursor-pointer select-none shrink-0 max-w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isActive
					? "bg-background text-foreground shadow-sm border border-border/50"
					: "text-muted-foreground hover:bg-muted/50",
			)}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			onDoubleClick={handleDoubleClick}
		>
			<div
				className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusColorMap[status])}
				aria-label={`Status: ${status}`}
			/>

			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={commitRename}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitRename();
						if (e.key === "Escape") setIsEditing(false);
					}}
					className="w-full bg-transparent outline-none text-xs"
					aria-label="Rename session"
				/>
			) : (
				<span className="truncate">{label}</span>
			)}

			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				className={cn(
					"shrink-0 rounded p-0.5 transition-colors",
					isActive
						? "opacity-60 hover:opacity-100 hover:bg-muted"
						: "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted",
				)}
				aria-label={`Close ${label}`}
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}
