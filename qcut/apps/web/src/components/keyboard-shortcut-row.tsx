import { X } from "lucide-react";
import type { KeyboardShortcut } from "@/hooks/keyboard/use-keyboard-shortcuts-help";
import { Button } from "./ui/button";

function ShortcutKeys({ keys }: { keys: string[] }) {
	return (
		<>
			{keys.map((key) => (
				<span key={key} className="flex items-center gap-1">
					{key.split("+").map((part) => (
						<kbd
							key={`${key}-${part}`}
							className="min-w-6 rounded-sm border border-border bg-muted px-1.5 py-1 text-center font-sans text-[11px] leading-none"
						>
							{part}
						</kbd>
					))}
				</span>
			))}
		</>
	);
}

export function KeyboardShortcutRow({
	shortcut,
	isRecording,
	unboundLabel,
	recordingLabel,
	onClear,
	onRecord,
}: {
	shortcut: KeyboardShortcut;
	isRecording: boolean;
	unboundLabel: string;
	recordingLabel: string;
	onClear: () => void;
	onRecord: () => void;
}) {
	const hasBinding = shortcut.keys.length > 0;
	return (
		<div
			className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0"
			data-testid={`shortcut-row-${shortcut.action}`}
		>
			<span className="truncate text-sm">{shortcut.description}</span>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 min-w-24 justify-center gap-1.5 rounded-sm px-2"
					onClick={onRecord}
					data-testid={`shortcut-record-${shortcut.action}`}
				>
					{isRecording ? (
						<span className="text-xs text-primary">{recordingLabel}</span>
					) : hasBinding ? (
						<ShortcutKeys keys={shortcut.keys} />
					) : (
						<span className="text-xs text-muted-foreground">
							{unboundLabel}
						</span>
					)}
				</Button>
				{hasBinding ? (
					<Button
						type="button"
						variant="text"
						size="icon"
						className="size-8"
						title={unboundLabel}
						onClick={onClear}
					>
						<X className="size-3.5" />
					</Button>
				) : (
					<div className="size-8" />
				)}
			</div>
		</div>
	);
}
