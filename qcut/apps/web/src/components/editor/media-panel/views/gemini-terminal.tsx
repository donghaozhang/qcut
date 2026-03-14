"use client";

import { useGeminiTerminalStore } from "@/stores/gemini-terminal-store";
import type {
	ChatProvider,
	PiProviderType,
} from "@/stores/gemini-terminal-store";
import { useAsyncMediaStore } from "@/hooks/media/use-async-media-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Send, Trash2, Loader2, AlertCircle, Wrench } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { MessageItem } from "./gemini-terminal/message-item";
import { AttachmentPreview } from "./gemini-terminal/attachment-preview";
import { cn } from "@/lib/utils";
import { generateUUID } from "@/lib/utils";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { toast } from "sonner";
import type { AttachedFile } from "@/stores/gemini-terminal-store";

const PI_MODELS: Record<PiProviderType, string[]> = {
	anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
	openai: ["gpt-4o", "gpt-4o-mini"],
	google: ["gemini-2.5-pro", "gemini-2.5-flash"],
	openrouter: ["minimax/minimax-2.5", "moonshot/kimi-2.5", "google/gemini-3-flash"],
};

const PROVIDER_LABELS: Record<PiProviderType, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google",
	openrouter: "OpenRouter",
};

export function GeminiTerminalView() {
	const {
		messages,
		isStreaming,
		currentStreamingContent,
		pendingAttachments,
		inputValue,
		error,
		activeProvider,
		setActiveProvider,
		selectedPiProvider,
		selectedPiModel,
		setPiModel,
		activeToolCalls,
		setInputValue,
		sendMessage,
		addAttachment,
		removeAttachment,
		clearHistory,
		resetPiConversation,
	} = useGeminiTerminalStore();

	const { store: mediaStore } = useAsyncMediaStore();
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);

	// Auto-scroll on new messages
	useEffect(() => {
		if (scrollRef.current) {
			const viewport = scrollRef.current.querySelector(
				"[data-radix-scroll-area-viewport]"
			) as HTMLElement | null;
			if (viewport) {
				viewport.scrollTop = viewport.scrollHeight;
			}
		}
	}, []);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!inputValue.trim() && pendingAttachments.length === 0) return;
		await sendMessage(inputValue);
	}, [inputValue, pendingAttachments.length, sendMessage]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit]
	);

	const handleClear = useCallback(() => {
		if (activeProvider === "pi-agent") {
			resetPiConversation();
		} else {
			clearHistory();
		}
	}, [activeProvider, resetPiConversation, clearHistory]);

	const handleModelChange = useCallback(
		(value: string) => {
			// value format: "provider/model"
			const [provider, ...modelParts] = value.split("/");
			const model = modelParts.join("/");
			setPiModel(provider as PiProviderType, model);
		},
		[setPiModel]
	);

	// Drag and drop handlers for media items from the media panel
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		dragCounterRef.current += 1;
		if (e.dataTransfer.types.includes("application/x-media-item")) {
			setIsDragOver(true);
		}
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			dragCounterRef.current = 0;

			const mediaData = e.dataTransfer.getData("application/x-media-item");
			if (mediaData) {
				try {
					const { id } = JSON.parse(mediaData);
					const item = mediaStore?.mediaItems.find((m) => m.id === id);
					if (item) {
						const filePath = item.localPath || item.url;

						if (!filePath || filePath.startsWith("blob:")) {
							toast.error(
								"This media item doesn't have a local file path for analysis."
							);
							return;
						}

						const attachment: AttachedFile = {
							id: generateUUID(),
							mediaId: item.id,
							path: filePath,
							name: item.name,
							type: item.type as "image" | "video" | "audio",
							thumbnailUrl: item.thumbnailUrl,
							mimeType: item.file?.type || `${item.type}/*`,
						};
						addAttachment(attachment);
					}
				} catch (err) {
					handleError(err, {
						operation: "Parse media drag data",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.LOW,
					});
				}
			}
		},
		[mediaStore?.mediaItems, addAttachment]
	);

	const dragProps = {
		onDragEnter: handleDragEnter,
		onDragOver: handleDragOver,
		onDragLeave: handleDragLeave,
		onDrop: handleDrop,
	};

	const providerLabel = activeProvider === "gemini" ? "Gemini" : "Pi Agent";

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between p-2 border-b gap-2">
				<div className="flex items-center gap-2 min-w-0">
					{/* Provider toggle */}
					<div className="flex rounded-md border text-xs">
						<ProviderToggleButton
							active={activeProvider === "gemini"}
							onClick={() => setActiveProvider("gemini")}
							disabled={isStreaming}
						>
							Gemini
						</ProviderToggleButton>
						<ProviderToggleButton
							active={activeProvider === "pi-agent"}
							onClick={() => setActiveProvider("pi-agent")}
							disabled={isStreaming}
						>
							Pi Agent
						</ProviderToggleButton>
					</div>

					{/* Model selector (pi-agent only) */}
					{activeProvider === "pi-agent" && (
						<Select
							value={`${selectedPiProvider}/${selectedPiModel}`}
							onValueChange={handleModelChange}
							disabled={isStreaming}
						>
							<SelectTrigger className="h-7 text-xs w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(
									Object.entries(PI_MODELS) as [PiProviderType, string[]][]
								).map(([provider, models]) => (
									<SelectGroup key={provider}>
										<SelectLabel className="text-xs">
											{PROVIDER_LABELS[provider]}
										</SelectLabel>
										{models.map((model) => (
											<SelectItem
												key={`${provider}/${model}`}
												value={`${provider}/${model}`}
												className="text-xs"
											>
												{model}
											</SelectItem>
										))}
									</SelectGroup>
								))}
							</SelectContent>
						</Select>
					)}
				</div>

				<Button
					type="button"
					variant="text"
					size="sm"
					onClick={handleClear}
					disabled={messages.length === 0 || isStreaming}
					aria-label="Clear chat history"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>

			{/* Message List */}
			<ScrollArea className="flex-1" ref={scrollRef}>
				<div
					role="log"
					aria-live="polite"
					aria-label="Chat messages"
					className="p-3"
				>
					{messages.length === 0 && !isStreaming && (
						<div className="text-center text-muted-foreground py-8">
							<p className="text-sm">
								Start a conversation with {providerLabel}
							</p>
							<p className="text-xs mt-2">
								Drag media from the panel to analyze it
							</p>
						</div>
					)}

					{messages.map((msg) => (
						<MessageItem
							key={msg.id}
							message={msg}
							providerLabel={
								activeProvider === "gemini" ? "Gemini" : "Pi Agent"
							}
						/>
					))}

					{isStreaming && currentStreamingContent && (
						<MessageItem
							message={{
								id: "streaming",
								role: "assistant",
								content: currentStreamingContent,
								timestamp: Date.now(),
							}}
							isStreaming
							providerLabel={
								activeProvider === "gemini" ? "Gemini" : "Pi Agent"
							}
						/>
					)}

					{isStreaming && !currentStreamingContent && (
						<div className="flex items-center gap-2 p-3 bg-muted rounded-lg mr-8">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span className="text-sm text-muted-foreground">Thinking...</span>
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Active tool calls indicator (pi-agent only) */}
			{activeProvider === "pi-agent" &&
				activeToolCalls.length > 0 &&
				isStreaming && (
					<div className="border-t px-3 py-2 space-y-1">
						{activeToolCalls
							.filter((tc) => !tc.duration)
							.map((tc) => (
								<div
									key={tc.toolCallId}
									className="flex items-center gap-2 text-xs text-muted-foreground"
								>
									<Wrench className="h-3 w-3 animate-spin" />
									<span className="font-mono">{tc.toolName}</span>
								</div>
							))}
					</div>
				)}

			{/* Error Display */}
			{error && (
				<div className="flex items-center gap-2 p-2 mx-2 mb-2 bg-destructive/10 text-destructive rounded-md text-sm">
					<AlertCircle className="h-4 w-4 flex-shrink-0" />
					<span className="line-clamp-2">{error}</span>
				</div>
			)}

			{/* Attachment Preview Bar */}
			{pendingAttachments.length > 0 && (
				<div className="flex gap-2 p-2 border-t overflow-x-auto">
					{pendingAttachments.map((att) => (
						<AttachmentPreview
							key={att.id}
							attachment={att}
							onRemove={() => removeAttachment(att.id)}
						/>
					))}
				</div>
			)}

			{/* Input Area with Drop Zone */}
			<div
				{...dragProps}
				className={cn(
					"p-2 border-t transition-colors",
					isDragOver && "ring-2 ring-primary ring-inset bg-primary/5"
				)}
			>
				<div className="flex gap-2">
					<Textarea
						ref={inputRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							isDragOver
								? "Drop media here..."
								: `Ask ${providerLabel} about your media...`
						}
						className="min-h-[60px] max-h-[120px] resize-none"
						disabled={isStreaming}
						aria-label="Chat message input"
					/>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={
							isStreaming ||
							(!inputValue.trim() && pendingAttachments.length === 0)
						}
						aria-label="Send message"
						className="self-end"
					>
						{isStreaming ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground mt-1">
					Drag media from the panel or type a message. Press Enter to send.
				</p>
			</div>
		</div>
	);
}

// ============================================================================
// Sub-components
// ============================================================================

function ProviderToggleButton({
	active,
	onClick,
	disabled,
	children,
}: {
	active: boolean;
	onClick: () => void;
	disabled: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"px-2.5 py-1 transition-colors first:rounded-l-[calc(var(--radius)-1px)] last:rounded-r-[calc(var(--radius)-1px)]",
				active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
				disabled && "opacity-50 cursor-not-allowed"
			)}
		>
			{children}
		</button>
	);
}
