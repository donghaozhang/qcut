/**
 * Prompt templates for novel-to-script parsing (main process copy).
 *
 * Mirrors apps/web/src/lib/moyin/script/novel-prompts.ts.
 * Kept in electron/ because the electron tsconfig cannot import from apps/web/.
 */

const CHARACTER_ANALYSIS_ZH = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5F71\u89C6\u7F16\u5267\uFF0C\u64C5\u957F\u4ECE\u5C0F\u8BF4\u6587\u672C\u4E2D\u63D0\u53D6\u89D2\u8272\u4FE1\u606F\u3002

\u8BF7\u5206\u6790\u4EE5\u4E0B\u5C0F\u8BF4\u6587\u672C\uFF0C\u63D0\u53D6\u6240\u6709\u91CD\u8981\u89D2\u8272\u3002

\u5DF2\u6709\u89D2\u8272\u5E93: {characters_lib_name}

\u8981\u6C42:
1. \u63D0\u53D6\u6BCF\u4E2A\u89D2\u8272\u7684\u59D3\u540D\u3001\u7B80\u4ECB\u3001\u5916\u8C8C\u7279\u5F81\u3001\u6027\u522B\u3001\u5E74\u9F84
2. \u5982\u679C\u89D2\u8272\u5DF2\u5728\u89D2\u8272\u5E93\u4E2D\uFF0C\u66F4\u65B0\u5176\u4FE1\u606F
3. \u5982\u679C\u53D1\u73B0\u65B0\u89D2\u8272\uFF0C\u6DFB\u52A0\u5230\u5217\u8868\u4E2D
4. \u53EA\u63D0\u53D6\u6709\u5B9E\u8D28\u620F\u4EFD\u7684\u89D2\u8272\uFF0C\u5FFD\u7565\u4E00\u7B14\u5E26\u8FC7\u7684\u8DEF\u4EBA

\u8BF7\u4EE5JSON\u683C\u5F0F\u8FD4\u56DE:
{
  "characters": [
    {
      "name": "\u89D2\u8272\u540D",
      "introduction": "\u89D2\u8272\u7B80\u4ECB\uFF08\u4E00\u53E5\u8BDD\uFF09",
      "visualTraits": "\u5916\u8C8C\u63CF\u8FF0",
      "gender": "\u7537/\u5973/\u672A\u77E5",
      "age": "\u5E74\u9F84\u6216\u5E74\u9F84\u6BB5"
    }
  ]
}

\u5C0F\u8BF4\u6587\u672C:
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

const LOCATION_ANALYSIS_ZH = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5F71\u89C6\u7F16\u5267\uFF0C\u64C5\u957F\u4ECE\u5C0F\u8BF4\u6587\u672C\u4E2D\u63D0\u53D6\u573A\u666F/\u5730\u70B9\u4FE1\u606F\u3002

\u8BF7\u5206\u6790\u4EE5\u4E0B\u5C0F\u8BF4\u6587\u672C\uFF0C\u63D0\u53D6\u6240\u6709\u91CD\u8981\u573A\u666F\u3002

\u5DF2\u6709\u573A\u666F\u5E93: {locations_lib_name}

\u8981\u6C42:
1. \u63D0\u53D6\u6BCF\u4E2A\u573A\u666F\u7684\u540D\u79F0\u3001\u63CF\u8FF0\u3001\u65F6\u95F4\uFF08\u65E5/\u591C/\u9ECE\u660E/\u9EC4\u660F\uFF09\u3001\u6C1B\u56F4
2. \u573A\u666F\u540D\u79F0\u8981\u7B80\u6D01\uFF0C\u5982\u201C\u9152\u9986\u201D\u3001\u201C\u57CE\u95E8\u5916\u201D\u3001\u201C\u4E66\u623F\u201D
3. \u5982\u679C\u573A\u666F\u5DF2\u5728\u573A\u666F\u5E93\u4E2D\uFF0C\u66F4\u65B0\u5176\u4FE1\u606F

\u8BF7\u4EE5JSON\u683C\u5F0F\u8FD4\u56DE:
{
  "locations": [
    {
      "name": "\u573A\u666F\u540D",
      "description": "\u573A\u666F\u63CF\u8FF0",
      "time": "day/night/dawn/dusk",
      "atmosphere": "\u6C1B\u56F4\u63CF\u8FF0"
    }
  ]
}

\u5C0F\u8BF4\u6587\u672C:
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

const CLIP_SPLIT_ZH = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5F71\u89C6\u7F16\u5267\u3002\u8BF7\u5C06\u4EE5\u4E0B\u5C0F\u8BF4\u6587\u672C\u5207\u5206\u4E3A\u591A\u4E2A\u72EC\u7ACB\u7684\u201C\u7247\u6BB5\u201D\uFF08clip\uFF09\uFF0C\u6BCF\u4E2A\u7247\u6BB5\u9002\u5408\u6539\u7F16\u4E3A\u4E00\u6BB5\u89C6\u9891\u573A\u666F\u3002

