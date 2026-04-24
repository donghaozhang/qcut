"use client";

import { useState, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon, ExternalLinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ApiKeyStatusSource, KeySource } from "@qcut/platform-core";
import {
	PRECEDENCE_BADGE_LABELS,
	PRECEDENCE_ONE_LINERS,
} from "./api-key-precedence";
import { PropertyGroup } from "./property-item";

interface ApiKeyFieldProps {
	label: ReactNode;
	description: ReactNode;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	testId?: string;
	shadowedBy?: readonly KeySource[];
	activeSource?: KeySource;
	/** Optional test button */
	onTest?: () => void;
	isTesting?: boolean;
	testResult?: { success: boolean; message: string } | null;
	/** If set, renders a "Get Key" button that opens this URL in a new tab. */
	getKeyUrl?: string;
}

/**
 * Only the editable app tier is warned here; lower-priority shadows are already
 * inactive by design and do not make the user's saved app value ineffective.
 */
export function ApiKeyField({
	label,
	description,
	placeholder,
	value,
	onChange,
	testId,
	shadowedBy = [],
	activeSource,
	onTest,
	isTesting,
	testResult,
	getKeyUrl,
}: ApiKeyFieldProps) {
	const [showKey, setShowKey] = useState(false);
	const shouldShowShadowWarning =
		activeSource === "environment" &&
		shadowedBy.includes("electron") &&
		value.trim() !== "";
	const shouldShowFallbackChip =
		shadowedBy.includes("electron") &&
		activeSource !== "electron" &&
		value.trim() !== "";

	return (
		<PropertyGroup
			title={
				<span className="flex items-center gap-2">
					{label}
					{shouldShowFallbackChip && (
						<span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
							Fallback value
						</span>
					)}
				</span>
			}
		>
			<div className="flex flex-col gap-2">
				<div className="text-xs text-muted-foreground">{description}</div>
				{shouldShowShadowWarning && (
					<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
						<span aria-hidden="true">⚠ </span>
						Saved locally, but the active key comes from{" "}
						<strong>{activeSource}</strong>. This value will be used only if the{" "}
						{activeSource} source is removed.
					</div>
				)}
				<div className="flex gap-2">
					<div className="flex-1 relative">
						<Input
							type={showKey ? "text" : "password"}
							placeholder={placeholder}
							value={value}
							onChange={(e) => onChange(e.target.value)}
							className="bg-panel-accent pr-10"
							data-testid={testId}
						/>
						<Button
							type="button"
							variant="text"
							size="sm"
							className="absolute right-0 top-0 h-full px-3"
							onClick={() => setShowKey(!showKey)}
							aria-label={showKey ? "Hide API key" : "Show API key"}
						>
							{showKey ? (
								<EyeOffIcon className="h-4 w-4" aria-hidden="true" />
							) : (
								<EyeIcon className="h-4 w-4" aria-hidden="true" />
							)}
						</Button>
					</div>
					{getKeyUrl && (
						<Button
							asChild
							type="button"
							variant="outline"
							size="sm"
							className="gap-1"
						>
							<a href={getKeyUrl} target="_blank" rel="noopener noreferrer">
								<ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
								Get Key
							</a>
						</Button>
					)}
					{onTest && (
						<Button
							type="button"
							onClick={onTest}
							disabled={!value || isTesting}
							variant="outline"
							size="sm"
						>
							{isTesting ? "Testing..." : "Test"}
						</Button>
					)}
				</div>
				{testResult && (
					<div
						className={`text-xs ${testResult.success ? "text-green-600" : "text-red-600"}`}
					>
						{testResult.message}
					</div>
				)}
			</div>
		</PropertyGroup>
	);
}

/** Small badge showing the active source tier (env / app / file / web). */
export function KeySourceBadge({ source }: { source: ApiKeyStatusSource }) {
	if (source === "not-set") return null;

	const label =
		source === "localStorage" ? "web" : PRECEDENCE_BADGE_LABELS[source];
	const tooltipText =
		source === "localStorage" ? undefined : PRECEDENCE_ONE_LINERS[source];
	const badge = (
		<span
			aria-label={tooltipText ?? label}
			className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
			title={tooltipText}
		>
			{label}
		</span>
	);

	if (!tooltipText) {
		return badge;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{badge}</TooltipTrigger>
			<TooltipContent side="top" className="max-w-64">
				{tooltipText}
			</TooltipContent>
		</Tooltip>
	);
}
