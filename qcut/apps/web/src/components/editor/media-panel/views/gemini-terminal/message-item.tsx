"use client";

import { cn } from "@/lib/utils";
import { User, Bot, ChevronRight, Wrench, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { AttachmentPreview } from "./attachment-preview";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ChatMessage, ToolCallInfo } from "@/stores/gemini-terminal-store";

interface MessageItemProps {
	message: ChatMessage;
	isStreaming?: boolean;
	providerLabel?: string;
}

export function MessageItem({
	message,
	isStreaming,
	providerLabel = "Gemini",
}: MessageItemProps) {
	return (
		<div
			className={cn(
				"p-3 rounded-lg mb-2",
				message.role === "user" ? "bg-primary/10 ml-8" : "bg-muted mr-8"
			)}
		>
			{/* Role indicator */}
			<div className="flex items-center gap-2 mb-1">
				{message.role === "user" ? (
					<User className="h-4 w-4" aria-hidden="true" />
				) : (
					<Bot className="h-4 w-4" aria-hidden="true" />
				)}
				<span className="text-xs text-muted-foreground">
					{message.role === "user" ? "You" : providerLabel}
				</span>
			</div>

			{/* Attachments if any */}
			{message.attachments && message.attachments.length > 0 && (
				<div className="flex gap-2 mb-2 flex-wrap">
					{message.attachments.map((att) => (
						<AttachmentPreview key={att.id} attachment={att} compact />
					))}
				</div>
			)}

			{/* Tool calls (pi-agent messages only) */}
			{message.toolCalls && message.toolCalls.length > 0 && (
				<div className="space-y-1 mb-2">
					{message.toolCalls.map((tc) => (
						<ToolCallBlock key={tc.toolCallId} toolCall={tc} />
					))}
				</div>
			)}

			{/* Message content with markdown */}
			{message.content && (
				<div className="prose prose-sm dark:prose-invert max-w-none text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-2 [&_code]:text-xs [&_pre]:bg-background/50 [&_pre]:p-2 [&_pre]:rounded">
					<ReactMarkdown rehypePlugins={[rehypeSanitize]}>
						{message.content}
					</ReactMarkdown>
				</div>
			)}

			{/* Streaming indicator */}
			{isStreaming && (
				<span
					className="inline-block w-2 h-4 bg-foreground animate-pulse ml-1"
					aria-label="Generating response..."
				/>
			)}
		</div>
	);
}

// ============================================================================
// Tool Call Block (collapsible)
// ============================================================================

function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
	const isComplete = toolCall.duration !== undefined;
	const hasError = toolCall.isError;

	return (
		<Collapsible>
			<CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left text-xs group hover:bg-background/50 rounded px-1.5 py-1">
				<ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
				<Wrench className="h-3 w-3 text-muted-foreground" />
				<span className="font-mono font-medium">{toolCall.toolName}</span>
				{isComplete && (
					<>
						{hasError ? (
							<X className="h-3 w-3 text-destructive ml-auto" />
						) : (
							<Check className="h-3 w-3 text-green-500 ml-auto" />
						)}
						<span className="text-muted-foreground">
							{formatDuration(toolCall.duration!)}
						</span>
					</>
				)}
				{!isComplete && (
					<span className="text-muted-foreground ml-auto animate-pulse">
						running...
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="ml-5 mt-1 space-y-1.5 text-xs">
					{/* Parameters */}
					<div>
						<span className="text-muted-foreground font-medium">Params:</span>
						<pre className="mt-0.5 bg-background/50 rounded p-1.5 overflow-x-auto font-mono text-[11px] leading-relaxed">
							{JSON.stringify(toolCall.params, null, 2)}
						</pre>
					</div>

					{/* Result */}
					{isComplete && toolCall.result !== undefined && (
						<div>
							<span
								className={cn(
									"font-medium",
									hasError ? "text-destructive" : "text-muted-foreground"
								)}
							>
								{hasError ? "Error:" : "Result:"}
							</span>
							<pre className="mt-0.5 bg-background/50 rounded p-1.5 overflow-x-auto font-mono text-[11px] leading-relaxed max-h-[200px]">
								{formatResult(toolCall.result)}
							</pre>
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatResult(result: unknown): string {
	if (typeof result === "string") return result;
	try {
		return JSON.stringify(result, null, 2);
	} catch {
		return String(result);
	}
}
