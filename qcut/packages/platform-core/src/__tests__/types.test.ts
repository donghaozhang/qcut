import { describe, it, expect } from "vitest";
import { PlatformCapability } from "../types/base.js";
import type { PlatformAPI } from "../types/platform.js";
import type {
	PlatformSoundsAPI,
	PlatformAudioAPI,
	PlatformVideoAPI,
	PlatformScreenshotAPI,
	PlatformFalAPI,
	PlatformGeminiChatAPI,
	PlatformPtyAPI,
	PlatformSkillsAPI,
	PlatformAIPipelineAPI,
	PlatformMediaImportAPI,
	PlatformProjectFolderAPI,
	PlatformYouTubeAPI,
	PlatformRemotionFolderAPI,
	PlatformMoyinAPI,
	PlatformUpdatesAPI,
	PlatformGitHubAPI,
	PlatformMcpAPI,
	PlatformProjectJsonAPI,
} from "../index.js";
import type { PlatformClaudeAPI } from "../types/claude-api.js";

describe("PlatformAPI type completeness", () => {
	it("PlatformCapability has all expected values", () => {
		const caps = Object.values(PlatformCapability);
		expect(caps).toContain("filesystem");
		expect(caps).toContain("storage");
		expect(caps).toContain("theme");
		expect(caps).toContain("sounds");
		expect(caps).toContain("audio-temp");
		expect(caps).toContain("video-temp");
		expect(caps).toContain("screenshot");
		expect(caps).toContain("screen-recording");
		expect(caps).toContain("transcription");
		expect(caps).toContain("ffmpeg");
		expect(caps).toContain("api-keys");
		expect(caps).toContain("shell");
		expect(caps).toContain("github");
		expect(caps).toContain("fal-upload");
		expect(caps).toContain("gemini-chat");
		expect(caps).toContain("license");
		expect(caps).toContain("pty");
		expect(caps).toContain("mcp");
		expect(caps).toContain("skills");
		expect(caps).toContain("ai-pipeline");
		expect(caps).toContain("media-import");
		expect(caps).toContain("project-folder");
		expect(caps).toContain("project-json");
		expect(caps).toContain("claude");
		expect(caps).toContain("remotion-folder");
		expect(caps).toContain("moyin");
		expect(caps).toContain("updates");
		expect(caps).toContain("youtube");
		expect(caps).toContain("filler-analysis");
		expect(caps).toContain("file-path-resolution");
		expect(caps.length).toBe(30);
	});

	it("PlatformAPI has all expected namespace properties", () => {
		// Compile-time check: this function typechecks that PlatformAPI
		// has all the expected properties. If any are missing, TS errors.
		const namespaceKeys: Array<keyof PlatformAPI> = [
			"platform",
			"isElectron",
			"hasCapability",
			"getPathForFile",
			"analyzeFillers",
			"files",
			"storage",
			"theme",
			"shell",
			"apiKeys",
			"license",
			"sounds",
			"audio",
			"video",
			"screenshot",
			"screenRecording",
			"ffmpeg",
			"transcription",
			"fal",
			"geminiChat",
			"github",
			"youtube",
			"pty",
			"mcp",
			"skills",
			"aiPipeline",
			"mediaImport",
			"projectFolder",
			"projectJson",
			"remotionFolder",
			"moyin",
			"updates",
			"claude",
		];
		expect(namespaceKeys.length).toBe(33);
	});

	it("all new namespace types are importable", () => {
		// Compile-time verification that these types exist
		const typeCheck: {
			sounds?: PlatformSoundsAPI;
			audio?: PlatformAudioAPI;
			video?: PlatformVideoAPI;
			screenshot?: PlatformScreenshotAPI;
			fal?: PlatformFalAPI;
			geminiChat?: PlatformGeminiChatAPI;
			github?: PlatformGitHubAPI;
			youtube?: PlatformYouTubeAPI;
			pty?: PlatformPtyAPI;
			mcp?: PlatformMcpAPI;
			skills?: PlatformSkillsAPI;
			aiPipeline?: PlatformAIPipelineAPI;
			mediaImport?: PlatformMediaImportAPI;
			projectFolder?: PlatformProjectFolderAPI;
			projectJson?: PlatformProjectJsonAPI;
			remotionFolder?: PlatformRemotionFolderAPI;
			moyin?: PlatformMoyinAPI;
			updates?: PlatformUpdatesAPI;
			claude?: PlatformClaudeAPI;
		} = {};
		expect(typeCheck).toBeDefined();
	});
});
