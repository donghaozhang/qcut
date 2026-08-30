import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	materializeSoundEffectsLabAsset,
	type ResolvedSoundEffectsLabAsset,
} from "../native-pipeline/sounds/sound-effects-lab-client.js";

let directory = "";
let sourcePath = "";
const AUDIO_BYTES = Buffer.from("qcut-sound-effect-fixture-bytes");

function asset(
	overrides: Partial<ResolvedSoundEffectsLabAsset> = {}
): ResolvedSoundEffectsLabAsset {
	return {
		id: "sound-effects-lab:whoosh",
		title: "Whoosh",
		labels: [],
		provider: "freesound",
		redistribution: "allowed",
		reusable: true,
		localPath: sourcePath,
		byteSize: AUDIO_BYTES.byteLength,
		checksumSha256: createHash("sha256").update(AUDIO_BYTES).digest("hex"),
		...overrides,
	} as ResolvedSoundEffectsLabAsset;
}

beforeAll(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-sfx-materialize-"));
	sourcePath = path.join(directory, "source.mp3");
	fs.writeFileSync(sourcePath, AUDIO_BYTES);
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("materializeSoundEffectsLabAsset integrity", () => {
	it("copies a verified local asset to the destination", async () => {
		const destinationPath = path.join(directory, "out", "whoosh.mp3");
		await expect(
			materializeSoundEffectsLabAsset({ asset: asset(), destinationPath })
		).resolves.toBe(destinationPath);
		expect(fs.readFileSync(destinationPath)).toEqual(AUDIO_BYTES);
	});

	it("refuses a local asset whose sha256 does not match", async () => {
		const destinationPath = path.join(directory, "out", "corrupt.mp3");
		await expect(
			materializeSoundEffectsLabAsset({
				asset: asset({ checksumSha256: "0".repeat(64) }),
				destinationPath,
			})
		).rejects.toThrow(/checksum mismatch/);
		expect(fs.existsSync(destinationPath)).toBe(false);
	});

	it("refuses a local asset whose byte size does not match", async () => {
		const destinationPath = path.join(directory, "out", "resized.mp3");
		await expect(
			materializeSoundEffectsLabAsset({
				asset: asset({ byteSize: AUDIO_BYTES.byteLength + 1 }),
				destinationPath,
			})
		).rejects.toThrow(/size mismatch/);
		expect(fs.existsSync(destinationPath)).toBe(false);
	});

	it("refuses reference-only assets outright", async () => {
		const destinationPath = path.join(directory, "out", "restricted.mp3");
		await expect(
			materializeSoundEffectsLabAsset({
				asset: asset({
					provider: "jianying-reference",
					redistribution: "prohibited",
					reusable: false,
				}),
				destinationPath,
			})
		).rejects.toThrow(/reference-only/);
		expect(fs.existsSync(destinationPath)).toBe(false);
	});
});
