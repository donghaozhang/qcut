"use client";

import { platform } from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import { Camera, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Screenshot controls.
 *
 * The toolbar button (default variant, mounted next to the record button)
 * captures the full screen and copies it to the clipboard. The menu-item
 * variant keeps the original behavior of saving a window capture as PNG.
 *
 * While a capture is in progress the control is disabled and shows a busy
 * indicator.
 *
 * @param variant - When set to `"menu-item"`, renders as a dropdown menu item; otherwise renders as a toolbar button.
 */
export function ScreenshotControl({ variant }: { variant?: "menu-item" } = {}) {
	const { t } = useTranslation();
	const [isBusy, setIsBusy] = useState(false);

	const handleWindowCapture = useCallback(async (): Promise<void> => {
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

	const handleFullScreenCapture = useCallback(async (): Promise<void> => {
		if (isBusy) return;

		const capture = platform().screenshot?.captureFullScreenToClipboard;
		if (!capture) {
			toast.error(t("editor.header.screenshotFailed"));
			return;
		}

		setIsBusy(true);
		try {
			await capture();
			toast(t("editor.header.screenshotCopied"));
		} catch (error) {
			toast.error(t("editor.header.screenshotFailed"), {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsBusy(false);
		}
	}, [isBusy, t]);

	if (variant === "menu-item") {
		return (
			<DropdownMenuItem
				className="flex items-center gap-1.5"
				disabled={isBusy}
				onClick={() => {
					handleWindowCapture().catch(() => {});
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
				handleFullScreenCapture().catch(() => {});
			}}
			disabled={isBusy}
			title={t("editor.header.screenshotHint")}
			aria-label={t("editor.header.screenshot")}
			data-testid="screenshot-button"
		>
			{isBusy ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<Camera className="h-4 w-4" />
			)}
			<span className="text-sm">{t("editor.header.screenshot")}</span>
		</Button>
	);
}
