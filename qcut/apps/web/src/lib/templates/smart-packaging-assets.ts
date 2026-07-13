import { createObjectURL } from "@/lib/media/blob-manager";
import { type MediaItem, useMediaStore } from "@/stores/media/media-store";

export type SmartPackagingAssetKey = "spark-burst" | "accent-pop";

export interface SmartPackagingAssetIds {
	stickerMediaId: string;
	soundMediaId: string;
}

const SMART_PACKAGING_ASSET_IDS: Record<SmartPackagingAssetKey, string> = {
	"spark-burst": "smart-pack-spark-burst-v1",
	"accent-pop": "smart-pack-accent-pop-v1",
};

export function buildSparkBurstSvg(): string {
	const rays = Array.from({ length: 12 }, (_, index) => {
		const angle = index * 30;
		return `<line x1="256" y1="106" x2="256" y2="32" transform="rotate(${angle} 256 256)" />`;
	}).join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
	<g fill="none" stroke-linecap="round">
		<g stroke="#FFCF2F" stroke-width="22">${rays}
			<animateTransform attributeName="transform" type="rotate" from="-8 256 256" to="8 256 256" dur="0.7s" repeatCount="indefinite" additive="sum" />
			<animate attributeName="opacity" values="0.35;1;0.35" dur="0.7s" repeatCount="indefinite" />
		</g>
		<circle cx="256" cy="256" r="92" stroke="#21D4E8" stroke-width="18">
			<animate attributeName="r" values="72;112;72" dur="0.7s" repeatCount="indefinite" />
			<animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" />
		</circle>
		<circle cx="256" cy="256" r="34" fill="#FF4F79" stroke="#FFFFFF" stroke-width="12">
			<animate attributeName="r" values="28;42;28" dur="0.7s" repeatCount="indefinite" />
		</circle>
	</g>
</svg>`;
}

function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}): void {
	for (let index = 0; index < value.length; index++) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

export function buildAccentPopWav({
	duration = 0.24,
	sampleRate = 44_100,
}: {
	duration?: number;
	sampleRate?: number;
} = {}): ArrayBuffer {
	const sampleCount = Math.max(1, Math.round(duration * sampleRate));
	const bytesPerSample = 2;
	const dataLength = sampleCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataLength);
	const view = new DataView(buffer);

	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataLength, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * bytesPerSample, true);
	view.setUint16(32, bytesPerSample, true);
	view.setUint16(34, 16, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataLength, true);

	for (let index = 0; index < sampleCount; index++) {
		const progress = index / sampleCount;
		const time = index / sampleRate;
		const frequency = 760 - 420 * progress;
		const envelope = (1 - progress) ** 3.5;
		const fundamental = Math.sin(2 * Math.PI * frequency * time);
		const harmonic = Math.sin(2 * Math.PI * frequency * 1.8 * time) * 0.32;
		const click = index < sampleRate * 0.012 ? (1 - progress) * 0.22 : 0;
		const sample = Math.max(
			-1,
			Math.min(1, (fundamental + harmonic) * envelope * 0.72 + click)
		);
		view.setInt16(44 + index * bytesPerSample, sample * 0x7fff, true);
	}

	return buffer;
}

function findSmartPackagingAsset({
	mediaItems,
	assetKey,
}: {
	mediaItems: readonly MediaItem[];
	assetKey: SmartPackagingAssetKey;
}): MediaItem | undefined {
	const stableId = SMART_PACKAGING_ASSET_IDS[assetKey];
	return mediaItems.find(
		(item) =>
			item.id === stableId || item.metadata?.smartPackagingAsset === assetKey
	);
}

async function ensureSparkBurstAsset({
	projectId,
}: {
	projectId: string;
}): Promise<string> {
	const mediaStore = useMediaStore.getState();
	const existing = findSmartPackagingAsset({
		mediaItems: mediaStore.mediaItems,
		assetKey: "spark-burst",
	});
	if (existing) return existing.id;

	const svg = buildSparkBurstSvg();
	const file = new File([svg], "smart-pack-spark-burst.svg", {
		type: "image/svg+xml;charset=utf-8",
	});
	const url = createObjectURL(file, "smart-packaging:spark-burst");
	return mediaStore.addMediaItem(projectId, {
		id: SMART_PACKAGING_ASSET_IDS["spark-burst"],
		name: "Smart Spark Burst",
		type: "image",
		file,
		url,
		thumbnailUrl: url,
		width: 512,
		height: 512,
		duration: 1.4,
		metadata: {
			source: "smart-packaging",
			smartPackagingAsset: "spark-burst",
		},
	});
}

async function ensureAccentPopAsset({
	projectId,
}: {
	projectId: string;
}): Promise<string> {
	const mediaStore = useMediaStore.getState();
	const existing = findSmartPackagingAsset({
		mediaItems: mediaStore.mediaItems,
		assetKey: "accent-pop",
	});
	if (existing) return existing.id;

	const wav = buildAccentPopWav();
	const file = new File([wav], "smart-pack-accent-pop.wav", {
		type: "audio/wav",
	});
	const url = createObjectURL(file, "smart-packaging:accent-pop");
	return mediaStore.addMediaItem(projectId, {
		id: SMART_PACKAGING_ASSET_IDS["accent-pop"],
		name: "Smart Accent Pop",
		type: "audio",
		file,
		url,
		duration: 0.24,
		metadata: {
			source: "smart-packaging",
			smartPackagingAsset: "accent-pop",
		},
	});
}

export async function ensureSmartPackagingAssets({
	projectId,
}: {
	projectId: string;
}): Promise<SmartPackagingAssetIds> {
	const [stickerMediaId, soundMediaId] = await Promise.all([
		ensureSparkBurstAsset({ projectId }),
		ensureAccentPopAsset({ projectId }),
	]);
	return { stickerMediaId, soundMediaId };
}
