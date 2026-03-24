/**
 * Storyboard Artist Agent
 *
 * Generates visual storyboard images from scripts or shot descriptions.
 * Supports character reference images for visual consistency across shots.
 *
 * Ported from: vimax/agents/storyboard_artist.py
 */

import * as path from "path";
import * as fs from "fs";
import {
	BaseAgent,
	type AgentConfig,
	type AgentResult,
	createAgentConfig,
	agentOk,
	agentFail,
} from "./base-agent.js";
import type { Script } from "./screenwriter.js";
import {
	ReferenceImageSelector,
	type ReferenceSelectorConfig,
} from "./reference-selector.js";
import { ImageGeneratorAdapter } from "../adapters/image-adapter.js";
import type { ImageOutput } from "../types/output.js";
import type { Storyboard, Scene, ShotDescription } from "../types/shot.js";
import { CharacterPortraitRegistry } from "../types/character.js";

/** Validate that a reference image path is safe (no traversal or absolute paths). */
function isSafeReferencePath(refPath: string): boolean {
	return !path.isAbsolute(refPath) && !refPath.split(path.sep).includes("..");
}

function safeSlug(value: string): string {
	const safe = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_|_$/g, "");
	return safe || "untitled";
}

export interface StoryboardResult extends Storyboard {
	images: ImageOutput[];
	total_cost: number;
}

export interface StoryboardArtistConfig extends AgentConfig {
	image_model: string;
	style_prefix: string;
	aspect_ratio: string;
	output_dir: string;
	use_character_references: boolean;
	reference_model: string;
	reference_strength: number;
}

export function createStoryboardArtistConfig(
	partial?: Partial<StoryboardArtistConfig>
): StoryboardArtistConfig {
	return {
		...createAgentConfig({ name: "StoryboardArtist" }),
		image_model: "nano_banana_pro",
		style_prefix: "photorealistic, cinematic lighting, film still, ",
		aspect_ratio: "16:9",
		output_dir: "media/generated/vimax/storyboard",
		use_character_references: true,
		reference_model: "nano_banana_pro",
		reference_strength: 0.6,
		...partial,
	};
}

/** Shot type hints for prompt building. */
const SHOT_TYPE_HINTS: Record<string, string> = {
	wide: "wide establishing shot, full scene visible",
	medium: "medium shot, subject framed from waist up",
	close_up: "close-up shot, face and expression detail",
	extreme_close_up: "extreme close-up, detail shot",
};

export class StoryboardArtist extends BaseAgent<Script, StoryboardResult> {
	declare config: StoryboardArtistConfig;
	private _imageAdapter: ImageGeneratorAdapter | null = null;
	private _portraitRegistry: CharacterPortraitRegistry | null;
	private _referenceSelector: ReferenceImageSelector | null = null;

	constructor(
		config?: Partial<StoryboardArtistConfig>,
		portraitRegistry?: CharacterPortraitRegistry
	) {
		super(createStoryboardArtistConfig(config));
		this._portraitRegistry = portraitRegistry ?? null;
	}

	private async _ensureAdapter(): Promise<void> {
		if (!this._imageAdapter) {
			this._imageAdapter = new ImageGeneratorAdapter({
				model: this.config.image_model,
				output_dir: this.config.output_dir,
				reference_model: this.config.reference_model,
				reference_strength: this.config.reference_strength,
			});
			await this._imageAdapter.initialize();
		}
	}

	private async _ensureReferenceSelector(): Promise<void> {
		if (!this._referenceSelector) {
			this._referenceSelector = new ReferenceImageSelector();
			await this._referenceSelector.initialize();
		}
	}

