import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CAPCUT_GUI_CASE_IDS } from "../capcut-e2e/gui-regression-contract.js";

export const VERIFIED_STICKER_ASSET_CONTENT = "verified sticker observation";

async function createStickerProof({
	rootDirectory,
}: {
	rootDirectory: string;
}) {
	const path = join(rootDirectory, "final-draft-assets", "icon.png");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, VERIFIED_STICKER_ASSET_CONTENT, "utf8");
	const fileStats = await stat(path, { bigint: true });
	return {
		bytes: Buffer.byteLength(VERIFIED_STICKER_ASSET_CONTENT),
		device: fileStats.dev.toString(),
		inode: fileStats.ino.toString(),
		path,
		relativePath: "Resources/icon.png",
		sha256: createHash("sha256")
			.update(VERIFIED_STICKER_ASSET_CONTENT, "utf8")
			.digest("hex"),
	};
}

export async function buildFixtureFinalDraftVerifications({
	rootDirectory,
	verifiedVisuals,
}: {
	rootDirectory: string;
	verifiedVisuals: boolean;
}) {
	const stickerProof = verifiedVisuals
		? await createStickerProof({ rootDirectory })
		: null;
	return CAPCUT_GUI_CASE_IDS.map((caseId) => ({
		caseId,
		contentFiles: [],
		immutableAssetFiles:
			caseId === "native-text-sticker" && stickerProof ? [stickerProof] : [],
		phase: "final" as const,
		semanticEvidence:
			caseId === "native-text-sticker"
				? { caseId, sticker: { materialName: "icon.png" } }
				: { caseId },
		status: "semantic-and-immutable-assets-verified" as const,
	}));
}
