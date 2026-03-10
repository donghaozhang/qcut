/**
 * Novel Import Action — bridges the novel-parser pipeline into the moyin store.
 *
 * Wraps `platform().moyin.callLLM` as an LLMAdapter, runs `parseNovel`,
 * converts the result to ScriptData, and sets the store state.
 */

import type { LLMAdapter } from "@/lib/moyin/script/script-parser";
import { platform } from "@qcut/platform-core";
import { parseNovel } from "@/lib/moyin/script/novel-parser";
import { novelResultToScriptData } from "@/lib/moyin/script/novel-to-script";
import type { MoyinStore } from "./moyin-store";

/** Create an LLMAdapter that delegates to the Electron IPC moyin.callLLM. */
function createElectronLLMAdapter(): LLMAdapter {
	const api = platform().moyin;
	if (!api?.callLLM) {
		throw new Error("Moyin API not available. Please run in Electron.");
	}
	return async (systemPrompt, userPrompt, options) => {
		const result = await api.callLLM({
			systemPrompt,
			userPrompt,
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
		});
		if (typeof result === "string") return result;
		if (result?.text) return result.text;
		throw new Error("Unexpected callLLM response format");
	};
}

/** Run the novel→screenplay pipeline and load results into the moyin store. */
export async function parseNovelImport(
	novelText: string,
	language: "zh" | "en" | "auto",
	get: () => MoyinStore,
	set: (partial: Partial<MoyinStore>) => void
): Promise<void> {
	if (!novelText.trim()) return;

	set({
		parseStatus: "parsing",
		parseError: null,
		pipelineStep: "import",
		pipelineProgress: {
			import: "active",
			title_calibration: "pending",
			synopsis: "pending",
			shot_calibration: "pending",
			character_calibration: "pending",
			scene_calibration: "pending",
		},
	});

	try {
		const callLLM = createElectronLLMAdapter();

		const result = await parseNovel({
			text: novelText,
			language,
			callLLM,
			onProgress: (step, progress) => {
				const stepMap: Record<string, string> = {
					analyze_characters: "import",
					analyze_locations: "import",
					split_clips: "import",
					screenplay_conversion: "import",
				};
				const pipelineStep = stepMap[step] ?? "import";
				const current = get().pipelineProgress;
				set({
					pipelineStep: pipelineStep as MoyinStore["pipelineStep"],
					pipelineProgress: {
						...current,
						[pipelineStep]: progress >= 100 ? "done" : "active",
					},
				});
			},
		});

		const scriptData = novelResultToScriptData(result);

		set({
			rawScript: novelText,
			scriptData,
			characters: scriptData.characters ?? [],
			scenes: scriptData.scenes ?? [],
			episodes: scriptData.episodes ?? [],
			shots: [],
			parseStatus: "ready",
			activeStep: "characters",
			pipelineStep: "import",
			pipelineProgress: {
				import: "done",
				title_calibration: "pending",
				synopsis: "pending",
				shot_calibration: "pending",
				character_calibration: "pending",
				scene_calibration: "pending",
			},
			shotGenerationStatus: {},
			selectedShotIds: new Set<string>(),
		});
	} catch (error) {
		set({
			parseStatus: "error",
			parseError:
				error instanceof Error ? error.message : "Novel import failed",
			pipelineProgress: {
				...get().pipelineProgress,
				import: "error",
			},
		});
	}
}

// ─── Example Novel ──────────────────────────────────────────────────

export const EXAMPLE_NOVEL_EN = `The Last Light of Autumn

The maple leaves drifted down like burning embers as Lin Wei stood at the edge of the old stone bridge. She hadn't been back to Qinghe Village in seven years — not since her grandmother's funeral, not since the argument with her father that had sent her running to Shanghai with nothing but a backpack and a fierce determination to never look back.

Now she was back, and everything was smaller than she remembered.

"You look lost," said a voice behind her.

She turned. A young man in a faded blue jacket sat on the bridge railing, sketching in a worn notebook. His charcoal-smudged fingers paused mid-stroke.

"I grew up here," Lin Wei said.

"Ah." He closed the notebook. "Then you're more lost than I thought."

His name was Jiang Hao, the village's new art teacher — the only teacher, really, since the school had shrunk to twelve students. He'd come from Beijing two years ago, chasing something he couldn't name, and found it in the way morning mist curled through the bamboo groves.

They walked together through the village. The old tea house where her grandmother used to play mahjong was now a convenience store. The persimmon tree in the town square had been cut down. But the river still sang the same song, and the mountains still held the sky like cupped hands.

"Why did you come back?" Jiang Hao asked.

Lin Wei pulled a crumpled letter from her coat pocket. "My father is sick. He wrote to me for the first time in seven years." She stared at the familiar handwriting. "Three sentences. 'I am not well. The house needs fixing. Come if you want.'"

"That's four sentences," Jiang Hao said.

Despite everything, she laughed.

Her father's house stood at the end of a dirt path overgrown with wild chrysanthemums. The roof tiles were cracked, and the wooden door hung slightly askew. Through the window, she could see a single lamp burning.

Lin Wei stood there for a long time, the autumn wind pulling at her hair, the letter crushed in her fist. Then she raised her hand and knocked.`;

export const EXAMPLE_NOVEL_ZH = `秋天最后的光

枫叶像燃烧的余烬一样飘落，林薇站在古老的石桥边。她已经七年没有回清河村了——自从奶奶的葬礼之后，自从和父亲的那场争吵把她逼到上海，身上只有一个背包和一股再也不回头的决心。

现在她回来了，一切都比记忆中小了许多。

"你看起来迷路了。"身后传来一个声音。

她转过身。一个穿着褪色蓝夹克的年轻人坐在桥栏上，在一本旧笔记本上画素描。他沾满炭粉的手指在半空中停住了。

"我在这里长大的。"林薇说。

"啊。"他合上了笔记本。"那你比我想的更迷路了。"

他叫江浩，是村里新来的美术老师——其实也是唯一的老师，因为学校已经缩减到只剩十二个学生。他两年前从北京来，追寻着某种说不清的东西，最后在晨雾穿过竹林的样子里找到了它。

他们一起穿过村子。奶奶以前打麻将的老茶馆变成了便利店。广场上的柿子树被砍掉了。但河水还是唱着同样的歌，山峦依然像合拢的双手一样托着天空。

"你为什么回来？"江浩问。

林薇从外套口袋里掏出一封皱巴巴的信。"我父亲病了。他七年来第一次给我写信。"她盯着那熟悉的笔迹。"三句话。'我身体不太好。房子需要修。想来就来。'"

"那是四句话。"江浩说。

尽管一切，她还是笑了。

父亲的房子在一条长满野菊花的土路尽头。屋顶的瓦片已经裂开，木门微微歪斜。透过窗户，她能看到一盏孤灯在燃烧。

林薇在那里站了很久，秋风拉扯着她的头发，信被她攥在拳头里。然后她举起手，敲了门。`;
