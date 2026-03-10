import { platform } from "@qcut/platform-core";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Runs an FFmpeg/FFprobe health check on mount and shows a warning toast when either binary is unhealthy.
 *
 * Mount at the app root so the check runs once; if a failed binary is detected the component displays a 30s warning
 * toast with diagnostic lines (failed binaries, resolved paths, and any reported errors). The component renders nothing.
 *
 * @returns Null (no DOM output)
 */
export function FFmpegHealthNotification() {
	useEffect(() => {
		const checkHealth = platform().ffmpeg?.checkHealth;
		if (!checkHealth) return;

		checkHealth()
			.then((result) => {
				if (result.ffmpegOk && result.ffprobeOk) return;

				const failed: string[] = [];
				if (!result.ffmpegOk) failed.push("FFmpeg");
				if (!result.ffprobeOk) failed.push("FFprobe");

				const lines: string[] = [
					`${failed.join(" and ")} binary not found or not executable.`,
				];

				// Show resolved paths so users/support can diagnose
				if (result.ffmpegPath) {
					lines.push(`FFmpeg path: ${result.ffmpegPath}`);
				}
				if (result.ffprobePath) {
					lines.push(`FFprobe path: ${result.ffprobePath}`);
				}

				// Show specific errors from the health check
				if (result.errors && result.errors.length > 0) {
					for (const err of result.errors) {
						lines.push(`Error: ${err}`);
					}
				}

				toast.warning("Video export may not work", {
					description: lines.join("\n"),
					duration: 30_000,
				});
			})
			.catch(() => {
				// Silently ignore — health check IPC not available
			});
	}, []);

	return null;
}