\u89D2\u8272\u5E93: {characters_lib_name}
\u89D2\u8272\u4ECB\u7ECD: {characters_introduction}
\u573A\u666F\u5E93: {locations_lib_name}

\u5207\u5206\u8981\u6C42:
1. \u6BCF\u4E2A\u7247\u6BB5\u5FC5\u987B\u6709\u660E\u786E\u7684\u5F00\u5934\u548C\u7ED3\u5C3E\u951A\u70B9\uFF08\u539F\u6587\u4E2D\u80FD\u627E\u5230\u7684\u6587\u5B57\uFF09
2. \u7247\u6BB5\u4E4B\u95F4\u4E0D\u91CD\u53E0\uFF0C\u6309\u987A\u5E8F\u8986\u76D6\u5168\u6587
3. \u6BCF\u4E2A\u7247\u6BB5\u5E94\u5305\u542B\u4E00\u4E2A\u5B8C\u6574\u7684\u53D9\u4E8B\u5355\u5143\uFF08\u4E00\u4E2A\u4E8B\u4EF6/\u4E00\u6BB5\u5BF9\u8BDD/\u4E00\u4E2A\u52A8\u4F5C\u5E8F\u5217\uFF09
4. \u6807\u6CE8\u6BCF\u4E2A\u7247\u6BB5\u6D89\u53CA\u7684\u89D2\u8272\u548C\u573A\u666F

\u8BF7\u4EE5JSON\u6570\u7EC4\u683C\u5F0F\u8FD4\u56DE:
[
  {
    "start": "\u7247\u6BB5\u5F00\u5934\u7684\u539F\u6587\u6587\u5B57\uFF088-20\u5B57\uFF09",
    "end": "\u7247\u6BB5\u7ED3\u5C3E\u7684\u539F\u6587\u6587\u5B57\uFF088-20\u5B57\uFF09",
    "summary": "\u7247\u6BB5\u6982\u8981\uFF08\u4E00\u53E5\u8BDD\uFF09",
    "characters": ["\u89D2\u83721", "\u89D2\u83722"],
    "location": "\u573A\u666F\u540D"
  }
]

\u5C0F\u8BF4\u6587\u672C:
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

const SCREENPLAY_CONVERSION_ZH = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5F71\u89C6\u7F16\u5267\u3002\u8BF7\u5C06\u4EE5\u4E0B\u5C0F\u8BF4\u7247\u6BB5\u8F6C\u6362\u4E3A\u6807\u51C6\u5267\u672C\u683C\u5F0F\u3002

\u89D2\u8272\u5E93: {characters_lib_name}
\u89D2\u8272\u4ECB\u7ECD: {characters_introduction}
\u573A\u666F\u5E93: {locations_lib_name}

\u8981\u6C42:
1. \u6BCF\u4E2A\u573A\u666F\u5305\u542B\u573A\u666F\u540D\u3001\u65F6\u95F4\u3001\u52A8\u4F5C\u63CF\u5199\u3001\u5BF9\u8BDD
2. \u5BF9\u8BDD\u9700\u6807\u6CE8\u89D2\u8272\u540D\u548C\u8868\u6F14\u6307\u5BFC\uFF08\u5982\u6709\uFF09
3. \u4FDD\u7559\u539F\u6587\u7684\u53D9\u4E8B\u98CE\u683C\u548C\u60C5\u611F

\u8BF7\u4EE5JSON\u683C\u5F0F\u8FD4\u56DE:
{
  "scenes": [
    {
      "location": "\u573A\u666F\u540D",
      "time": "day/night/dawn/dusk",
      "action": "\u52A8\u4F5C/\u573A\u666F\u63CF\u5199",
      "dialogue": [
        {
          "character": "\u89D2\u8272\u540D",
          "line": "\u53F0\u8BCD",
          "direction": "\u8868\u6F14\u6307\u5BFC\uFF08\u53EF\u9009\uFF09"
        }
      ]
    }
  ]
}

\u5C0F\u8BF4\u7247\u6BB5:
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

export function getCharacterAnalysisPrompt(language: string): string {
	return language === "zh" ? CHARACTER_ANALYSIS_ZH : CHARACTER_ANALYSIS_EN;
}

export function getLocationAnalysisPrompt(language: string): string {
	return language === "zh" ? LOCATION_ANALYSIS_ZH : LOCATION_ANALYSIS_EN;
}

export function getClipSplitPrompt(language: string): string {
	const base = language === "zh" ? CLIP_SPLIT_ZH : CLIP_SPLIT_EN;
	return base + CLIP_BOUNDARY_SUFFIX;
}

export function getScreenplayConversionPrompt(language: string): string {
	return language === "zh"
		? SCREENPLAY_CONVERSION_ZH
		: SCREENPLAY_CONVERSION_EN;
}
