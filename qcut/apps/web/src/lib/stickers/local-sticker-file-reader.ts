import { platform } from "@qcut/platform-core";

export type LocalStickerFileReader = ({
	filePath,
}: {
	filePath: string;
}) => Promise<Uint8Array | null>;

export async function readLocalStickerFile({
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
