"use client";

import { platform } from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Camera, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/** Button that captures a screenshot of the QCut window and saves it as PNG. */
export function ScreenshotControl({ variant }: { variant?: "menu-item" } = {}) {
	const [isBusy, setIsBusy] = useState(false);

	const handleCapture = useCallback(async (): Promise<void> => {
		if (isBusy) return;

		const api = platform().screenshot;
		if (!api) {
			toast.error("Screenshot not available");
			return;
		}

		setIsBusy(true);
		try {
			const result = await api.capture();
			toast("Screenshot saved", {
				description: result.filePath,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Screenshot failed";
			toast.error("Screenshot failed", { description: message });
		} finally {
			setIsBusy(false);
		}
	}, [isBusy]);

	if (variant === "menu-item") {
		return (
			<DropdownMenuItem
				className="flex items-center gap-1.5"
				disabled={isBusy}
				onClick={() => {
					handleCapture().catch(() => {});
				}}
			>
				{isBusy ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Camera className="h-4 w-4" />
				)}
				Screenshot
			</DropdownMenuItem>
		);
	}

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="h-7 text-xs"
			onClick={() => {
				handleCapture().catch(() => {});
			}}
			disabled={isBusy}
			title="Take screenshot (Ctrl/Cmd + Shift + S)"
			aria-label="Take screenshot"
			data-testid="screenshot-button"
		>
			{isBusy ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<Camera className="h-4 w-4" />
			)}
		</Button>
	);
}
