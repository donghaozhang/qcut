import { basename, join } from "node:path";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDir, slugify } from "./utils";
import { generateFalImage, generateFalImageAsset, getDefaultFalModel, hasFalCredentials } from "./providers/fal";
import type { Character, Scene, ShotRenderManifest } from "./types";

interface CharacterReferenceRecord {
	characterId: string;
	filePath: string;
	sourceUrl: string;
	model: string;
	prompt: string;
}

type CharacterReferenceManifest = Record<string, CharacterReferenceRecord>;

export function discoverPromptFiles({
	shotDir,
	selectedShots,
}: {
	shotDir: string;
	selectedShots?: number[];
}): string[] {
	const promptsDir = join(shotDir, "prompts");
	if (!existsSync(promptsDir)) {
		throw new Error(`Prompts directory not found: ${promptsDir}`);
	}
	const allowed = selectedShots && selectedShots.length > 0 ? new Set(selectedShots) : null;
	const promptFiles = readdirSync(promptsDir)
		.filter((filename) => filename.endsWith(".md"))
		.map((filename) => join(promptsDir, filename))
		.filter((path) => {
			if (!allowed) return true;
			const match = basename(path).match(/^(\d+)-/i);
			return match ? allowed.has(Number(match[1])) : false;
		})
		.sort();
	if (promptFiles.length === 0) {
		throw new Error(`No prompt files found in: ${promptsDir}`);
	}
	return promptFiles;
}

export function imageOutputPath({
	shotDir,
	promptFile,
}: {
	shotDir: string;
	promptFile: string;
}): string {
	return join(shotDir, `${basename(promptFile, ".md")}.png`);
}

function sceneIndexFromPromptFile({ promptFile }: { promptFile: string }): number | null {
	const match = basename(promptFile).match(/^(\d+)-/u);
	return match ? Number(match[1]) : null;
}

function loadShotRenderManifest({ shotDir }: { shotDir: string }): ShotRenderManifest | null {
	const manifestPath = join(shotDir, "shots.json");
	if (!existsSync(manifestPath)) {
		return null;
	}

	const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<ShotRenderManifest>;
	if (!parsed) {
		return null;
	}

	const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
	if (scenes.length === 0) {
		return null;
	}

	return {
		title: parsed.title ?? basename(shotDir),
		style: parsed.style ?? "cinematic",
		language: parsed.language ?? "en",
		medium: parsed.medium ?? "live-action",
		format: parsed.format ?? "film",
		productionRules: Array.isArray(parsed.productionRules) ? parsed.productionRules : [],
		genreRules: Array.isArray(parsed.genreRules) ? parsed.genreRules : [],
		characters: Array.isArray(parsed.characters) ? parsed.characters : [],
		continuityNotes: Array.isArray(parsed.continuityNotes) ? parsed.continuityNotes : [],
		scenes: scenes as Scene[],
	};
}

function characterReferenceDir({ shotDir }: { shotDir: string }): string {
	return join(shotDir, "characters");
}

function characterReferenceManifestPath({ shotDir }: { shotDir: string }): string {
	return join(characterReferenceDir({ shotDir }), "manifest.json");
}

function loadCharacterReferenceManifest({ shotDir }: { shotDir: string }): CharacterReferenceManifest {
	const manifestPath = characterReferenceManifestPath({ shotDir });
	if (!existsSync(manifestPath)) {
		return {};
	}
	return JSON.parse(readFileSync(manifestPath, "utf8")) as CharacterReferenceManifest;
}

function saveCharacterReferenceManifest({
	shotDir,
	manifest,
}: {
	shotDir: string;
	manifest: CharacterReferenceManifest;
}): void {
	ensureDir({ path: characterReferenceDir({ shotDir }) });
	writeFileSync(characterReferenceManifestPath({ shotDir }), `${JSON.stringify(manifest, null, 2)}\n`);
}

