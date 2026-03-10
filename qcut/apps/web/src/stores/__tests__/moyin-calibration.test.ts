import { beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import type {
	ScriptCharacter,
	ScriptData,
	ScriptScene,
} from "@/types/moyin-script";
import {
	enhanceCharactersLLM,
	enhanceScenesLLM,
} from "@/stores/moyin/moyin-calibration";

const parseFullScriptMock = vi.fn();
const calibrateCharactersMock = vi.fn();
const convertToScriptCharactersMock = vi.fn();
const calibrateScenesMock = vi.fn();
const convertToScriptScenesMock = vi.fn();
const callLLMMock = vi.fn();

vi.mock("@/lib/moyin/script/episode-parser", () => ({
	parseFullScript: parseFullScriptMock,
}));

vi.mock("@/lib/moyin/script/character-calibrator", () => ({
	calibrateCharacters: calibrateCharactersMock,
	convertToScriptCharacters: convertToScriptCharactersMock,
}));

vi.mock("@/lib/moyin/script/scene-calibrator", () => ({
	calibrateScenes: calibrateScenesMock,
	convertToScriptScenes: convertToScriptScenesMock,
}));

function getScriptData(): ScriptData {
	return {
		title: "Test Project",
		genre: "Drama",
		logline: "A test story",
		language: "zh",
		targetDuration: "60s",
		characters: [],
		scenes: [],
		episodes: [],
		storyParagraphs: [],
	};
}

describe("moyin-calibration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFullScriptMock.mockReturnValue({
			background: {
				title: "Test Project",
				outline: "Outline",
				characterBios: "Bios",
				era: "现代",
				genre: "Drama",
			},
			episodes: [],
		});

		(window as unknown as { electronAPI?: unknown }).electronAPI = {
			moyin: {
				callLLM: callLLMMock,
			},
		};
		initPlatform(createDesktopAdapter());
	});

	it("uses character calibrator pipeline when raw script contains episode scripts", async () => {
		const characters: ScriptCharacter[] = [{ id: "c1", name: "Alice" }];
		const scriptData = getScriptData();

		parseFullScriptMock.mockReturnValue({
			background: {
				title: "Test Project",
				outline: "Outline",
				characterBios: "Bios",
				era: "现代",
				genre: "Drama",
			},
			episodes: [
				{
					episodeIndex: 1,
					title: "Episode 1",
					rawContent: "第1集",
					scenes: [],
					shotGenerationStatus: "idle",
				},
			],
		});

		const calibratedCharacters = [
			{
				id: "char_1",
				name: "Alice",
				importance: "protagonist",
				appearanceCount: 3,
				nameVariants: ["Alice"],
				role: "Lead",
				visualPromptEn: "cinematic portrait",
			},
		];
		calibrateCharactersMock.mockResolvedValue({
			characters: calibratedCharacters,
			filteredWords: [],
			mergeRecords: [],
			analysisNotes: "",
		});

		const convertedCharacters: ScriptCharacter[] = [
			{
				id: "char_1",
				name: "Alice",
				role: "Lead",
				visualPromptEn: "cinematic portrait",
			},
		];
		convertToScriptCharactersMock.mockReturnValue(convertedCharacters);

		const result = await enhanceCharactersLLM(
			characters,
			scriptData,
			"《Test Project》\n第1集"
		);

		expect(parseFullScriptMock).toHaveBeenCalledWith("《Test Project》\n第1集");
		expect(calibrateCharactersMock).toHaveBeenCalledTimes(1);
		expect(convertToScriptCharactersMock).toHaveBeenCalledWith(
			calibratedCharacters,
			characters
		);
		expect(callLLMMock).not.toHaveBeenCalled();
		expect(result).toEqual(convertedCharacters);
	});

	it("uses scene calibrator pipeline when raw script contains episode scripts", async () => {
		const scenes: ScriptScene[] = [
			{
				id: "s1",
				location: "Apartment",
				time: "Night",
				atmosphere: "Tense",
			},
		];
		const scriptData = getScriptData();

		parseFullScriptMock.mockReturnValue({
			background: {
				title: "Test Project",
				outline: "Outline",
				characterBios: "Bios",
				era: "现代",
				genre: "Drama",
			},
			episodes: [
				{
					episodeIndex: 1,
					title: "Episode 1",
					rawContent: "第1集",
					scenes: [],
					shotGenerationStatus: "idle",
				},
			],
		});

		const calibratedScenes = [
			{
				id: "s1",
				name: "Apartment",
				location: "Apartment",
				time: "Night",
				atmosphere: "Tense",
				importance: "main",
				episodeNumbers: [1],
				appearanceCount: 1,
				nameVariants: ["Apartment"],
				architectureStyle: "Modern",
			},
		];
		calibrateScenesMock.mockResolvedValue({
			scenes: calibratedScenes,
			mergeRecords: [],
			analysisNotes: "",
		});

		const convertedScenes: ScriptScene[] = [
			{
				id: "s1",
				name: "Apartment",
				location: "Apartment",
				time: "Night",
				atmosphere: "Tense",
				architectureStyle: "Modern",
			},
		];
		convertToScriptScenesMock.mockReturnValue(convertedScenes);

		const result = await enhanceScenesLLM(
			scenes,
			scriptData,
			"《Test Project》\n第1集"
		);

		expect(calibrateScenesMock).toHaveBeenCalledTimes(1);
		expect(convertToScriptScenesMock).toHaveBeenCalledWith(
			calibratedScenes,
			scenes
		);
		expect(callLLMMock).not.toHaveBeenCalled();
		expect(result).toEqual(convertedScenes);
	});

	it("falls back to legacy LLM enhancement when no episode scripts are available", async () => {
		const scenes: ScriptScene[] = [
			{
				id: "s1",
				location: "Apartment",
				time: "Night",
				atmosphere: "Tense",
			},
		];
		const scriptData = getScriptData();

		parseFullScriptMock.mockReturnValue({
			background: {
				title: "Test Project",
				outline: "",
				characterBios: "",
				era: "现代",
			},
			episodes: [],
		});

		callLLMMock.mockResolvedValue({
			success: true,
			text: JSON.stringify([
				{
					id: "s1",
					visualPrompt: "Rainy apartment interior",
					visualPromptEn: "Rainy apartment interior, cinematic lighting",
					lightingDesign: "Low-key practical lamp",
					keyProps: "desk lamp, notebook",
				},
			]),
		});

		const result = await enhanceScenesLLM(scenes, scriptData, "raw script");

		expect(calibrateScenesMock).not.toHaveBeenCalled();
		expect(callLLMMock).toHaveBeenCalledTimes(1);
		expect(result[0].visualPrompt).toBe("Rainy apartment interior");
		expect(result[0].lightingDesign).toBe("Low-key practical lamp");
		expect(result[0].keyProps).toEqual(["desk lamp", "notebook"]);
	});
});
