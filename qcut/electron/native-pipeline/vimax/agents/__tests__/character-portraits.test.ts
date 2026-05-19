import { describe, expect, it } from "vitest";
import type { AgentResult } from "../base-agent.js";
import { CharacterPortraitsGenerator } from "../character-portraits.js";
import type {
	CharacterInNovel,
	CharacterPortrait,
} from "../../types/character.js";

function character({ name }: { name: string }): CharacterInNovel {
	return {
		name,
		description: `${name} description`,
		appearance: `${name} appearance`,
		role: "supporting",
		relationships: [],
	};
}

function wait({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CharacterPortraitsGenerator", () => {
	it("generates character portraits concurrently up to the configured limit", async () => {
		const generator = new CharacterPortraitsGenerator({ concurrency: 2 });
		const delays: Record<string, number> = { Alice: 60, Bob: 20, Cleo: 10 };
		let active = 0;
		let maxActive = 0;

		generator.process = async (
			input: CharacterInNovel
		): Promise<AgentResult<CharacterPortrait>> => {
			active++;
			maxActive = Math.max(maxActive, active);
			await wait({ ms: delays[input.name] ?? 1 });
			active--;
			return {
				success: true,
				result: {
					character_name: input.name,
					description: "",
					front_view: `/tmp/${input.name}.png`,
				},
				metadata: { cost: 1 },
			};
		};

		const result = await generator.generateBatch([
			character({ name: "Alice" }),
			character({ name: "Bob" }),
			character({ name: "Cleo" }),
		]);

		expect(result.success).toBe(true);
		expect(maxActive).toBe(2);
		expect(result.metadata.concurrency).toBe(2);
		expect(Object.keys(result.result ?? {})).toEqual(["Alice", "Bob", "Cleo"]);
		expect(result.metadata.cost).toBe(3);
	});

	it("defaults portrait generation concurrency to three characters", async () => {
		const generator = new CharacterPortraitsGenerator();
		let active = 0;
		let maxActive = 0;

		generator.process = async (
			input: CharacterInNovel
		): Promise<AgentResult<CharacterPortrait>> => {
			active++;
			maxActive = Math.max(maxActive, active);
			await wait({ ms: 20 });
			active--;
			return {
				success: true,
				result: {
					character_name: input.name,
					description: "",
					front_view: `/tmp/${input.name}.png`,
				},
				metadata: { cost: 1 },
			};
		};

		await generator.generateBatch([
			character({ name: "Alice" }),
			character({ name: "Bob" }),
			character({ name: "Cleo" }),
			character({ name: "Dax" }),
		]);

		expect(maxActive).toBe(3);
	});
});
