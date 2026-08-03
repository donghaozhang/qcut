import type { EditorApiClient } from "./editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import {
	getTransitionLabRecipe,
	TRANSITION_LAB_RECIPES,
	type TransitionLabRecipe,
} from "../transitions/transition-lab-catalog.js";

function publicRecipe({ recipe }: { recipe: TransitionLabRecipe }) {
	return {
		id: recipe.id,
		name: recipe.name,
		localizedName: recipe.localizedName,
		description: recipe.description,
		defaultDuration: recipe.defaultDuration,
		clip: recipe.clip,
		shader: {
			origin: recipe.shader.origin,
			license: recipe.shader.license,
			binaryAssets: recipe.shader.binaryAssets,
		},
	};
}

async function resolveProjectId({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<string | undefined> {
	if (options.projectId) return options.projectId;
	const navigator = await client.get<{ activeProjectId?: string | null }>(
		"/api/claude/navigator/projects"
	);
	return navigator.activeProjectId ?? undefined;
}

function resolveDuration({
	value,
	fallback,
}: {
	value?: string;
	fallback: number;
}): number | null {
	if (value === undefined) return fallback;
	const duration = Number(value);
	return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export async function handleTransitionLabCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	if (action === "list") {
		return {
			success: true,
			data: {
				count: TRANSITION_LAB_RECIPES.length,
				recipes: TRANSITION_LAB_RECIPES.map((recipe) =>
					publicRecipe({ recipe })
				),
			},
		};
	}

	if (action !== "apply") {
		return {
			success: false,
			error: `Unknown Transition Lab action: ${action ?? ""}. Available: list, apply`,
		};
	}

	if (!options.preset) {
		return { success: false, error: "Missing --preset" };
	}
	const recipe = getTransitionLabRecipe({ presetId: options.preset });
	if (!recipe) {
		return {
			success: false,
			error: `Unknown Transition Lab preset: ${options.preset}. Run "qcut editor transition-lab list --json" to list recipes.`,
		};
	}
	if (!options.trackId) {
		return { success: false, error: "Missing --track-id" };
	}
	if (!options.fromElementId) {
		return { success: false, error: "Missing --from-element-id" };
	}
	if (!options.toElementId) {
		return { success: false, error: "Missing --to-element-id" };
	}
	const duration = resolveDuration({
		value: options.duration,
		fallback: recipe.defaultDuration,
	});
	if (duration === null) {
		return { success: false, error: "--duration must be a positive number" };
	}
	const projectId = await resolveProjectId({ client, options });
	if (!projectId) {
		return { success: false, error: "No active project; pass --project-id" };
	}

	const data = await client.post(
		`/api/claude/timeline/${encodeURIComponent(projectId)}/tracks/${encodeURIComponent(options.trackId)}/transitions`,
		{
			fromElementId: options.fromElementId,
			toElementId: options.toElementId,
			presetId: recipe.id,
			type: recipe.clip.type,
			direction: recipe.clip.direction,
			easing: recipe.clip.easing,
			tuning: recipe.clip.tuning,
			duration,
		}
	);
	return {
		success: true,
		data: {
			projectId,
			trackId: options.trackId,
			recipe: publicRecipe({ recipe }),
			result: data,
		},
	};
}