function reusableCharacterIds({ scenes }: { scenes: Scene[] }): string[] {
	const counts = new Map<string, number>();
	for (const scene of scenes) {
		for (const characterId of scene.characterIds) {
			counts.set(characterId, (counts.get(characterId) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([characterId]) => characterId)
		.sort();
}

function characterById({
	manifest,
	characterId,
}: {
	manifest: ShotRenderManifest;
	characterId: string;
}): Character | null {
	return manifest.characters.find((c) => c.id === characterId) ?? null;
}

function buildCharacterReferencePrompt({
	manifest,
	character,
}: {
	manifest: ShotRenderManifest;
	character: Character;
}): string {
	const direction = [
		`Create a clean single-character reference image for ${character.id}.`,
		character.description,
		"Center the same face, body type, wardrobe family, and silhouette that should recur in later shots.",
		"Use a neutral environment with controlled full-body or three-quarter framing so identity is easy to reuse.",
		"Avoid scene-specific action, props that are not core to the character, text, logos, or collage layouts.",
		...manifest.productionRules,
		...manifest.genreRules,
		...manifest.continuityNotes,
	];
	return direction.join(" ");
}

async function ensureCharacterReferences({
	shotDir,
	manifest,
	model,
	dryRun,
}: {
	shotDir: string;
	manifest: ShotRenderManifest;
	model: string;
	dryRun: boolean;
}): Promise<CharacterReferenceManifest> {
	const referenceIds = reusableCharacterIds({ scenes: manifest.scenes });
	if (referenceIds.length === 0) {
		return {};
	}

	const savedManifest = loadCharacterReferenceManifest({ shotDir });
	if (dryRun) {
		return savedManifest;
	}

	ensureDir({ path: characterReferenceDir({ shotDir }) });
	for (const characterId of referenceIds) {
		const existing = savedManifest[characterId];
		if (existing && existsSync(existing.filePath) && existing.sourceUrl) {
			continue;
		}

		const character = characterById({ manifest, characterId });
		if (!character) {
			continue;
		}
		const prompt = buildCharacterReferencePrompt({ manifest, character });

		const result = await generateFalImageAsset({
			prompt,
			model,
			aspectRatio: "3:4",
		});
		const filePath = join(
			characterReferenceDir({ shotDir }),
			`${slugify({ value: character.id.replace(/-\d+$/u, "") || character.id })}.png`,
		);
		await Bun.write(filePath, result.bytes);
		savedManifest[characterId] = {
			characterId,
			filePath,
			sourceUrl: result.url,
			model: result.model,
			prompt,
		};
		saveCharacterReferenceManifest({ shotDir, manifest: savedManifest });
	}

	return savedManifest;
}

function sceneForPromptFile({
	manifest,
	promptFile,
}: {
	manifest: ShotRenderManifest | null;
	promptFile: string;
}): Scene | null {
	if (!manifest) {
		return null;
	}
	const index = sceneIndexFromPromptFile({ promptFile });
	if (!index) {
		return null;
	}
	return manifest.scenes.find((scene) => scene.index === index) ?? null;
}

function referenceUrlsForScene({
	scene,
	characterReferences,
}: {
	scene: Scene | null;
	characterReferences: CharacterReferenceManifest;
}): string[] {
	if (!scene) {
		return [];
	}
	return scene.characterIds
		.map((characterId) => characterReferences[characterId]?.sourceUrl)
		.filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl));
}

function buildScenePrompt({
	scene,
	manifest,
}: {
	scene: Scene;
	manifest: ShotRenderManifest;
}): string {
	const parts: string[] = [];

	parts.push(
		`${scene.camera.framing}, ${scene.camera.lens} lens, ${scene.camera.movement}, ${scene.camera.angle}.`,
	);

	parts.push(scene.lighting);

	parts.push(`Setting: ${scene.location}.`);

	const activeCharacters = manifest.characters.filter((c) =>
		scene.characterIds.includes(c.id),
	);
	if (activeCharacters.length > 0) {
		parts.push(activeCharacters.map((c) => c.description).join(" "));
	}

	parts.push(scene.action);

	parts.push(`Mood: ${scene.mood}.`);
	parts.push(`Color palette: ${scene.colorPalette}.`);

	if (scene.props.length > 0) {
		parts.push(`Key props: ${scene.props.join(", ")}.`);
	}

	if (scene.negative) {
		parts.push(`Avoid: ${scene.negative}.`);
	}

	return parts.join(" ");
}

export async function runImageGeneration({
	shotDir,
	promptFiles,
	provider,
	model,
	dryRun,
}: {
	shotDir: string;
	promptFiles: string[];
	provider?: string;
	model?: string;
	dryRun: boolean;
}): Promise<{ generated: string[]; skipped: string | null }> {
	const resolvedProvider = provider?.trim() || "fal";
	if (resolvedProvider !== "fal") {
		return {
			generated: [],
			skipped: `qcut-shot local rendering currently supports only the fal provider. Received: ${resolvedProvider}`,
		};
	}
	if (!hasFalCredentials()) {
		return {
			generated: [],
			skipped: "No FAL_KEY or FAL_API_KEY found. Generated analysis and prompts only.",
		};
	}

	const resolvedModel = model?.trim() || getDefaultFalModel();
	const shotManifest = loadShotRenderManifest({ shotDir });
	const characterReferences = shotManifest
		? await ensureCharacterReferences({
				shotDir,
				manifest: shotManifest,
				model: resolvedModel,
				dryRun,
			})
		: {};

	const generated: string[] = [];
	for (const promptFile of promptFiles) {
		const outputPath = imageOutputPath({ shotDir, promptFile });
		if (dryRun) {
			generated.push(outputPath);
			continue;
		}
		const scene = sceneForPromptFile({ manifest: shotManifest, promptFile });
		const prompt =
			scene && shotManifest
				? buildScenePrompt({ scene, manifest: shotManifest })
				: readFileSync(promptFile, "utf8");
		const bytes = await generateFalImage({
			prompt,
			model: resolvedModel,
			aspectRatio: "16:9",
			referenceImageUrls: referenceUrlsForScene({
				scene,
				characterReferences,
			}),
		});
		await Bun.write(outputPath, bytes);
		generated.push(outputPath);
	}

	return { generated, skipped: null };
}
