/**
 * Prompt templates for novel-to-script parsing.
 *
 * Each template supports `{input}`, `{characters_lib_name}`,
 * `{locations_lib_name}`, `{characters_introduction}` placeholders.
 *
 * Bilingual: Chinese (zh) and English (en).
 */

// ─── Character Analysis ─────────────────────────────────────────────

const CHARACTER_ANALYSIS_ZH = `你是一位专业的影视编剧，擅长从小说文本中提取角色信息。

请分析以下小说文本，提取所有重要角色。

已有角色库: {characters_lib_name}

要求:
1. 提取每个角色的姓名、简介、外貌特征、性别、年龄
2. 如果角色已在角色库中，更新其信息
3. 如果发现新角色，添加到列表中
4. 只提取有实质戏份的角色，忽略一笔带过的路人

请以JSON格式返回:
{
  "characters": [
    {
      "name": "角色名",
      "introduction": "角色简介（一句话）",
      "visualTraits": "外貌描述",
      "gender": "男/女/未知",
      "age": "年龄或年龄段"
    }
  ]
}

小说文本:
{input}`;

const CHARACTER_ANALYSIS_EN = `You are a professional screenwriter skilled at extracting character information from novel text.

Analyze the following novel text and extract all important characters.

Existing character library: {characters_lib_name}

Requirements:
1. Extract each character's name, introduction, visual traits, gender, and age
2. If a character already exists in the library, update their information
3. If new characters are found, add them to the list
4. Only extract characters with substantial roles; ignore minor passersby

Return in JSON format:
{
  "characters": [
    {
      "name": "Character Name",
      "introduction": "One-line character introduction",
      "visualTraits": "Visual description",
      "gender": "male/female/unknown",
      "age": "Age or age range"
    }
  ]
}

Novel text:
{input}`;

// ─── Location Analysis ──────────────────────────────────────────────

const LOCATION_ANALYSIS_ZH = `你是一位专业的影视编剧，擅长从小说文本中提取场景/地点信息。

请分析以下小说文本，提取所有重要场景。

已有场景库: {locations_lib_name}

要求:
1. 提取每个场景的名称、描述、时间（日/夜/黎明/黄昏）、氛围
2. 场景名称要简洁，如"酒馆"、"城门外"、"书房"
3. 如果场景已在场景库中，更新其信息

请以JSON格式返回:
{
  "locations": [
    {
      "name": "场景名",
      "description": "场景描述",
      "time": "day/night/dawn/dusk",
      "atmosphere": "氛围描述"
    }
  ]
}

小说文本:
{input}`;

const LOCATION_ANALYSIS_EN = `You are a professional screenwriter skilled at extracting location information from novel text.

Analyze the following novel text and extract all important locations/settings.

Existing location library: {locations_lib_name}

Requirements:
1. Extract each location's name, description, time of day (day/night/dawn/dusk), and atmosphere
2. Location names should be concise, e.g., "Tavern", "City Gate", "Study Room"
3. If a location already exists in the library, update its information

Return in JSON format:
{
  "locations": [
    {
      "name": "Location Name",
      "description": "Location description",
      "time": "day/night/dawn/dusk",
      "atmosphere": "Atmosphere description"
    }
  ]
}

Novel text:
{input}`;

// ─── Clip Splitting ─────────────────────────────────────────────────

const CLIP_SPLIT_ZH = `你是一位专业的影视编剧。请将以下小说文本切分为多个独立的"片段"（clip），每个片段适合改编为一段视频场景。

角色库: {characters_lib_name}
角色介绍: {characters_introduction}
场景库: {locations_lib_name}

切分要求:
1. 每个片段必须有明确的开头和结尾锚点（原文中能找到的文字）
2. 片段之间不重叠，按顺序覆盖全文
3. 每个片段应包含一个完整的叙事单元（一个事件/一段对话/一个动作序列）
4. 标注每个片段涉及的角色和场景

请以JSON数组格式返回:
[
  {
    "start": "片段开头的原文文字（8-20字）",
    "end": "片段结尾的原文文字（8-20字）",
    "summary": "片段概要（一句话）",
    "characters": ["角色1", "角色2"],
    "location": "场景名"
  }
]

小说文本:
{input}`;

