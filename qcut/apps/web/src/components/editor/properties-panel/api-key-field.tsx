"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PropertyGroup } from "./property-item";

interface ApiKeyFieldProps {
	label: React.ReactNode;
	description: React.ReactNode;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	testId?: string;
	/** Optional test button */
	onTest?: () => void;
	isTesting?: boolean;
	testResult?: { success: boolean; message: string } | null;
}

export function ApiKeyField({
	label,
	description,
	placeholder,
	value,
	onChange,
	testId,
	onTest,
	isTesting,
	testResult,
}: ApiKeyFieldProps) {
	const [showKey, setShowKey] = useState(false);

	return (
		<PropertyGroup title={label}>
			<div className="flex flex-col gap-2">
				<div className="text-xs text-muted-foreground">{description}</div>
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

/** Small badge showing the source of an API key (env, app, cli). */
export function KeySourceBadge({ source }: { source: string }) {
	if (source === "not-set") return null;
	const labels: Record<string, string> = {
		environment: "env",
		electron: "app",
		"aicp-cli": "cli",
	};
	return (
		<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
			{labels[source] || source}
		</span>
	);
}
