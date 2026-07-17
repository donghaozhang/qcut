import {
	getSessionToken,
	LICENSE_SERVER_URL,
} from "@/lib/ai-video/core/license-relay";
import type { SoundEffect } from "@/types/sounds";

/**
 * Best-effort usage reporting for catalog tracks so the "popular" sort can be
 * backed by real data (see the audio CDN release script's --downloads-url).
 * Only QCut catalog tracks (negative IDs) are counted; failures and signed-out
 * sessions are silently ignored and never affect the timeline insertion.
 */
export function reportAudioTrackDownload({
	sound,
	kind,
}: {
	sound: SoundEffect;
	kind: "music" | "sound-effect";
}): void {
	if (sound.source !== "qcut" || sound.id >= 0) return;
	void (async () => {
		try {
			const sessionToken = await getSessionToken();
			if (!sessionToken) return;
			await fetch(`${LICENSE_SERVER_URL}/api/audio-metrics/downloads`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ trackKey: `${kind}:${sound.id}` }),
			});
		} catch {
			// Metrics must never surface errors to the editing flow.
		}
	})();
}
