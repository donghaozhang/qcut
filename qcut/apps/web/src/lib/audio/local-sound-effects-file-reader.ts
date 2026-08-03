import { platform } from "@qcut/platform-core";

export type LocalSoundEffectsFileReader = ({
	filePath,
}: {
	filePath: string;
}) => Promise<Uint8Array | null>;

export async function readLocalSoundEffectsFile({
	filePath,
}: {
	filePath: string;
}): Promise<Uint8Array | null> {
	if (!platform().isElectron) {
		throw new Error("Sound Effects Lab requires the QCut desktop app");
	}
	const buffer = await platform().files.readFile(filePath);
	return buffer ? new Uint8Array(buffer) : null;
}