	/** Build image generation prompt from shot description. */
	private _buildPrompt(
		shot: ShotDescription,
		scene: Scene,
		registry?: CharacterPortraitRegistry | null
	): string {
		const parts: string[] = [this.config.style_prefix];

		if (scene.location) parts.push(`Location: ${scene.location}.`);
		if (scene.time) parts.push(`Time: ${scene.time}.`);

		parts.push(shot.description);

		const shotTypeValue =
			typeof shot.shot_type === "string" ? shot.shot_type : shot.shot_type;
		if (shotTypeValue in SHOT_TYPE_HINTS) {
			parts.push(SHOT_TYPE_HINTS[shotTypeValue]);
		}

		// Add character appearance + reference instructions
		if (shot.character_references) {
			for (const name of Object.keys(shot.character_references)) {
				let desc = "";
				if (registry) {
					const portrait = registry.getPortrait(name);
					if (portrait?.description) desc = portrait.description;
				}
				if (desc) parts.push(`${name}: ${desc}.`);
				if (shot.primary_reference_image) {
					parts.push(`Use the input image for ${name}.`);
				}
			}
		}

		return parts.join(" ");
	}

	/** Pre-populate character_references on all shots from the portrait registry. */
	async resolveReferences(
		script: Script,
		registry: CharacterPortraitRegistry
	): Promise<number> {
		await this._ensureReferenceSelector();

		let resolvedCount = 0;
		for (const scene of script.scenes) {
			for (const shot of scene.shots) {
				if (!shot.characters || shot.characters.length === 0) continue;

				const refResult = await this._referenceSelector!.selectForShot(
					shot,
					registry
				);
				if (
					refResult.selected_references &&
					Object.keys(refResult.selected_references).length > 0
				) {
					shot.character_references = refResult.selected_references;
				}
				if (
					refResult.primary_reference &&
					isSafeReferencePath(refResult.primary_reference)
				) {
					shot.primary_reference_image = refResult.primary_reference;
				}
				if (
					Object.keys(refResult.selected_references).length > 0 ||
					refResult.primary_reference
				) {
					resolvedCount++;
				}
			}
		}
		return resolvedCount;
	}