const CLIP_SPLIT_EN = `You are a professional screenwriter. Split the following novel text into multiple independent "clips", each suitable for adaptation into a video scene.

Character library: {characters_lib_name}
Character introductions: {characters_introduction}
Location library: {locations_lib_name}

Splitting requirements:
1. Each clip must have clear start and end anchors (text that can be found in the original)
2. Clips must not overlap and should cover the full text in order
3. Each clip should contain a complete narrative unit (one event/one dialogue/one action sequence)
4. Label each clip's characters and location

Return as a JSON array:
[
  {
    "start": "Opening text from the original (8-20 words)",
    "end": "Ending text from the original (8-20 words)",
    "summary": "One-line clip summary",
    "characters": ["Character1", "Character2"],
    "location": "Location Name"
  }
]

Novel text:
{input}`;

const CLIP_BOUNDARY_SUFFIX = `

[Boundary Constraints]
1. The "start" and "end" anchors must come from the original text and be locatable.
2. Allow punctuation/whitespace differences, but do not rewrite key entities or events.
3. If anchors cannot be located reliably, return [] directly.`;

// ─── Screenplay Conversion ──────────────────────────────────────────

const SCREENPLAY_CONVERSION_ZH = `你是一位专业的影视编剧。请将以下小说片段转换为标准剧本格式。

角色库: {characters_lib_name}
角色介绍: {characters_introduction}
场景库: {locations_lib_name}

要求:
1. 每个场景包含场景名、时间、动作描写、对话
2. 对话需标注角色名和表演指导（如有）
3. 保留原文的叙事风格和情感

请以JSON格式返回:
{
  "scenes": [
    {
      "location": "场景名",
      "time": "day/night/dawn/dusk",
      "action": "动作/场景描写",
      "dialogue": [
        {
          "character": "角色名",
          "line": "台词",
          "direction": "表演指导（可选）"
        }
      ]
    }
  ]
}

小说片段:
{clip_content}`;

const SCREENPLAY_CONVERSION_EN = `You are a professional screenwriter. Convert the following novel clip into standard screenplay format.

Character library: {characters_lib_name}
Character introductions: {characters_introduction}
Location library: {locations_lib_name}

Requirements:
1. Each scene should include location, time of day, action description, and dialogue
2. Dialogue should include character name and acting direction (if applicable)
3. Preserve the original narrative style and emotion

Return in JSON format:
{
  "scenes": [
    {
      "location": "Location Name",
      "time": "day/night/dawn/dusk",
      "action": "Action/scene description",
      "dialogue": [
        {
          "character": "Character Name",
          "line": "Dialogue line",
          "direction": "Acting direction (optional)"
        }
      ]
    }
  ]
}

Novel clip:
{clip_content}`;

// ─── Public API ─────────────────────────────────────────────────────

/** Return the character-analysis prompt template for the target language. */
export function getCharacterAnalysisPrompt(language: string): string {
	return language === "zh" ? CHARACTER_ANALYSIS_ZH : CHARACTER_ANALYSIS_EN;
}

/** Return the location-analysis prompt template for the target language. */
export function getLocationAnalysisPrompt(language: string): string {
	return language === "zh" ? LOCATION_ANALYSIS_ZH : LOCATION_ANALYSIS_EN;
}

/** Return the clip-splitting prompt plus boundary constraints suffix. */
export function getClipSplitPrompt(language: string): string {
	const base = language === "zh" ? CLIP_SPLIT_ZH : CLIP_SPLIT_EN;
	return base + CLIP_BOUNDARY_SUFFIX;
}

/** Return the screenplay-conversion prompt template for the language. */
export function getScreenplayConversionPrompt(language: string): string {
	return language === "zh"
		? SCREENPLAY_CONVERSION_ZH
		: SCREENPLAY_CONVERSION_EN;
}
