import { platform } from "@qcut/platform-core";

export interface LocalStickerReference {
	id: string;
	displayName: string;
	fileName: string;
	filePath: string;
	mimeType: "image/png";
	frameCount: number;
	frameRate: number;
	cycleDuration: number;
}

type LocalReferenceReader = ({
	filePath,
}: {
	filePath: string;
}) => Promise<Uint8Array | null>;

const HAND_DRAWN_CURVED_ARROW = {
	id: "hand-drawn-curved-arrow",
	displayName: "手绘弯箭头",
	fileName: "hand-drawn-curved-arrow.png",
	mimeType: "image/png",
	frameCount: 4,
	frameRate: 5,
	cycleDuration: 0.8,
} as const;

export function buildLocalStickerReferences({
	filePath,
	isEnabled,
}: {
	filePath: string | undefined;
	isEnabled: boolean;
}): LocalStickerReference[] {
	const normalizedPath = filePath?.trim();
	if (!isEnabled || !normalizedPath) return [];

	return [
		{
			...HAND_DRAWN_CURVED_ARROW,
			filePath: normalizedPath,
		},
	];
}

export function getLocalStickerReferences(): LocalStickerReference[] {
	return buildLocalStickerReferences({
		filePath: import.meta.env.VITE_QCUT_LOCAL_STICKER_REFERENCE_PATH,
		isEnabled: import.meta.env.VITE_QCUT_ENABLE_LOCAL_STICKER_LAB === "true",
	});
}

async function readLocalReferenceFile({
	filePath,
}: {
	filePath: string;
}): Promise<Uint8Array | null> {
	if (!platform().isElectron) {
		throw new Error("Local sticker references require the QCut desktop app");
	}
	const buffer = await platform().files.readFile(filePath);
	return buffer ? new Uint8Array(buffer) : null;
}

export async function loadLocalStickerReferenceFile({
	reference,
	readFile = readLocalReferenceFile,
}: {
	reference: LocalStickerReference;
	readFile?: LocalReferenceReader;
}): Promise<File> {
	const bytes = await readFile({ filePath: reference.filePath });
	if (!bytes?.byteLength) {
		throw new Error(`Unable to read local sticker: ${reference.filePath}`);
	}

	const ownedBytes = new Uint8Array(bytes.byteLength);
	ownedBytes.set(bytes);
	const blob = new Blob([ownedBytes.buffer], { type: reference.mimeType });
	return new File([blob], reference.fileName, { type: reference.mimeType });
}
