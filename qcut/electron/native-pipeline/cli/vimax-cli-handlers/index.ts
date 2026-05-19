/**
 * ViMax CLI Subcommand Handlers
 *
 * Implements the 10 individual agent subcommands:
 * extract-characters, generate-script, generate-storyboard,
 * generate-portraits, create-registry, show-registry, list-models,
 * idea2video, script2video, novel2movie
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers
 */

export {
	handleVimaxExtractCharacters,
	handleVimaxGeneratePortraits,
} from "./character-handlers.js";

export { handleVimaxExtractScenes } from "./scene-handlers.js";

export { handleVimaxNovel2Script } from "./novel-script-handler.js";

export {
	handleVimaxGenerateScript,
	handleVimaxGenerateStoryboard,
} from "./script-handlers.js";

export {
	handleVimaxCreateRegistry,
	handleVimaxShowRegistry,
} from "./registry-handlers.js";

export {
	handleVimaxIdea2Video,
	handleVimaxScript2Video,
	handleVimaxNovel2Movie,
} from "./pipeline-handlers.js";

export { handleVimaxListModels } from "./model-handlers.js";
