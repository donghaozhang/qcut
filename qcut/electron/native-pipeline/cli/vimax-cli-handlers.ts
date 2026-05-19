/**
 * ViMax CLI Subcommand Handlers — barrel re-export.
 * Split into vimax-cli-handlers/ directory for maintainability.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers
 */

export {
	handleVimaxExtractCharacters,
	handleVimaxGeneratePortraits,
} from "./vimax-cli-handlers/character-handlers.js";

export { handleVimaxExtractScenes } from "./vimax-cli-handlers/scene-handlers.js";

export {
	handleVimaxGenerateScript,
	handleVimaxGenerateStoryboard,
} from "./vimax-cli-handlers/script-handlers.js";

export {
	handleVimaxCreateRegistry,
	handleVimaxShowRegistry,
} from "./vimax-cli-handlers/registry-handlers.js";

export {
	handleVimaxIdea2Video,
	handleVimaxScript2Video,
	handleVimaxNovel2Movie,
} from "./vimax-cli-handlers/pipeline-handlers.js";

export { handleVimaxListModels } from "./vimax-cli-handlers/model-handlers.js";

export { handleVimaxNovel2Script } from "./vimax-cli-handlers/novel-script-handler.js";

export { handleVimaxNovel2Video } from "./vimax-cli-handlers/video-handler.js";

export { handleLintScripts as handleVimaxLintScripts } from "./vimax-cli-handlers/script-lint-handler.js";
