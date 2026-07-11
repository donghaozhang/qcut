import { useEffect, useState } from "react";
import { encodeAudioBufferAsWav } from "./audio-buffer-wav";
import { reverseAudioBuffer } from "./audio-buffer-transform";

interface ReversedAudioCacheEntry {
	promise: Promise<string>;
	url?: string;
	references: number;
}

const reversedAudioCache = new Map<string, ReversedAudioCacheEntry>();

async function reverseAudioSource({
	source,
}: {
	source: string;
}): Promise<string> {
	const response = await fetch(source);
	if (!response.ok)
		throw new Error(`Unable to read audio (${response.status})`);
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(await response.arrayBuffer());
		const reversed = reverseAudioBuffer({ context, buffer: decoded });
		return URL.createObjectURL(
			new Blob([encodeAudioBufferAsWav({ buffer: reversed })], {
				type: "audio/wav",
			})
		);
	} finally {
		await context.close();
	}
}

function acquireReversedAudio({ source }: { source: string }): Promise<string> {
	const cached = reversedAudioCache.get(source);
	if (cached) {
		cached.references += 1;
		return cached.promise;
	}
	const entry: ReversedAudioCacheEntry = {
		references: 1,
		promise: reverseAudioSource({ source }),
	};
	entry.promise = entry.promise
		.then((url) => {
			entry.url = url;
			if (entry.references <= 0) URL.revokeObjectURL(url);
			return url;
		})
		.catch((error) => {
			reversedAudioCache.delete(source);
			throw error;
		});
	reversedAudioCache.set(source, entry);
	return entry.promise;
}

function releaseReversedAudio({ source }: { source: string }) {
	const cached = reversedAudioCache.get(source);
	if (!cached) return;
	cached.references -= 1;
	if (cached.references > 0) return;
	if (cached.url) URL.revokeObjectURL(cached.url);
	reversedAudioCache.delete(source);
}

export function useReversedAudioUrl({
	source,
	enabled,
}: {
	source: string;
	enabled: boolean;
}): { url?: string; loading: boolean; error?: string } {
	const [state, setState] = useState<{
		url?: string;
		loading: boolean;
		error?: string;
	}>({ loading: enabled });
	useEffect(() => {
		if (!enabled) {
			setState({ loading: false });
			return;
		}
		let cancelled = false;
		setState({ loading: true });
		void acquireReversedAudio({ source })
			.then((url) => {
				if (!cancelled) setState({ url, loading: false });
			})
			.catch((error) => {
				if (cancelled) return;
				setState({
					loading: false,
					error:
						error instanceof Error ? error.message : "Reverse preview failed",
				});
			});
		return () => {
			cancelled = true;
			releaseReversedAudio({ source });
		};
	}, [enabled, source]);
	return state;
}
