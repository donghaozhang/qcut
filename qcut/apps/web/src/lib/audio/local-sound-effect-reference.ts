import type { SoundEffect } from "@/types/sounds";
import {
	readLocalSoundEffectsFile,
	type LocalSoundEffectsFileReader,
} from "./local-sound-effects-file-reader";
import type {
	LocalSoundEffectReference,
	LocalSoundEffectsCategory,
} from "./local-sound-effects-manifest";

export async function loadLocalSoundEffectFile({
	reference,
	readFile = readLocalSoundEffectsFile,
}: {
	reference: LocalSoundEffectReference;
	readFile?: LocalSoundEffectsFileReader;
}): Promise<File> {
	const bytes = await readFile({ filePath: reference.filePath });
	if (!bytes?.byteLength) {
		throw new Error(`Unable to read local sound effect: ${reference.filePath}`);
	}
	if (bytes.byteLength !== reference.byteSize) {
		throw new Error(`Local sound effect size mismatch: ${reference.filePath}`);
	}
	const ownedBytes = new Uint8Array(bytes.byteLength);
	ownedBytes.set(bytes);
	return new File([ownedBytes.buffer], reference.fileName, {
		type: reference.mimeType,
	});
}

export function localSoundEffectReferenceToSound({
	categories,
	previewUrl,
	reference,
}: {
	categories: readonly LocalSoundEffectsCategory[];
	previewUrl: string;
	reference: LocalSoundEffectReference;
}): SoundEffect {
	const labelsById = new Map(
		categories.map((category) => [category.id, category.label])
	);
	const categoryLabels = reference.categoryIds
		.map((categoryId) => labelsById.get(categoryId))
		.filter((label): label is string => Boolean(label));
	return {
		id: reference.numericId,
		name: reference.title,
		localizedName: reference.title,
		description: `Jianying internal reference · ${categoryLabels.join(" / ")}`,
		localizedDescription: `剪映内部参照 · ${categoryLabels.join(" / ")}`,
		url: previewUrl,
		previewUrl,
		duration: reference.duration,
		filesize: reference.byteSize,
		type: reference.mimeType,
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: "Jianying reference",
		tags: ["sound-effect", "internal-reference", ...categoryLabels],
		license: "Third-party reference - redistribution prohibited",
		created: "2026-08-01T00:00:00.000Z",
		downloads: 0,
		rating: 0,
		ratingCount: 0,
		source: "local-reference",
		kind: "sound-effect",
		checksumSha256: reference.contentSha256,
	};
}
