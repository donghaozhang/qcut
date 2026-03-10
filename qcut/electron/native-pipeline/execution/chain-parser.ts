/**
 * YAML Pipeline Config Parser
 *
 * Parses YAML pipeline definitions into PipelineChain objects
 * and validates data type flow between steps.
 *
 * @module electron/native-pipeline/chain-parser
 */

import yaml from "js-yaml";
import type { ModelCategory } from "../infra/registry.js";
import { ModelRegistry } from "../infra/registry.js";
import type { PipelineChain, PipelineStep } from "../execution/executor.js";
import {
	getInputDataType,
	getOutputDataType,
	type DataType,
} from "./step-executors.js";

interface YamlStep {
	type: string;
	model: string;
	params?: Record<string, unknown>;
	enabled?: boolean;
	retry_count?: number;
}

interface YamlParallelGroup {
	type: "parallel_group";
	merge_strategy?: string;
	steps: YamlStep[];
}

type YamlStepOrGroup = YamlStep | YamlParallelGroup;

interface YamlPipeline {
	name: string;
	steps: YamlStepOrGroup[];
	config?: {
		output_dir?: string;
		save_intermediates?: boolean;
		input_type?: string;
		parallel?: boolean;
		max_workers?: number;
	};
}

const VALID_CATEGORIES = new Set<string>([
	"text_to_image",
	"image_to_image",
	"text_to_video",
	"image_to_video",
	"video_to_video",
	"avatar",
	"motion_transfer",
	"upscale",
	"upscale_video",
	"add_audio",
	"text_to_speech",
	"speech_to_text",
	"image_understanding",
	"prompt_generation",
	"translate",
]);

export function parseChainConfig(yamlContent: string): PipelineChain {
	let raw: YamlPipeline;
	try {
		raw = yaml.load(yamlContent) as YamlPipeline;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid YAML: ${message}`);
	}

	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid YAML: expected an object");
	}

	if (!raw.name || typeof raw.name !== "string") {
		throw new Error("Pipeline must have a 'name' field");
	}

	if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
		throw new Error("Pipeline must have at least one step");
	}

	const steps: PipelineStep[] = [];
	for (let i = 0; i < raw.steps.length; i++) {
		const s = raw.steps[i];
		if (isParallelGroup(s)) {
			for (const sub of s.steps) {
				if (!sub.type)
					throw new Error(`Step ${i + 1} parallel sub-step: missing 'type'`);
				if (!sub.model)
					throw new Error(`Step ${i + 1} parallel sub-step: missing 'model'`);
				if (!VALID_CATEGORIES.has(sub.type)) {
					throw new Error(
						`Step ${i + 1} parallel sub-step: invalid type '${sub.type}'`
					);
				}
				steps.push({
					type: sub.type as ModelCategory,
					model: sub.model,
					params: {
						...(sub.params ?? {}),
						__parallel_group: i,
						__merge_strategy: s.merge_strategy || "COLLECT_ALL",
					},
					enabled: sub.enabled !== false,
					retryCount: sub.retry_count ?? 0,
				});
			}
		} else {
			if (!s.type) throw new Error(`Step ${i + 1}: missing 'type'`);
			if (!s.model) throw new Error(`Step ${i + 1}: missing 'model'`);
			if (!VALID_CATEGORIES.has(s.type)) {
				throw new Error(`Step ${i + 1}: invalid type '${s.type}'`);
			}
			steps.push({
				type: s.type as ModelCategory,
				model: s.model,
				params: s.params ?? {},
				enabled: s.enabled !== false,
				retryCount: s.retry_count ?? 0,
			});
		}
	}

	return {
		name: raw.name,
		steps,
		config: {
			outputDir: raw.config?.output_dir,
			saveIntermediates: raw.config?.save_intermediates ?? false,
			inputType: raw.config?.input_type as DataType | undefined,
			parallel: raw.config?.parallel,
			maxWorkers: raw.config?.max_workers,
		},
	};
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export function validateChain(chain: PipelineChain): ValidationResult {
	const errors: string[] = [];
	const enabledSteps = chain.steps.filter((s) => s.enabled);

	if (enabledSteps.length === 0) {
		errors.push("Pipeline has no enabled steps");
		return { valid: false, errors };
	}

	for (let i = 0; i < enabledSteps.length; i++) {
		const step = enabledSteps[i];

		if (!ModelRegistry.has(step.model)) {
			errors.push(`Step ${i + 1}: unknown model '${step.model}'`);
			continue;
		}

		const model = ModelRegistry.get(step.model);
		if (!model.categories.includes(step.type)) {
			errors.push(
				`Step ${i + 1}: model '${step.model}' does not support category '${step.type}' (supports: ${model.categories.join(", ")})`
			);
		}
	}

	for (let i = 1; i < enabledSteps.length; i++) {
		const prev = enabledSteps[i - 1];
		const curr = enabledSteps[i];

		const prevOutputType = getOutputDataType(prev.type);
		const currInputType = getInputDataType(curr.type);

		if (prev.type === "prompt_generation") {
			continue;
		}

		if (!isTypeCompatible(prevOutputType, currInputType)) {
			errors.push(
				`Step ${i + 1}: expects '${currInputType}' input but step ${i} outputs '${prevOutputType}'`
			);
		}
	}

	return { valid: errors.length === 0, errors };
}

function isTypeCompatible(outputType: DataType, inputType: DataType): boolean {
	if (outputType === inputType) return true;
	if (inputType === "text") return true;
	return false;
}

function isParallelGroup(s: YamlStepOrGroup): s is YamlParallelGroup {
	return (
		s.type === "parallel_group" && Array.isArray((s as YamlParallelGroup).steps)
	);
}

export function hasParallelGroups(chain: PipelineChain): boolean {
	return chain.steps.some((s) => s.params.__parallel_group !== undefined);
}

export function getDataTypeForCategory(category: ModelCategory): DataType {
	return getOutputDataType(category);
}