	async process(
		script: Script,
		portraitRegistry?: CharacterPortraitRegistry,
		chapterIndex?: number
	): Promise<AgentResult<StoryboardResult>> {
		await this._ensureAdapter();

		const registry = portraitRegistry ?? this._portraitRegistry;
		const hasRegistry = registry != null && registry.portraits.size > 0;

		const hasInlineRefs = script.scenes.some((scene) =>
			scene.shots.some((shot) => shot.primary_reference_image)
		);

		const useRefs =
			this.config.use_character_references && (hasRegistry || hasInlineRefs);

		if (useRefs && hasRegistry && !hasInlineRefs) {
			const resolved = await this.resolveReferences(script, registry!);
			console.log(
				`[storyboard] Generating for: ${script.title} (resolved refs for ${resolved} shots)`
			);
		} else {
			console.log(
				`[storyboard] Generating for: ${script.title} (${useRefs ? "with refs" : "no refs"})`
			);
		}

		try {
			const images: ImageOutput[] = [];
			let totalCost = 0;

			const dirName =
				chapterIndex != null
					? `chapter_${String(chapterIndex).padStart(3, "0")}_${safeSlug(script.title)}`
					: safeSlug(script.title);
			const outputDir = path.join(this.config.output_dir, dirName);
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			let shotIndex = 0;
			for (let sceneIdx = 0; sceneIdx < script.scenes.length; sceneIdx++) {
				const scene = script.scenes[sceneIdx];

				for (const shot of scene.shots) {
					shotIndex++;
					const prompt = this._buildPrompt(shot, scene, registry);

					const shotTypeStr = safeSlug(
						typeof shot.shot_type === "string" ? shot.shot_type : shot.shot_type
					);
					const sceneSlug = safeSlug(scene.title).slice(0, 30);
					const outputPath = path.join(
						outputDir,
						`scene_${String(sceneIdx + 1).padStart(3, "0")}_${shotTypeStr}_${sceneSlug}.png`
					);

					let referenceImage = useRefs
						? shot.primary_reference_image
						: undefined;
					if (referenceImage && !isSafeReferencePath(referenceImage)) {
						console.warn(
							`[storyboard] Skipping unsafe reference path: ${referenceImage}`
						);
						referenceImage = undefined;
					}

					let result: ImageOutput;
					if (referenceImage) {
						result = await this._imageAdapter!.generateWithReference(
							prompt,
							referenceImage,
							{
								model: this.config.reference_model,
								reference_strength: this.config.reference_strength,
								aspect_ratio: this.config.aspect_ratio,
								output_path: outputPath,
							}
						);
					} else {
						result = await this._imageAdapter!.generate(prompt, {
							aspect_ratio: this.config.aspect_ratio,
							output_path: outputPath,
						});
					}

					images.push(result);
					totalCost += result.cost;
				}
			}

			const storyboard: StoryboardResult = {
				title: script.title,
				description: script.logline,
				scenes: script.scenes,
				images,
				total_cost: totalCost,
			};

			console.log(
				`[storyboard] Generated: ${images.length} images, $${totalCost.toFixed(3)} cost`
			);

			return agentOk(storyboard, {
				image_count: images.length,
				cost: totalCost,
				used_references: useRefs,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[storyboard] Failed: ${msg}`);
			return agentFail(msg);
		}
	}

	/** Generate storyboard with explicit portrait registry. */
	async processWithReferences(
		script: Script,
		portraitRegistry: CharacterPortraitRegistry
	): Promise<AgentResult<StoryboardResult>> {
		if (!portraitRegistry || portraitRegistry.portraits.size === 0) {
			console.warn(
				"[storyboard] processWithReferences called but registry is empty"
			);
		}
		return this.process(script, portraitRegistry);
	}

	/** Generate images directly from shot descriptions. */
	async generateFromShots(
		shots: ShotDescription[],
		title = "Storyboard",
		portraitRegistry?: CharacterPortraitRegistry
	): Promise<ImageOutput[]> {
		await this._ensureAdapter();

		const registry = portraitRegistry ?? this._portraitRegistry;
		const hasRegistry = registry != null && registry.portraits.size > 0;
		const hasInlineRefs = shots.some((s) => s.primary_reference_image);
		const useRefs =
			this.config.use_character_references && (hasRegistry || hasInlineRefs);

		// Pre-populate references
		if (useRefs && hasRegistry && !hasInlineRefs) {
			await this._ensureReferenceSelector();
			for (const shot of shots) {
				if (!shot.characters || shot.characters.length === 0) continue;
				const refResult = await this._referenceSelector!.selectForShot(
					shot,
					registry!
				);
				if (Object.keys(refResult.selected_references).length > 0) {
					shot.character_references = refResult.selected_references;
				}
				if (
					refResult.primary_reference &&
					isSafeReferencePath(refResult.primary_reference)
				) {
					shot.primary_reference_image = refResult.primary_reference;
				}
			}
		}

		const images: ImageOutput[] = [];
		const outputDir = path.join(this.config.output_dir, safeSlug(title));
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		for (let i = 0; i < shots.length; i++) {
			const shot = shots[i];
			let prompt = `${this.config.style_prefix} ${shot.description}`;

			if (shot.character_references) {
				for (const name of Object.keys(shot.character_references)) {
					let desc = "";
					if (registry) {
						const portrait = registry.getPortrait(name);
						if (portrait?.description) desc = portrait.description;
					}
					if (desc) prompt += ` ${name}: ${desc}.`;
					if (useRefs && shot.primary_reference_image) {
						prompt += ` Use the input image for ${name}.`;
					}
				}
			}

			const outputPath = path.join(
				outputDir,
				`shot_${String(i + 1).padStart(3, "0")}.png`
			);

			let referenceImage = useRefs ? shot.primary_reference_image : undefined;
			if (referenceImage && !isSafeReferencePath(referenceImage)) {
				referenceImage = undefined;
			}

			let result: ImageOutput;
			if (referenceImage) {
				result = await this._imageAdapter!.generateWithReference(
					prompt,
					referenceImage,
					{
						model: this.config.reference_model,
						reference_strength: this.config.reference_strength,
						aspect_ratio: this.config.aspect_ratio,
						output_path: outputPath,
					}
				);
			} else {
				result = await this._imageAdapter!.generate(prompt, {
					aspect_ratio: this.config.aspect_ratio,
					output_path: outputPath,
				});
			}

			images.push(result);
		}

		return images;
	}

	/** Set the portrait registry for reference image selection. */
	setPortraitRegistry(registry: CharacterPortraitRegistry): void {
		this._portraitRegistry = registry;
	}
}
