"use client";

import { platform } from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import { Camera, ChevronDown, Loader2, Monitor } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface ScreenshotDisplay {
	id: number;
	label: string;
	width: number;
	height: number;
	isPrimary: boolean;
	isCurrent: boolean;
}

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

	const [displays, setDisplays] = useState<ScreenshotDisplay[]>([]);

	const handleFullScreenCapture = useCallback(
		async (displayId?: number): Promise<void> => {
			if (isBusy) return;

			const capture = platform().screenshot?.captureFullScreenToClipboard;
			if (!capture) {
				toast.error(t("editor.header.screenshotFailed"));
				return;
			}

			setIsBusy(true);
			try {
				await capture(displayId === undefined ? undefined : { displayId });
				toast(t("editor.header.screenshotCopied"));
			} catch (error) {
				toast.error(t("editor.header.screenshotFailed"), {
					description: error instanceof Error ? error.message : undefined,
				});
			} finally {
				setIsBusy(false);
			}
		},
		[isBusy, t]
	);

	const refreshDisplays = useCallback(async (): Promise<void> => {
		try {
			const list = await platform().screenshot?.listDisplays?.();
			setDisplays(list ?? []);
		} catch {
			setDisplays([]);
		}
	}, []);

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
		<div className="flex items-center">
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 rounded-r-none text-xs"
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
			<DropdownMenu
				onOpenChange={(open) => {
					if (open) refreshDisplays().catch(() => {});
				}}
			>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 rounded-l-none border-l-0 px-1"
						disabled={isBusy}
						aria-label={t("editor.header.screenshotDisplayMenu")}
						title={t("editor.header.screenshotDisplayMenu")}
						data-testid="screenshot-display-menu"
					>
						<ChevronDown className="h-3 w-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-56">
					<DropdownMenuLabel className="text-xs">
						{t("editor.header.screenshotDisplayMenu")}
					</DropdownMenuLabel>
					{displays.map((display) => (
						<DropdownMenuItem
							key={display.id}
							className="flex items-center gap-1.5 text-xs"
							disabled={isBusy}
							onClick={() => {
								handleFullScreenCapture(display.id).catch(() => {});
							}}
							data-testid={`screenshot-display-${display.id}`}
						>
							<Monitor className="h-3.5 w-3.5" />
							<span className="min-w-0 flex-1 truncate">
								{display.label}
								{display.isCurrent
									? ` · ${t("editor.header.screenshotCurrentDisplay")}`
									: ""}
							</span>
							<span className="text-muted-foreground">
								{display.width}×{display.height}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
